# LiteRT-LM Demo Optimization Design

## Purpose

Aura should not merely "use a local LLM." For the hackathon build, every LiteRT-LM optimization must become visible in the product within two minutes. The judge should be able to see the engine warm up, watch graph generation stream, see prefetch complete before a click, watch chat preempt background work, and verify the app stays fully local.

This document defines the demo-optimized engineering plan for using LiteRT-LM in Aura.

## Demo Surface Rule

Every optimization must have a visible artifact in the UI or telemetry HUD.

If a judge cannot see the behavior in the app or HUD, it does not belong in the hackathon version.

Examples:

- Priority scheduling is visible as `Queue: chat_reply active -> prefetch_node_3 paused`.
- Prefetch is visible as `Prefetch: Node 2 ready` and `Cache hit - 0ms` when clicked.
- MTP is visible through an A/B toggle with side-by-side tokens/sec.
- Offline execution is visible through `Network: 0 non-localhost bytes`.
- Tool calling is visible as `Tool: insert_repair -> node added`.

## Fully Offline By Design

Aura's production lesson path must run on local Gemma through LiteRT-LM. No cloud fallback is allowed in the demo path. If LiteRT-LM is not ready, the app should show a setup screen rather than silently switching to a remote model.

## Demo Beats

### Beat 1: It's Alive

The judge launches Aura and immediately sees the local engine start.

Visible UI:

```txt
Loading Gemma 4 E2B
Backend: GPU
MTP: enabled
Model: gemma-4-E2B-it.litertlm
Engine: warming
Network: 0 non-localhost bytes
```

Implementation:

- Start LiteRT-LM with explicit backend and MTP flags.
- Health check the backend before showing the main app.
- Capture startup command, backend mode, model name, MTP state, process RSS, and warmup time.
- Show a cold-start progress screen instead of a blank app.

Suggested startup command:

```bash
litert-lm serve \
  --api gemini \
  --port 8080 \
  --backend=gpu \
  --enable-speculative-decoding=true
```

Demo surface:

- HUD shows model, backend, MTP, memory, and local-only network state.
- Startup log is visible in the debug panel.

### Beat 2: It Thinks In Graphs

The student enters a topic or drops a textbook image. Aura generates a knowledge graph, not a chat answer.

Visible UI:

```txt
Job: graph_plan
TTFT: 940 ms
Decode: 31 tok/s
Nodes: 0 -> 3 -> 7 -> 10
Edges: 0 -> 4 -> 9
```

Implementation:

- Stream graph planning progress to the frontend.
- Animate nodes as they arrive or as soon as the graph parse completes.
- Record TTFT, decode speed, total tokens, and graph node count.

Demo surface:

- Knowledge map visibly grows.
- HUD proves this was a local generation job with measured latency.

### Beat 3: It Teaches

Aura streams the first lecture card while prefetching the next card or node.

Visible UI:

```txt
Active: current_card node_1
Prefetch: node_2_card loading
Queue: current_card active -> prefetch_node_2 waiting
```

When prefetch resolves:

```txt
Prefetch: node_2 ready
```

When the user clicks node 2:

```txt
Cache hit - 0ms
```

Implementation:

- Generate visible cards progressively.
- Start background prefetch after the first card is shown.
- Store prefetched output by `sessionId + graphVersion + nodeId + cardPolicyVersion`.
- Invalidate prefetch when learner state changes in a way that affects the node.

Demo surface:

- The user clicks the next node and it opens instantly.
- HUD flashes `Prefetch hit`.

### Beat 4: It Responds

The user asks a parallel chat question or says "quiz me" while background prefetch is running. Chat takes priority.

Visible UI:

```txt
Before:
Queue: prefetch_node_3 active

User asks:
"quiz me"

After:
Queue: chat_reply active -> prefetch_node_3 paused
Tool: create_quiz
```

Implementation:

- Route all model work through an Aura inference broker.
- Give chat, answer evaluation, and visible hints higher priority than background generation.
- Cancel or pause background jobs when user-facing jobs arrive.
- Resume safe prefetch after the interactive job finishes.

Demo surface:

- HUD shows priority swap.
- The user gets a response without waiting for background lecture generation to finish.

### Beat 5: It Sees

The user drops a textbook photo. Aura uses Gemma 4 multimodal input to create a graph from the image.

Visible UI:

```txt
Input: image
Job: image_to_graph
Vision: enabled
Extracted topic: Trigonometric ratios
Graph: 9 nodes
```

Implementation:

- Accept image upload in the setup screen.
- Send image to LiteRT-LM through the Gemini-compatible `generateContent` path using `inlineData` in `parts`.
- Ask Gemma to extract topic, grade level if visible, key concepts, formulas, and common exercise types.
- Feed that normalized result into the same graph schema used for text topics.

Request shape:

```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "Create an Aura lesson graph from this textbook image. Return the standard graph schema." },
      {
        "inlineData": {
          "mimeType": "image/jpeg",
          "data": "<base64>"
        }
      }
    ]
  }]
}
```

Demo surface:

- Textbook photo turns into the same animated graph as a typed topic.
- HUD shows `Input: image` and `Vision: enabled`.

### Beat 6: It's Local

The judge sees the trust story as measured telemetry, not a claim.

Visible UI:

```txt
Airplane mode: on
Network: 0 non-localhost bytes
API keys: none
Model: local .litertlm
Memory: 1.6 GB RSS
Cloud calls: 0
```

Implementation:

- Track non-localhost network requests from the backend.
- Keep a cumulative byte counter.
- Add an "Offline Proof" panel in the HUD.
- Optionally add a demo-only "airplane mode checklist" that verifies no remote endpoints are configured.

Demo surface:

- The app keeps generating while network is unavailable.
- HUD shows zero external traffic.

## Telemetry HUD

The HUD is a first-class system. It is not a debug afterthought. It is how the app proves LiteRT-LM is doing useful work.

### HUD Fields

| Field | Source | Update Timing |
|---|---|---|
| Model | backend config / LiteRT-LM model list | startup |
| Backend | startup command and successful health probe | startup |
| MTP | startup flag | startup and toggle |
| Engine state | health endpoint | every 1s during startup, then every 5s |
| Active job | broker state | realtime |
| Queue state | broker queue | realtime |
| Paused/cancelled jobs | broker events | realtime |
| TTFT | request send to first SSE chunk | per streaming job |
| Decode speed | streamed chunk/token count over time | per streaming job |
| Prefetch state | prefetch cache | realtime |
| Prefetch hit | node/card cache lookup | on click |
| Tool call | model tool-call response and backend execution | per tool call |
| Network bytes | backend request instrumentation | cumulative |
| Memory RSS | OS process memory | every 2s |
| Cloud calls | backend remote-call counter | cumulative |

### HUD Example

```txt
LiteRT-LM
Model: gemma-4-E2B-it
Backend: GPU
MTP: on
Engine: warm
Memory: 1.6 GB

Inference
Active: chat_reply
Queue: prefetch_node_3 paused, card_polish waiting
TTFT: 810 ms
Decode: 38 tok/s

Local Proof
Network: 0 external bytes
Cloud calls: 0
API keys: none
```

## MTP A/B Toggle

The MTP toggle is a designed demo feature because it proves causality.

Demo script:

1. Generate the same card with MTP on.
2. Show TTFT and decode speed.
3. Toggle MTP off.
4. Restart LiteRT-LM without `--enable-speculative-decoding`.
5. Re-run the same prompt.
6. Show both runs side by side.

Visible UI:

```txt
Same prompt, same model, same hardware

MTP on:  42 tok/s
MTP off: 21 tok/s
Delta:   2.0x
```

Implementation:

- Store a deterministic benchmark prompt.
- Use low temperature for repeatability.
- Restart the LiteRT-LM server with and without MTP.
- Persist the two benchmark results in the HUD until cleared.

Note:

Restarting may take several seconds. That is acceptable for the demo if the UI shows a clear progress state:

```txt
Restarting LiteRT-LM without MTP...
```

## Inference Broker

All LLM calls go through one broker. The broker is the control plane that makes the single local runtime feel responsive.

```txt
Backend API
  |
InferenceBroker
  |- active job
  |- priority queue
  |- prefetch cache
  |- telemetry stream
  |- cancellation registry
  |
LiteRT-LM Gemini-compatible HTTP server
```

### Job Types

```ts
type InferenceJobType =
  | "graph_plan"
  | "image_to_graph"
  | "current_card"
  | "prefetch_card"
  | "prefetch_node"
  | "chat_reply"
  | "answer_tool_call"
  | "repair_card"
  | "create_quiz"
  | "mtp_benchmark";
```

### Priority Order

```txt
P0 chat_reply
P1 answer_tool_call
P2 visible hint or current card
P3 repair card
P4 prefetch card
P5 prefetch node
P6 graph polish or background cleanup
```

Rules:

- `P0` and `P1` preempt background jobs.
- Background jobs must be cancellable.
- Only one active LiteRT-LM HTTP generation runs by default.
- The broker may run non-LLM local validators in parallel.
- Every queue transition emits a HUD event.

### Demo Surface

The queue must always be visible:

```txt
Queue: chat_reply active -> prefetch_node_3 paused -> repair_card waiting
```

## Lecture Generation Optimization

Current generation does too much model work per node. The hackathon path should optimize for first visible card and prefetch.

Recommended flow:

```txt
1. Generate card plan.
2. Generate first card immediately.
3. Show first card.
4. Prefetch next card in background.
5. Run local validators.
6. Only call Gemma for polish if validators fail.
```

Local validators:

- card count valid
- exactly one exit question
- no banned phrase
- no emoji in tutor text
- no duplicate body hash
- no overlong sentence threshold
- all card IDs and node IDs valid

Conditional polish:

```txt
if local_validators_pass:
  skip polish
else:
  run targeted rewrite for failed cards only
```

Demo surface:

- HUD shows `Polish skipped: local validators passed`.
- Or `Rewrite: banned phrase removed` when a repair is needed.

## Chat And Teaching Together

Chat is not a separate chatbot. It is a node-scoped tutor tool.

Chat prompt includes:

- active node
- current card summary
- learner's last answer
- current misconception tags
- allowed tools

Chat prompt excludes:

- full lesson history unless summarized
- full graph unless needed
- raw hidden reasoning

Chat tools:

```ts
type ChatToolCall =
  | { type: "give_hint"; nodeId: string }
  | { type: "create_quiz"; nodeId: string; difficulty: "gentle" | "normal" }
  | { type: "explain_current_step"; nodeId: string }
  | { type: "insert_repair"; nodeId: string; issue: string };
```

Demo surface:

- User types "quiz me."
- HUD shows `Tool: create_quiz`.
- Background prefetch pauses.
- Quiz appears without leaving the node.

## Answer Evaluation Through Tool Calling

Answer evaluation should be a tool-call flow, not a prose JSON blob.

Flow:

```txt
Student answer
  -> Gemma decides tool call
  -> Backend validates tool arguments
  -> Backend mutates graph/session state
  -> Aura shows result
```

Tool definitions:

```ts
type AnswerToolCall =
  | { type: "mark_pass"; nodeId: string; evidence: string }
  | { type: "mark_partial"; nodeId: string; issue: string; nextAction: "hint" | "parallel_problem" }
  | { type: "give_hint"; nodeId: string; issue: string }
  | { type: "insert_repair"; parentNodeId: string; repairFocus: string };
```

Backend rules:

- Validate every node ID.
- Reject unknown tool names.
- Reject malformed arguments.
- Keep model-generated IDs advisory only.
- Code owns final state.

Demo surface:

```txt
Tool: mark_partial
Issue: opposite_adjacent_confusion
Action: insert_repair
Graph: +1 repair node
```

If native LiteRT-LM tool calling is not exposed through the current HTTP serve mode, implement the same envelope as constrained JSON for the hackathon, but keep the UI and broker interface named as tool calls. This keeps the app architecture ready for native tool calling without blocking the demo.

## Multimodal Image Pipeline

Aura supports two graph entry paths:

```txt
Text topic -> graph -> cards
Image input -> graph -> cards
```

Image pipeline:

```txt
Upload image
  -> resize/compress to safe JPEG
  -> send as inlineData to Gemma
  -> extract topic/concepts/formulas
  -> build standard graph schema
  -> generate first card
```

Image safety constraints:

- Convert to JPEG or PNG.
- Cap longest side before sending.
- Log original and sent dimensions.
- Show image token/size estimate if available.

Demo surface:

- The setup screen accepts a textbook photo.
- HUD shows `Input: image`.
- The generated graph appears from the image content.

## Cold-Start UX

First run must feel intentional.

Startup sequence:

```txt
1. Launch Aura.
2. Show "Loading Gemma 4 E2B."
3. Show backend, model path, MTP, and GPU status.
4. Show memory rising as model loads.
5. Run a tiny warmup prompt.
6. Show "Engine warm."
7. Enter main UI.
```

Failure state:

```txt
LiteRT-LM setup required
Expected model: gemma-4-E2B-it
Expected port: 8080
No cloud fallback was used
```

Demo surface:

- No blank screen.
- No hidden terminal-only failure.
- The local model state is visible before the lesson starts.

## LiteRT-LM Features Scoreboard

This table should appear in the README and optionally in a demo modal.

| Feature | Where In Aura | Without LiteRT-LM |
|---|---|---|
| GPU backend | Startup command, HUD backend row | CPU-only path, slower generation |
| MTP speculative decoding | Server flag, A/B toggle, benchmark panel | No visible speedup proof |
| Streaming generation | Graph, cards, chat | Spinner then full response dump |
| Tool calling | Answer eval, quiz, repair actions | Fragile raw text parsing |
| Multimodal image input | Textbook photo to graph | Text-only topic input |
| Offline local deployment | Airplane mode proof, 0 external bytes | Requires API key and internet |
| `.litertlm` optimized model | Startup model row, memory HUD | Larger or less optimized local model path |
| Priority scheduling | Queue HUD | Random request ordering and UI stalls |
| Prefetch cache | `Cache hit - 0ms` node clicks | Every node waits for generation |

## Implementation Plan By Demo Beat

### Beat 1 Deliverables: It's Alive

- Add cold-start screen.
- Capture LiteRT-LM startup flags.
- Add `/health` fields for backend, MTP, model, memory, and warmup.
- Show setup-required UI when the runtime is missing.

### Beat 2 Deliverables: It Thinks In Graphs

- Add graph-generation telemetry events.
- Animate graph nodes after generation.
- Show TTFT and decode speed in HUD.

### Beat 3 Deliverables: It Teaches

- Add `InferenceBroker`.
- Add priority queue and visible queue state.
- Add prefetch for next card/node.
- Add prefetch cache hit HUD event.
- Make polish conditional on local validators.

### Beat 4 Deliverables: It Responds

- Add node-scoped chat endpoint.
- Route chat through P0 broker priority.
- Add chat tool-call envelope.
- Show tool calls in HUD.

### Beat 5 Deliverables: It Sees

- Add image upload to setup screen.
- Add backend image-to-graph endpoint.
- Send image as Gemini `inlineData`.
- Reuse existing graph schema and card generation.

### Beat 6 Deliverables: It's Local

- Add network byte instrumentation.
- Add cloud-call counter.
- Add offline proof HUD panel.
- Add README scoreboard.

## Success Metrics

Hackathon targets:

- Cold-start screen appears immediately.
- Engine health visible before lesson generation.
- First graph generation shows TTFT and tok/s.
- First card streams before full node generation completes.
- Clicking a prefetched node shows `Cache hit - 0ms`.
- Chat preempts background prefetch visibly.
- MTP A/B benchmark shows side-by-side decode speed.
- Textbook image produces a graph.
- External network bytes remain 0 during the demo.

## Recommended Immediate Code Changes

1. Add telemetry state to backend health and dev logs.
2. Add frontend HUD component.
3. Add `backend/src/llm/broker.ts` with one active LLM job and a visible priority queue.
4. Route `callLLM` and `callLLMJson` through the broker.
5. Add prefetch cache for node cards.
6. Make card polish conditional.
7. Add chat endpoint with priority preemption.
8. Add MTP restart/benchmark toggle.
9. Add image-to-graph endpoint.
10. Add README LiteRT-LM features scoreboard.

## Bottom Line

The hackathon version should optimize for visible proof:

```txt
local engine starts
graph streams
cards prefetch
chat preempts
tools mutate state
image becomes graph
MTP speedup is measurable
network stays at zero
```

That is a stronger LiteRT-LM showcase than an invisible backend optimization plan.
