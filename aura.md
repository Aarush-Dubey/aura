# Aura Technical Plan

## Product Idea

Aura is a privacy-first adaptive learning desktop app for neurodivergent students with ADHD and dyslexia.

There is no fixed curriculum. A student enters any topic, and Aura builds a personalized learning path around that student's current knowledge, pace, confusion patterns, and preferred learning style.

The core promise:

> The learning experience bends to the student instead of forcing the student to conform to the lesson.

## Core Learning Flow

When a student enters a topic such as `trigonometry`, Aura does not immediately generate a fixed lecture.

Aura runs this flow:

1. Create a local learning session.
2. Load the student profile from local storage.
3. Understand the topic.
4. Retrieve supporting web context using Exa Deep Search.
5. Build a nonlinear knowledge graph.
6. Diagnose the student's starting point.
7. Linearize the useful part of the graph into a temporary lesson path.
8. Teach one node at a time.
9. Use soft checks to estimate understanding.
10. Modify the lesson path or graph if the student struggles.
11. Update the student profile after the session.

## Student Intent

Aura must capture student intent at session start. The same topic can produce very different paths depending on why the student is learning it.

```ts
type StudentIntent = {
  goalType: "exam" | "curiosity" | "application" | "foundation"
  timeHorizon: "single_session" | "week" | "month"
  depthPreference: "intuition_only" | "working_knowledge" | "deep_mechanical"
}
```

These fields feed directly into deferral, linearization, mastery thresholds, and delivery mode.

Examples:

```text
exam:
prefer high-yield nodes, practice checks, and common mistake repair

curiosity:
prefer intuition, applications, and lower pressure depth

application:
prioritize nodes needed for the target use case

foundation:
include prerequisites more aggressively and defer shortcuts
```

Time horizon changes how much Aura should teach now:

```text
single_session:
defer enrichment aggressively and use lower path length

week:
include core path plus spaced reviews

month:
allow deeper graph expansion and durable mastery goals
```

Depth preference changes which nodes count as core:

```text
intuition_only:
proofs, derivations, and edge cases are usually deferred

working_knowledge:
include examples, procedures, and common applications

deep_mechanical:
include mechanism, derivation, and transfer problems
```

## Knowledge Graph vs Lesson Path

Aura separates two ideas:

```text
Knowledge Graph = everything that could be taught
Lesson Path = what Aura plans to teach right now
```

The graph is nonlinear.

The lesson delivery is linear because the student experiences it as a sequence of chat messages, examples, questions, and responses.

Aura first builds a graph, then creates a temporary linear path through it.

Example:

```text
Angles
-> Right Triangles
-> Side Names
-> Ratios
-> Sine
-> Cosine
-> Tangent
-> Applications
```

But this path is editable.

If the student struggles with `Ratios`, Aura can change:

```text
Ratios -> Sine
```

into:

```text
Ratios
-> Fraction Meaning
-> Part-to-Whole Comparison
-> Ratio Practice
-> Ratios Again
-> Sine
```

The graph is the source of truth.
The lesson path is the adaptive route.

## Graph Traversal

Aura traverses the graph node by node, but not blindly.

At each step:

1. Teach the current node.
2. Ask a soft comfort check.
3. Evaluate the student response.
4. Update mastery.
5. Decide what happens next.

Possible outcomes:

```text
Mastered  -> move to next node
Shaky     -> give one more example or practice node
Blocked   -> insert prerequisite or repair node
Not ready -> add bridge node before continuing
Bored     -> compress or skip
Curious   -> temporarily branch to related node
```

The traversal is graph-guided but student-controlled.

## Knowledge Node Shape

Each graph node is a teachable concept unit.

A node should store:

```ts
type KnowledgeNode = {
  id: string
  topicName: string
  teachingGoal: string

  prerequisites: string[]
  nextCandidates: string[]

  sourceTags: string[]
  keyTerms: string[]

  readinessCheck: SoftCheck
  comfortCheck: SoftCheck

  microLessonPlan: {
    intuition: string
    example: string
    visualIdea?: string
    practiceStyle: string
  }

  commonConfusions: string[]
  teachingHints: string[]

  repairStrategies: {
    confusion: string
    action: "reexplain" | "insert_prerequisite" | "split_node" | "give_example"
    suggestedNode?: string
  }[]

  status: "locked" | "ready" | "active" | "shaky" | "mastered" | "skipped" | "blocked"

  mastery: number
  evidence: string[]
}
```

## Soft Checks

Each node has two checks:

```text
readinessCheck = before teaching
comfortCheck = after teaching
```

These should not feel like tests.

Use language like:

```text
Quick vibe check...
Tiny check...
Just to make sure I am not going too fast...
What feels right here?
```

Avoid:

```text
Test:
Quiz:
Exam:
You failed:
```

Example node:

```json
{
  "id": "sine_ratio",
  "topicName": "Sine as a ratio",
  "teachingGoal": "Student understands sine as opposite side divided by hypotenuse.",
  "prerequisites": ["right_triangles", "side_names", "ratios"],
  "readinessCheck": {
    "prompt": "Quick vibe check: if I point to one angle in a right triangle, could you tell which side is opposite it?",
    "expectedIdea": "Student can identify the opposite side relative to an angle."
  },
  "comfortCheck": {
    "prompt": "Imagine the opposite side is 3 and the hypotenuse is 5. What two things is sine comparing?",
    "expectedIdea": "Opposite and hypotenuse, or 3 and 5."
  },
  "commonConfusions": [
    "Student thinks sine is a calculator button instead of a ratio.",
    "Student mixes opposite and hypotenuse.",
    "Student does not understand ratio as comparison."
  ]
}
```

## Teaching Context Packet

Aura should never send only the node name to the LLM.

Bad:

```text
Teach sine.
```

Good:

```text
Teach this node to this specific learner, at this exact point in the graph, using these sources, with these constraints.
```

Every teaching call should build a context packet:

```ts
type TeachingContext = {
  currentNode: KnowledgeNode

  prerequisiteContext: {
    id: string
    status: string
    mastery: number
    studentEvidence: string[]
  }[]

  nextNodeContext: {
    id: string
    reason: string
  }[]

  studentProfile: StudentProfile

  recentSessionHistory: {
    role: "student" | "assistant"
    message: string
  }[]

  sourceContext: {
    title: string
    url: string
    relevantSnippet: string
  }[]

  teachingInstruction: {
    mode: "teach_current_node"
    maxLength: string
    style: string
    mustInclude: string[]
    mustAvoid: string[]
  }
}
```

The most important context is selected context, not more context.

Do not dump the whole web or whole chat history.
Send only the most relevant source snippets, recent messages, prerequisite evidence, and current node details.

## Teaching Packet Example

For `sine_ratio`, Aura may send:

```json
{
  "currentNode": {
    "id": "sine_ratio",
    "topicName": "Sine as a ratio",
    "teachingGoal": "Student understands sine as opposite divided by hypotenuse.",
    "commonConfusions": [
      "Thinks sine is a button",
      "Mixes opposite and hypotenuse",
      "Does not understand ratio"
    ]
  },
  "prerequisiteContext": [
    {
      "id": "right_triangles",
      "status": "mastered",
      "studentEvidence": ["Correctly identified a 90 degree angle twice."]
    },
    {
      "id": "side_names",
      "status": "shaky",
      "studentEvidence": ["Needed a hint to identify opposite side."]
    },
    {
      "id": "ratios",
      "status": "mastered",
      "studentEvidence": ["Explained ratio as one thing compared to another."]
    }
  ],
  "studentProfile": {
    "readingMode": "short_chunks",
    "pace": "slow",
    "dyslexiaMode": true,
    "adhdSupport": true,
    "prefers": ["examples first", "visual language"],
    "avoid": ["formula first", "long paragraphs"]
  },
  "teachingInstruction": {
    "mode": "teach_current_node",
    "maxLength": "120 words",
    "style": "conversational",
    "mustInclude": [
      "one intuition",
      "one tiny example",
      "one soft comfort check"
    ],
    "mustAvoid": [
      "test language",
      "dense notation",
      "assuming prior confidence"
    ]
  }
}
```

## Adaptive Path Mutation

Aura needs operations to modify the lesson path:

```ts
insertBefore(targetNodeId, newNode)
insertAfter(currentNodeId, newNode)
replaceNode(nodeId, smallerNodes[])
skipNode(nodeId)
compressNode(nodeId)
branchTo(nodeId)
returnToPreviousPath()
```

Examples:

```ts
replaceNode("ratios", [
  "what_is_a_comparison",
  "fractions_as_relationships",
  "ratio_examples",
  "ratios_in_triangles"
])
```

This allows Aura to respond to struggle without making the student feel like they failed.

## Gamification

Aura's gamification should be based on progress, agency, and discovery.

Avoid:

```text
leaderboards
grades
punishing streaks
generic XP
high-pressure tests
```

Use:

```text
quest map
unlockable nodes
soft missions
support power-ups
visible progress
low-pressure boss missions
```

The knowledge graph becomes the game board.

Node states can become visual states:

```text
locked   = dimmed
ready    = glowing
active   = highlighted
shaky    = needs another pass
mastered = lit up
skipped  = dotted path
```

Remediation should feel like discovery:

```text
New stepping stone discovered: Ratio Intuition
```

not:

```text
You failed ratios.
```

## Gamified Learning Loop

```text
Choose topic
-> Aura creates map
-> Student enters first quest
-> Learns tiny concept
-> Soft challenge
-> Node lights up
-> New paths unlock
-> Confusion creates support quests
-> Final mission combines concepts
```

For trigonometry:

```text
Mission: Decode Sine
Goal: Figure out what sine is comparing
Reward: Unlock height and distance problems
```

For momentum:

```text
Mission: Stop the Moving Object
Goal: Predict what is harder to stop
Reward: Unlock collision problems
```

For quadratic equations:

```text
Mission: Find Where the Curve Lands
Goal: Understand roots as points where the graph hits zero
Reward: Unlock projectile motion applications
```

## Technical Stack

MVP stack:

```text
Desktop: Electron
Frontend: React + TypeScript
Local backend: Node inside Electron
Model runtime: Gemma-compatible LiteRT-LM local HTTP service
Search: Exa Deep Search
Storage: SQLite
Graph visualization: React Flow
```

Aura should be local-first.

Student profile, session history, graph state, and learning evidence should be stored locally.

## Exa Retrieval Expectations

Aura uses Exa as the live web retrieval layer. The app should not treat Exa as the tutor. Exa finds and extracts source material; the local Aura engine decides what to teach, builds the graph, and adapts the path.

Exa has normal search and deeper search modes.

Expected Exa capabilities:

```text
/search   = find relevant webpages and optionally return LLM-ready content
/contents = extract clean content from known URLs
/answer   = get direct grounded answers with citations
/research = async multi-step research with structured citations
```

For Aura MVP, use `/search` first. Do not start with `/research`; it is heavier and more useful for long reports than real-time tutoring.

### Exa Search Modes

Exa `/search` supports multiple search types. Aura should use them intentionally:

```text
instant        = fastest, best for live suggestions/autocomplete
fast           = quick search with lower latency
auto           = default normal search; good general-purpose mode
neural         = embeddings-based semantic search
deep-lite      = deeper synthesized search output with lower cost/latency than deep
deep           = comprehensive search with query expansion and richer context
deep-reasoning = deeper reasoning for harder research tasks
```

The practical MVP split:

```text
Use auto for normal lesson retrieval.
Use deep for graph-building when the topic is broad or ambiguous.
Use fast or instant for UI suggestions only.
Use cached packets for known demo topics when reliability matters.
```

Examples:

```text
Student enters "trigonometry":
use type="deep" once to build the initial concept map and source packet.

Student is currently inside "sine as a ratio":
use type="auto" or cached source filtering for focused context.

Student asks "where is this used in real life?":
use type="auto" with an application-focused query.

Student types partial topic in the input box:
optional type="instant" suggestions.
```

### Exa Request Shape

Aura should call Exa through a local retrieval service, not directly from the React renderer.

Example request for initial graph-building:

```json
{
  "query": "trigonometry beginner right triangles sine cosine tangent prerequisites common misconceptions",
  "type": "deep",
  "additionalQueries": [
    "trigonometry prerequisite concepts for beginners",
    "common student misconceptions in trigonometry",
    "visual explanation of sine cosine tangent right triangles"
  ],
  "numResults": 8,
  "contents": {
    "highlights": {
      "maxCharacters": 4000
    },
    "summary": true
  }
}
```

Example focused node request:

```json
{
  "query": "sine as opposite over hypotenuse beginner visual explanation",
  "type": "auto",
  "numResults": 5,
  "contents": {
    "highlights": {
      "maxCharacters": 2000
    }
  }
}
```

### Normalized Source Packet

The backend should normalize Exa responses before passing them to the graph builder or tutor.

```ts
type SourcePacket = {
  id: string
  topic: string
  query: string
  searchType: "instant" | "fast" | "auto" | "neural" | "deep-lite" | "deep" | "deep-reasoning"
  retrievedAt: string
  cached: boolean
  results: SourceResult[]
}

type SourceResult = {
  id: string
  title: string
  url: string
  publishedDate?: string
  author?: string
  snippet: string
  highlights: string[]
  summary?: string
  sourceType: "lesson" | "reference" | "application" | "video" | "paper" | "unknown"
  readingDifficulty: "beginner" | "intermediate" | "advanced" | "unknown"
  useFor: string[]
}
```

Aura should store this packet in SQLite so repeated sessions do not depend on live network calls.

### Retrieval Pipeline

For a new topic:

```text
1. Normalize topic.
2. Check SQLite cache for a recent source packet.
3. If cached source packet exists, use it immediately.
4. If no cache exists, call Exa /search.
5. Normalize results into SourcePacket.
6. Ask local LLM to classify each result by difficulty, source type, and useful graph nodes.
7. Store SourcePacket.
8. Build the knowledge graph from the selected snippets, not from raw full pages.
```

For a current node:

```text
1. Read node.sourceTags and node.keyTerms.
2. Filter existing SourcePacket results by useFor/sourceTags.
3. If fewer than 2 useful snippets exist, call Exa with a focused node query.
4. Add new results to the same session source packet.
5. Pass only the top 2-3 relevant snippets into the teaching context packet.
```

### Search Type Selection Rule

Aura should choose Exa search type using this rule:

```ts
function chooseExaSearchType(intent: RetrievalIntent): ExaSearchType {
  if (intent === "topic_autocomplete") return "instant"
  if (intent === "quick_fact_or_example") return "fast"
  if (intent === "focused_node_context") return "auto"
  if (intent === "initial_topic_graph") return "deep"
  if (intent === "complex_cross_topic_research") return "deep-reasoning"
  return "auto"
}
```

For the hackathon MVP, only these are required:

```text
auto
deep
cached fallback
```

### What Exa Should Not Do

Exa should not decide mastery, learner readiness, or final teaching strategy.

Avoid this:

```text
Exa answer -> directly show to student
```

Use this:

```text
Exa sources -> normalize -> graph builder -> teaching packet -> local tutor model -> student-facing message
```

This keeps Aura adaptive and privacy-first while still grounded in live web content.

## Converting Exa Results Into a Knowledge Graph

Exa results should not be stored directly as graph nodes.

Exa returns web evidence. Aura converts that evidence into teachable concepts.

The pipeline:

```text
Exa raw results
-> normalized source packet
-> concept extraction
-> concept deduplication
-> prerequisite edge inference
-> node enrichment
-> graph validation
-> lesson path generation
```

### Storage Layers

Aura should store retrieval and graph data separately.

```text
SourcePacket = what the web said
KnowledgeGraph = what Aura will teach
LessonPath = the current adaptive route through the graph
```

Suggested SQLite tables:

```sql
CREATE TABLE source_packets (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  query TEXT NOT NULL,
  search_type TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  cached INTEGER NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE source_results (
  id TEXT PRIMARY KEY,
  packet_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  snippet TEXT,
  highlights_json TEXT NOT NULL,
  summary TEXT,
  reading_difficulty TEXT,
  source_type TEXT,
  use_for_json TEXT NOT NULL,
  FOREIGN KEY(packet_id) REFERENCES source_packets(id)
);

CREATE TABLE knowledge_graphs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  created_at TEXT NOT NULL,
  graph_json TEXT NOT NULL
);

CREATE TABLE lesson_paths (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  graph_id TEXT NOT NULL,
  current_index INTEGER NOT NULL,
  path_json TEXT NOT NULL,
  FOREIGN KEY(graph_id) REFERENCES knowledge_graphs(id)
);
```

For the MVP, storing `graph_json` and `path_json` as JSON is enough. Do not overbuild a graph database.

### Step 1: Normalize Exa Results

Exa results are converted into `SourceResult` objects.

```ts
type SourceResult = {
  id: string
  title: string
  url: string
  snippet: string
  highlights: string[]
  summary?: string
  sourceType: "lesson" | "reference" | "application" | "video" | "paper" | "unknown"
  readingDifficulty: "beginner" | "intermediate" | "advanced" | "unknown"
  useFor: string[]
}
```

Example:

```json
{
  "title": "Intro to Trigonometric Ratios",
  "url": "https://example.com/trig-ratios",
  "snippet": "Sine, cosine, and tangent compare side lengths in right triangles.",
  "highlights": [
    "Sine is the ratio of the opposite side to the hypotenuse.",
    "Cosine is the ratio of the adjacent side to the hypotenuse.",
    "Tangent is the ratio of the opposite side to the adjacent side."
  ],
  "sourceType": "lesson",
  "readingDifficulty": "beginner",
  "useFor": ["sine_ratio", "cosine_ratio", "tangent_ratio", "side_names"]
}
```

### Step 2: Extract Candidate Concepts

The local model receives the source packet and extracts possible graph nodes.

Prompt intent:

```text
From these source snippets, extract teachable concepts for the topic.
Return only atomic concepts, not full lessons.
Each concept should be something that can be taught in 2-5 minutes.
```

Expected output:

```json
{
  "concepts": [
    {
      "label": "Angles",
      "teachingGoal": "Understand an angle as a measure of turn.",
      "sourceResultIds": ["src_1"],
      "keyTerms": ["angle", "degrees", "rotation"]
    },
    {
      "label": "Right Triangles",
      "teachingGoal": "Understand that a right triangle has one 90 degree angle.",
      "sourceResultIds": ["src_1", "src_2"],
      "keyTerms": ["right triangle", "90 degrees"]
    },
    {
      "label": "Sine as a Ratio",
      "teachingGoal": "Understand sine as opposite divided by hypotenuse.",
      "sourceResultIds": ["src_2"],
      "keyTerms": ["sine", "opposite", "hypotenuse", "ratio"]
    }
  ]
}
```

## Node Creation Phase

Node creation is the phase where Aura turns source evidence and topic analysis into teachable `KnowledgeNode` objects.

Nodes are created in two moments:

```text
1. Initial node creation: after Exa retrieval, before the lesson starts.
2. Dynamic node creation: during the lesson, when the student is blocked, curious, bored, or missing a prerequisite.
```

Initial nodes create the first map.
Dynamic nodes make the map adaptive.

### When Initial Nodes Are Created

Initial node creation happens after:

```text
student enters topic
-> Aura loads profile
-> Aura retrieves Exa source packet
-> Aura normalizes source results
```

Then Aura calls the local model with a `NodeCreationInput`.

```ts
type NodeCreationInput = {
  topic: string
  studentProfile: StudentProfile
  sourcePacket: SourcePacket
  goalMode: "beginner_intro" | "catch_up" | "practice" | "application"
  constraints: {
    minNodes: number
    maxNodes: number
    targetNodeLengthMinutes: number
    includeApplications: boolean
    avoidAdvancedUnlessNeeded: boolean
  }
}
```

MVP defaults:

```json
{
  "minNodes": 6,
  "maxNodes": 12,
  "targetNodeLengthMinutes": 3,
  "includeApplications": true,
  "avoidAdvancedUnlessNeeded": true
}
```

### Initial Node Creation Prompt

The local model should be asked for atomic teachable concepts.

Prompt intent:

```text
You are creating teachable nodes for an adaptive learning graph.

Topic: {topic}
Learner profile: {studentProfile}
Source snippets: {sourcePacket.results}

Create 6-12 atomic learning nodes.
Each node should be teachable in 2-5 minutes.
Each node must have a clear teaching goal.
Each node must include prerequisite hints, common confusions, readiness check, comfort check, and repair strategies.

Do not create broad chapter nodes.
Do not create advanced nodes unless needed for the first useful path.
Checks must feel conversational, not like tests.
```

Expected output:

```ts
type NodeCreationOutput = {
  nodes: KnowledgeNodeDraft[]
}

type KnowledgeNodeDraft = {
  temporaryId: string
  topicName: string
  teachingGoal: string
  prerequisiteHints: string[]
  sourceResultIds: string[]
  sourceTags: string[]
  keyTerms: string[]
  readinessCheck: SoftCheck
  comfortCheck: SoftCheck
  commonConfusions: string[]
  teachingHints: string[]
  repairStrategies: {
    confusion: string
    action: "reexplain" | "insert_prerequisite" | "split_node" | "give_example"
    suggestedNodeTitle?: string
  }[]
}
```

Example draft node:

```json
{
  "temporaryId": "draft_sine_ratio",
  "topicName": "Sine as a Ratio",
  "teachingGoal": "Student understands sine as opposite side divided by hypotenuse.",
  "prerequisiteHints": ["Right triangles", "Side names", "Ratios"],
  "sourceResultIds": ["src_002", "src_005"],
  "sourceTags": ["sine", "right triangle", "trigonometric ratios"],
  "keyTerms": ["sine", "opposite", "hypotenuse", "ratio"],
  "readinessCheck": {
    "prompt": "Quick vibe check: if I point to one angle, could you find the opposite side?",
    "expectedIdea": "Student can identify opposite side relative to an angle."
  },
  "comfortCheck": {
    "prompt": "If opposite is 3 and hypotenuse is 5, what two things is sine comparing?",
    "expectedIdea": "Opposite and hypotenuse, or 3 and 5."
  },
  "commonConfusions": [
    "Student thinks sine is a calculator button.",
    "Student mixes opposite and hypotenuse.",
    "Student does not understand ratio as comparison."
  ],
  "teachingHints": [
    "Use example before formula.",
    "Avoid dense notation first."
  ],
  "repairStrategies": [
    {
      "confusion": "Student does not understand ratio.",
      "action": "insert_prerequisite",
      "suggestedNodeTitle": "Ratio Intuition"
    }
  ]
}
```

### Node ID Canonicalization

The model may produce messy names. Aura should canonicalize node IDs in code.

Rule:

```text
lowercase topicName
remove punctuation
replace spaces with underscores
merge duplicates
```

Example:

```text
"Sine as a Ratio" -> "sine_as_ratio"
"Sine Ratio"      -> "sine_ratio"
```

If two nodes have the same meaning, keep one canonical ID.

Preferred canonical ID:

```text
short
stable
concept-specific
```

Example:

```text
Use: sine_ratio
Avoid: understanding_sine_as_the_ratio_between_the_opposite_side_and_hypotenuse
```

### Node Creation Validation

Before nodes enter the graph, validate them.

Required checks:

```text
Every node has topicName.
Every node has teachingGoal.
Every node has readinessCheck.
Every node has comfortCheck.
Every node has at least one sourceResultId unless it is a dynamic repair node.
Every node is small enough to teach in 2-5 minutes.
No duplicate node IDs.
No empty commonConfusions array.
```

If a node is too broad, split it.

Bad:

```text
Trigonometry
```

Good:

```text
Right Triangles
Side Names
Sine as a Ratio
Cosine as a Ratio
```

If a node is too narrow, merge it.

Too narrow:

```text
The word opposite
The word adjacent
The word hypotenuse
```

Better:

```text
Side Names
```

### Dynamic Node Creation

Dynamic nodes are created during teaching when the current path fails the learner.

Trigger conditions:

```text
student fails comfort check twice
student explicitly says "I don't get this"
student asks about a missing prerequisite
student seems overloaded
student is bored and wants an application
student asks a curiosity branch question
```

Dynamic node types:

```text
repair node       = fixes confusion
bridge node       = connects current node to next node
practice node     = adds low-pressure repetition
application node  = shows real-world use
curiosity node    = temporary branch from student question
compression node  = summarizes known material quickly
```

Dynamic node creation input:

```ts
type DynamicNodeCreationInput = {
  sessionId: string
  currentNode: KnowledgeNode
  nextNode?: KnowledgeNode
  studentMessage: string
  detectedProblem: {
    type: "confusion" | "missing_prerequisite" | "boredom" | "curiosity" | "overload"
    evidence: string[]
  }
  recentHistory: {
    role: "student" | "assistant"
    message: string
  }[]
  studentProfile: StudentProfile
  availableSources: SourceResult[]
}
```

Example:

Student says:

```text
i dont get what ratio means
```

Current node:

```text
Sine as a Ratio
```

Aura creates:

```json
{
  "id": "ratio_intuition",
  "topicName": "Ratio Intuition",
  "type": "repair",
  "teachingGoal": "Student understands ratio as comparing one quantity to another.",
  "prerequisites": [],
  "parentNodeId": "sine_ratio",
  "returnNodeId": "sine_ratio",
  "readinessCheck": {
    "prompt": "Tiny check: does comparing 3 apples to 5 apples feel familiar?",
    "expectedIdea": "Student recognizes comparison between quantities."
  },
  "comfortCheck": {
    "prompt": "If there are 2 red blocks and 6 total blocks, what two numbers are we comparing?",
    "expectedIdea": "2 and 6."
  },
  "status": "ready",
  "mastery": 0,
  "evidence": []
}
```

Then Aura mutates:

```text
Side Names -> Sine
```

into:

```text
Side Names -> Ratio Intuition -> Sine
```

### Node Creation Should Not Teach Yet

Node creation only defines teachable units.

It should not produce the full lecture.

Wrong:

```text
Create node and generate complete lesson text.
```

Right:

```text
Create node metadata.
Later, when node becomes active, build a teaching context packet and ask the tutor model to teach it.
```

This separation matters because the student profile and path can change before the node is actually taught.

### Step 3: Deduplicate Concepts

Different sources may name the same idea differently.

Examples:

```text
Trig ratios
Trigonometric ratios
Sine cosine tangent ratios
SOH CAH TOA
```

Aura should merge these if they teach the same concept.

Simple MVP merge rule:

```text
Ask the local model to group equivalent concepts.
Then create one canonical node per group.
```

Canonical node example:

```json
{
  "id": "trig_ratios",
  "topicName": "Trigonometric Ratios",
  "aliases": ["Trig ratios", "SOH CAH TOA", "Sine cosine tangent ratios"]
}
```

### Step 4: Infer Prerequisite Edges

After concept extraction, Aura asks the local model to infer prerequisite relationships.

Prompt intent:

```text
Given these concepts, create prerequisite edges.
An edge A -> B means A should usually be understood before B.
Only create edges that are educationally necessary.
```

Expected output:

```json
{
  "edges": [
    {
      "source": "angles",
      "target": "right_triangles",
      "relation": "prerequisite",
      "reason": "A student needs to know what an angle is before understanding a 90 degree angle."
    },
    {
      "source": "right_triangles",
      "target": "side_names",
      "relation": "prerequisite",
      "reason": "Opposite, adjacent, and hypotenuse are defined inside a right triangle."
    },
    {
      "source": "side_names",
      "target": "sine_ratio",
      "relation": "prerequisite",
      "reason": "Sine uses opposite and hypotenuse."
    },
    {
      "source": "ratios",
      "target": "sine_ratio",
      "relation": "prerequisite",
      "reason": "Sine is a ratio."
    }
  ]
}
```

### Step 5: Build Full Knowledge Nodes

Each concept becomes a full `KnowledgeNode`.

Aura enriches each node with:

```text
topicName
teachingGoal
prerequisites
sourceTags
keyTerms
readinessCheck
comfortCheck
commonConfusions
repairStrategies
status
mastery
evidence
```

Example:

```json
{
  "id": "sine_ratio",
  "topicName": "Sine as a Ratio",
  "teachingGoal": "Student understands sine as opposite divided by hypotenuse.",
  "prerequisites": ["side_names", "ratios"],
  "sourceTags": ["sine", "trigonometric ratios", "right triangle"],
  "keyTerms": ["sine", "opposite", "hypotenuse", "ratio"],
  "readinessCheck": {
    "prompt": "Quick vibe check: if I point to one angle, could you find the opposite side?",
    "expectedIdea": "Student can identify opposite side relative to an angle."
  },
  "comfortCheck": {
    "prompt": "If opposite is 3 and hypotenuse is 5, what two things is sine comparing?",
    "expectedIdea": "Opposite and hypotenuse, or 3 and 5."
  },
  "commonConfusions": [
    "Student thinks sine is a calculator button.",
    "Student mixes opposite and hypotenuse.",
    "Student does not understand ratio as comparison."
  ],
  "repairStrategies": [
    {
      "confusion": "Does not understand ratio",
      "action": "insert_prerequisite",
      "suggestedNode": "ratio_intuition"
    }
  ],
  "status": "locked",
  "mastery": 0,
  "evidence": []
}
```

### Step 6: Validate the Graph

Before using the graph, Aura should check:

```text
No duplicate node IDs.
Every prerequisite ID exists.
No circular prerequisite loops.
There is at least one starting node.
There is at least one useful goal/application node.
Node count is reasonable for MVP, usually 6-12 nodes.
```

If the graph is too large, prune it.

MVP pruning rule:

```text
Keep beginner prerequisites, core concepts, and 1-2 application nodes.
Drop advanced nodes unless the student already knows the basics.
```

For trigonometry, keep:

```text
Angles
Right Triangles
Side Names
Ratios
Sine
Cosine
Tangent
Heights and Distances
```

Drop for beginner path:

```text
Unit Circle
Radians
Trig Identities
Inverse Trig
Graph Transformations
```

Those can stay in the graph as locked future nodes if useful, but should not enter the first lesson path.

### Validation, Cleanup, and Deferral

After draft graph creation, Aura should run one graph quality phase before linearization.

This phase combines three different responsibilities, but they should not be confused:

```text
Validation = deterministic structural checks
Cleanup    = LLM-assisted semantic repair
Deferral   = deciding what should not enter the current lesson path
```

This phase answers:

```text
What belongs in the map, and what is safe to teach from right now?
```

Linearization answers a different question:

```text
What route should this learner take through the active part of the map?
```

#### Validation

Validation must be deterministic code, not "ask the LLM if the graph is good."

Code should check:

```text
valid JSON
no duplicate node IDs
all edges point to existing nodes
all prerequisite IDs exist
no prerequisite cycles
required fields exist
node count is within MVP bounds
every non-dynamic node has sourceChunkIds
every node has a teachingGoal
every node has or can later receive soft checks
```

Validation does not decide educational quality. It decides whether the graph is structurally usable.

#### Cleanup

Cleanup can be LLM-assisted because it involves semantic judgment.

Cleanup may:

```text
merge duplicate/tiny nodes
split overly broad nodes
rename unclear nodes
mark vocabulary-only nodes
repair missing prerequisite hints
remove unsupported hallucinated nodes
```

Cleanup should output explicit operations, not a vague new graph.

```ts
type GraphCleanupOperation =
  | {
      action: "merge"
      nodeIds: string[]
      replacementNode: KnowledgeNodeDraft
      reason: string
    }
  | {
      action: "split"
      nodeId: string
      replacementNodes: KnowledgeNodeDraft[]
      reason: string
    }
  | {
      action: "rename"
      nodeId: string
      newTopicName: string
      reason: string
    }
  | {
      action: "delete"
      nodeId: string
      reason: string
    }
  | {
      action: "keep"
      nodeId: string
      reason: string
    }
```

Code applies these operations, then runs deterministic validation again.

#### Deferral Instead of Destructive Pruning

Pruning should usually not delete valid nodes from the knowledge graph.

For Aura, "pruning" usually means:

```text
defer from the current lesson path
```

not:

```text
delete from the graph
```

Delete only when the node is truly invalid:

```text
duplicate with no unique value
irrelevant to the topic
unsupported hallucination
structurally broken and not repairable
```

Defer when the node is valid but not right now:

```text
too advanced for the learner
not needed for the current goal
interesting but optional
belongs in a later chapter
depends on too many untaught concepts
```

Example for beginner trigonometry:

```text
Active:
Angles
Right Triangles
Side Names
Ratios
Sine
Cosine
Tangent
Heights and Distances

Deferred:
Unit Circle
Radians
Trig Identities
Inverse Trig
Graph Transformations
```

Deferred nodes stay in the graph and can be unlocked later.

#### Graph Quality Phase Output

The graph quality phase should return:

```ts
type GraphQualityOutput = {
  graph: KnowledgeGraph
  activeNodeIds: string[]
  deferredNodeIds: string[]
  deletedNodeIds: string[]
  cleanupOperations: GraphCleanupOperation[]
  validationWarnings: string[]
}
```

Then linearization should use:

```text
cleaned graph + activeNodeIds + learner profile
```

It should not linearize every valid node in the graph.

### Final Conversion Shape

Final graph format:

```ts
type KnowledgeGraph = {
  id: string
  topic: string
  sourcePacketIds: string[]
  nodes: KnowledgeNode[]
  edges: {
    source: string
    target: string
    relation: "prerequisite" | "related" | "application" | "repair"
    reason: string
  }[]
}
```

Then Aura linearizes the graph into:

```ts
type LessonPath = {
  graphId: string
  nodeIds: string[]
  currentIndex: number
  skippedNodeIds: string[]
  insertedNodeIds: string[]
}
```

The important rule:

```text
Exa results are evidence.
The graph is Aura's teaching model.
The lesson path is the student's current route.
```

## Linearizing the Knowledge Graph

Aura teaches through a linear chat experience, so the nonlinear graph must be converted into an ordered `LessonPath`.

Linearization means:

```text
Take the useful part of the graph
-> order it by prerequisites and learner readiness
-> create a temporary route
-> keep the route editable during the lesson
```

The graph stays nonlinear. The path is linear.

### Linearization Inputs

```ts
type LinearizationInput = {
  graph: KnowledgeGraph
  studentProfile: StudentProfile
  diagnosticAnswers: Record<string, string>
  goalMode: "beginner_intro" | "catch_up" | "practice" | "application"
}
```

The output:

```ts
type LessonPath = {
  graphId: string
  nodeIds: string[]
  currentIndex: number
  skippedNodeIds: string[]
  insertedNodeIds: string[]
  reasonByNodeId: Record<string, string>
}
```

Example:

```json
{
  "graphId": "graph_trigonometry_001",
  "nodeIds": [
    "angles",
    "right_triangles",
    "side_names",
    "ratios",
    "sine_ratio",
    "cosine_ratio",
    "tangent_ratio",
    "height_applications"
  ],
  "currentIndex": 0,
  "skippedNodeIds": ["unit_circle", "trig_identities"],
  "insertedNodeIds": [],
  "reasonByNodeId": {
    "angles": "Needed as a beginner prerequisite.",
    "ratios": "Needed before sine, cosine, and tangent.",
    "unit_circle": "Skipped for first path because it is advanced."
  }
}
```

### Step 1: Choose Target Scope

Do not linearize the entire graph.

For a first lesson, Aura should choose:

```text
core beginner prerequisites
core concepts
1 application node
```

For `trigonometry`, the first path should include:

```text
Angles
Right Triangles
Side Names
Ratios
Sine
Cosine
Tangent
Heights and Distances
```

It should exclude or defer:

```text
Unit Circle
Radians
Graphs
Identities
Inverse Trig
```

Those nodes can remain in the graph but not enter the first lesson path.

### Step 2: Mark Nodes by Readiness

Before ordering, Aura sets an initial status for each node.

```text
mastered = student already knows it
ready    = prerequisites are known enough
locked   = prerequisites are not ready
deferred = valid topic, but not needed in this path
```

Diagnostic answers update this.

Example:

```json
{
  "angles": "mastered",
  "right_triangles": "ready",
  "side_names": "locked",
  "ratios": "ready",
  "sine_ratio": "locked"
}
```

If a prerequisite is mastered, Aura can skip or compress it.

### Step 3: Prune the Graph

Aura creates a subgraph for the current path.

Keep a node if:

```text
it is a prerequisite of a core concept
it is a core concept of the topic
it is a beginner-friendly application
it repairs a known student struggle
```

Drop or defer a node if:

```text
it is too advanced for the current goal
it is interesting but not necessary
it depends on too many untaught concepts
it would make the lesson too long
```

MVP max path length:

```text
6-10 nodes for a first lesson
```

If the graph has more than 10 useful nodes, split it into chapters.

### Step 4: Topological Sort

After pruning, Aura orders nodes so prerequisites come first.

Rule:

```text
If A is a prerequisite of B, A must appear before B.
```

Example:

```text
side_names -> sine_ratio
ratios -> sine_ratio
```

So:

```text
side_names and ratios must appear before sine_ratio
```

Pseudo-code:

```ts
function topologicalSort(nodes: KnowledgeNode[], edges: GraphEdge[]): string[] {
  const sorted: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return
    if (visiting.has(nodeId)) throw new Error("Graph has a prerequisite cycle")

    visiting.add(nodeId)

    const prereqs = edges
      .filter(edge => edge.target === nodeId && edge.relation === "prerequisite")
      .map(edge => edge.source)

    for (const prereqId of prereqs) visit(prereqId)

    visiting.delete(nodeId)
    visited.add(nodeId)
    sorted.push(nodeId)
  }

  for (const node of nodes) visit(node.id)

  return sorted
}
```

### Step 5: Score Ties

Sometimes multiple nodes are available at the same time.

Example:

```text
Sine
Cosine
Tangent
```

All depend on:

```text
side_names
ratios
```

Aura should choose the order by scoring.

MVP scoring:

```ts
score =
  importance * 4
  + beginnerFriendliness * 3
  + goalRelevance * 3
  + studentInterest * 2
  - difficulty * 2
  - estimatedCognitiveLoad * 2
```

For trigonometry beginner path:

```text
Sine before Cosine before Tangent
```

Reason:

```text
Sine is usually easier to connect to height applications.
Cosine is similar after sine.
Tangent can come after the side-ratio pattern is familiar.
```

### Step 6: Compress Mastered Prerequisites

If the student already knows a prerequisite, Aura does not need a full node lesson.

Instead of:

```text
Angles -> Right Triangles -> Side Names -> Ratios -> Sine
```

Aura may use:

```text
Quick refresh: Right Triangles + Side Names
-> Ratios
-> Sine
```

Compressed nodes remain in the path but have a shorter delivery mode.

```json
{
  "nodeId": "right_triangles",
  "deliveryMode": "compressed_refresh",
  "reason": "Student showed prior knowledge in diagnostic."
}
```

### Step 7: Pick the Start Node

The first node is not always the first graph node.

Start at the earliest node that is:

```text
not mastered
required for the current path
not too advanced for the student
```

Example:

```text
If student does not know angles:
start at Angles

If student knows angles but not right triangles:
start at Right Triangles

If student knows right triangles but not side names:
start at Side Names

If student knows side names and ratios:
start at Sine
```

### Step 8: Store Path Items, Not Just Node IDs

The lesson path should store per-node delivery metadata.

```ts
type LessonPathItem = {
  nodeId: string
  deliveryMode: "full" | "compressed_refresh" | "practice" | "repair" | "application"
  required: boolean
  reason: string
}
```

Better path shape:

```ts
type LessonPath = {
  graphId: string
  items: LessonPathItem[]
  currentIndex: number
  skippedNodeIds: string[]
  insertedNodeIds: string[]
}
```

Example:

```json
{
  "items": [
    {
      "nodeId": "right_triangles",
      "deliveryMode": "compressed_refresh",
      "required": true,
      "reason": "Student partly knows this but needs it for side names."
    },
    {
      "nodeId": "side_names",
      "deliveryMode": "full",
      "required": true,
      "reason": "Needed before all trigonometric ratios."
    },
    {
      "nodeId": "sine_ratio",
      "deliveryMode": "full",
      "required": true,
      "reason": "First core trig ratio."
    }
  ],
  "currentIndex": 0,
  "skippedNodeIds": ["unit_circle"],
  "insertedNodeIds": []
}
```

### Step 9: Keep the Path Mutable

Linearization is not a one-time decision.

After every student response, Aura can mutate the path.

Allowed path operations:

```ts
insertBefore(targetNodeId, newItem)
insertAfter(currentNodeId, newItem)
replaceItem(nodeId, newItems)
compressUpcoming(nodeId)
skipUpcoming(nodeId)
branchTo(nodeId)
returnFromBranch()
```

Example:

Original path:

```text
Side Names -> Ratios -> Sine
```

Student struggles with ratios:

```text
Side Names -> Ratios -> Fraction Meaning -> Ratio Intuition -> Ratios Again -> Sine
```

The graph also updates by adding repair edges:

```text
Fraction Meaning -> Ratio Intuition -> Ratios
```

### Linearization Algorithm Summary

```ts
function linearizeGraph(input: LinearizationInput): LessonPath {
  const scopedNodes = chooseTargetScope(input.graph, input.goalMode)
  const readinessMarked = markReadiness(scopedNodes, input.studentProfile, input.diagnosticAnswers)
  const prunedSubgraph = pruneForFirstPath(readinessMarked, input.graph.edges)
  const orderedNodeIds = topologicalSort(prunedSubgraph.nodes, prunedSubgraph.edges)
  const tieBrokenNodeIds = scoreAndBreakTies(orderedNodeIds, input.studentProfile)
  const items = assignDeliveryModes(tieBrokenNodeIds, input.studentProfile, input.diagnosticAnswers)
  const currentIndex = findFirstUnmasteredRequiredItem(items)

  return {
    graphId: input.graph.id,
    items,
    currentIndex,
    skippedNodeIds: collectDeferredNodes(input.graph, prunedSubgraph),
    insertedNodeIds: []
  }
}
```

The key rule:

```text
Topological sort gives a valid learning order.
Scoring makes it student-friendly.
Path mutation keeps it adaptive.
```

### Intent-Aware Linearization Scoring

Linearization must score against the student's stated intent.

```ts
score(node) =
  goalRelevance(node, intent) * 0.25
  + prerequisiteUnlockPower(node, graph) * 0.20
  + roleImportance(node, intent) * 0.20
  + learnerWeaknessMatch(node, liveStudentModel) * 0.10
  + learnerInterestMatch(node, profile) * 0.05
  - cognitiveLoadPenalty(node, profile, liveStudentModel) * 0.20
  - alreadyKnownPenalty(node, profile, liveStudentModel) * 0.25
```

`goalRelevance` is undefined without `StudentIntent`.

Examples:

```text
goalType = exam:
common mistake nodes and practice nodes score higher

goalType = curiosity:
application and intuition nodes score higher

depthPreference = deep_mechanical:
derivation/mechanism nodes move from deferred to active

timeHorizon = single_session:
enrichment nodes are deferred aggressively
```

### Prerequisite Satisfaction Gradients

Prerequisites are not binary. A prerequisite with mastery `0.55` should be treated differently from one with mastery `0.90`.

Teaching packets should include prerequisite mastery context:

```ts
type PrerequisiteMasteryContext = {
  nodeId: string
  effectiveMastery: number
  confidence: number
  fragileAspects: string[]
  instruction: "assume_known" | "briefly_reinforce" | "reteach_before_current_node"
}
```

Rule:

```text
effectiveMastery >= 0.80:
assume_known

0.55 <= effectiveMastery < 0.80:
briefly_reinforce inside the current node

effectiveMastery < 0.55:
insert prerequisite repair before current node
```

Example:

```text
Student knows ratios at 0.55.
When teaching sine, do not stop for a full ratio lesson.
Instead, weave ratio reinforcement into the sine explanation.
```

## Node State Transition Rules

Node statuses must have explicit transitions.

```text
locked -> ready:
all hard prerequisites have effective mastery >= readiness threshold

ready -> active:
node is selected as the current teaching target

active -> shaky:
comfort check fails once or evaluator returns partial with low confidence

active -> mastered:
comfort check passes with confidence >= 0.75

shaky -> mastered:
repair succeeds and comfort check passes

shaky -> blocked:
three consecutive repair failures

blocked -> ready:
only through explicit prerequisite remediation path

deferred -> ready:
student intent changes, prerequisite chain completes, or chapter advances

mastered -> shaky:
effective mastery drops below threshold through decay
```

Mastery is not permanent. A mastered node can become shaky later, and Aura should handle that through gentle review.

## Node Size and Single-Node Teaching

Aura should teach one active node at a time.

```text
Active node   = what Aura is teaching now
Context nodes = prerequisites, next node, unresolved misconceptions
Queued nodes  = upcoming lesson path
```

Aura should not teach multiple new concepts at once.

It should teach:

```text
one active node
with awareness of nearby nodes
```

### Node Size

A node should be a micro-concept, not a chapter.

Good node size:

```text
2-7 minutes
1 teaching goal
1 readiness check
1 comfort check
1-2 examples
1 repair strategy
```

A node is too big if:

```text
it needs multiple unrelated teaching goals
it has more than 3 hard prerequisites
it needs more than 7 minutes to explain
its comfort check tests multiple skills at once
it contains a whole chapter
```

A node is too small if:

```text
it is only a vocabulary word
it cannot produce a meaningful comfort check
it does not unlock or support anything else
it takes less than 1 minute and has no conceptual weight
```

Bad node examples:

```text
Trigonometry
Sine
The word hypotenuse
```

Better node examples:

```text
Right Triangles
Side Names in a Right Triangle
Ratios as Comparisons
Sine as Opposite over Hypotenuse
Cosine as Adjacent over Hypotenuse
Using Sine to Estimate Height
```

### Node Quantization

One node is not one giant lecture. Each node is a small learning episode made of phases.

```ts
type NodeTeachingPlan = {
  nodeId: string
  phases: NodePhase[]
}

type NodePhase =
  | "readiness_check"
  | "intuition"
  | "example"
  | "guided_attempt"
  | "comfort_check"
  | "repair"
  | "transition"
```

Default node flow:

```text
readiness check
-> intuition
-> example
-> guided attempt
-> comfort check
-> transition decision
```

Example for `sine_ratio`:

```text
readiness check:
Can the student identify opposite and hypotenuse?

intuition:
Sine compares one side to the longest side.

example:
Opposite = 3, hypotenuse = 5, so sine compares 3 to 5.

guided attempt:
If opposite = 4 and hypotenuse = 8, what is sine comparing?

comfort check:
Can the student explain sine without calculator language?

transition:
Move to cosine, repair ratios, or branch to application.
```

### Node Transition Logic

Transition happens after the comfort check or after a strong student signal.

Transition inputs:

```text
current node state
comfort check evaluation
live student model
misconception register
prerequisite mastery
fatigue
student intent
lesson path
```

Executable transition actions:

```ts
type NodeTransitionAction =
  | { type: "ADVANCE"; nextNodeId: string }
  | { type: "REPAIR_CURRENT"; strategy: RepairStrategy }
  | { type: "INSERT_REPAIR_NODE"; node: KnowledgeNode }
  | { type: "BACKTRACK_TO_PREREQUISITE"; nodeId: string }
  | { type: "COMPRESS_NEXT"; nodeId: string }
  | { type: "SKIP_NEXT"; nodeId: string; reason: string }
  | { type: "BRANCH_TO_APPLICATION"; nodeId: string }
  | { type: "PAUSE_FOR_REVIEW"; reviewNodeIds: string[] }
  | { type: "BLOCK_CURRENT"; reason: string }
```

Transition rules:

```text
comfort check passes confidently:
mark current node mastered
advance to next ready node

comfort check partially passes:
mark current node shaky
give one extra example or guided attempt

comfort check fails once:
repair current node

comfort check fails twice:
insert smaller repair node or backtrack to weakest prerequisite

comfort check fails three times:
mark node blocked and run graceful degradation

student seems bored:
compress or skip the next easy node

student asks curiosity question:
branch temporarily, then return

fatigue is high:
pause new content and switch to review or lighter example
```

### Next Node Selection

Usually the next node is:

```ts
lessonPath.items[currentIndex + 1]
```

But before advancing, Aura checks:

```text
Are prerequisites satisfied?
Is effective mastery still high enough?
Is there an unresolved misconception affecting the next node?
Is fatigue too high?
Is the next node too hard right now?
```

If all checks pass:

```text
advance
```

If not:

```text
insert reinforcement, repair, or review before the next node
```

Example:

```text
Path:
Right Triangles -> Side Names -> Ratios -> Sine -> Cosine

Current node:
Ratios
```

If student passes:

```json
{
  "result": "pass",
  "confidence": 0.84
}
```

Action:

```text
Ratios -> mastered
Next node = Sine
```

If student partially passes:

```json
{
  "result": "partial",
  "confidence": 0.62,
  "detectedIssue": "can compare numbers but struggles with fraction notation"
}
```

Action:

```text
Ratios -> shaky
give one guided example without reducing fractions
ask another comfort check
```

If student fails:

```json
{
  "result": "fail",
  "confidence": 0.81,
  "detectedIssue": "does not understand comparison"
}
```

Action:

```text
Ratios -> shaky
insert repair node: Comparison Intuition
return to Ratios afterward
```

If repair repeatedly fails:

```text
Ratios -> blocked
Since Sine depends on Ratios, do not continue to Sine.
Find nearest mastered ancestor.
Rebuild route from there with a different approach.
```

The core rule:

```text
Aura teaches one node at a time, but transition decisions use the whole learner state and nearby graph context.
```

## Terminal Failure and Graceful Degradation

Blocked status is not the end of the app. It triggers a three-step escalation sequence.

First escalation:

```text
If the blocked node is not a hard prerequisite for the student's intent, bypass it.
Mark it as a known gap.
Continue with reachable nodes.
Mention the gap in the session summary.
```

Second escalation:

```text
If the blocked node is a hard prerequisite, find the highest ancestor in the prerequisite chain with solid mastery.
Rebuild the path from that ancestor using a different delivery mode, different source chunks, and different analogies.
```

Third escalation:

```text
If the rebuilt path also fails, tell the student the topic needs a missing foundation.
Name the missing foundation explicitly.
Offer to pivot to that foundation first.
```

This is not a failure state. It is correct diagnosis.

## Source Confidence Behavior

Aura should compute source confidence after Exa retrieval and chunk filtering.

Low source confidence if:

```text
usable sources < 3
average relevance < 0.60
no beginner-readable chunks
source results are highly redundant
```

```ts
type SourceConfidence = "high" | "medium" | "low"
```

When source confidence is low:

```text
Teaching packets prefer sourcePolicy = "model_generated" or "mixed" instead of trusting weak chunks.
Node enrichment uses only high-confidence common confusions.
Soft check mastery threshold increases.
Graph/source grounding is marked internally as weak.
Student-facing explanation may naturally say: "This is a less common topic, so I’m working from general knowledge here."
```

Low source confidence should not break the app. It makes Aura more conservative.

## Calibrated Soft Check Evaluation

Soft checks require semantic evaluation, not string matching.

```ts
type CheckEvaluation = {
  result: "pass" | "partial" | "fail" | "unclear"
  confidence: number
  evidence: string
  detectedIssue?: string
  demonstratedMisconception?: string
}
```

For clear answers, one evaluator call is enough.

For ambiguous or high-impact answers, run consistency checking:

```text
evaluate answer with prompt A
evaluate answer with prompt B
compare results
```

If both agree with high confidence:

```text
trust the result
```

If they disagree:

```text
mark result unclear
ask a simpler follow-up check
```

Start conservative:

```text
require higher confidence to mark mastered
allow lower confidence to trigger support
```

Over time, compare evaluator pass decisions against later durable mastery to calibrate thresholds.

## Local Model Boundary

Electron should not call the model directly through hardcoded runtime bindings.

Instead, Aura should call a local model server:

```text
http://localhost:<port>/generate
```

This keeps the app flexible.

Target model runtime:

```text
Gemma 4 using LiteRT-LM
```

Fallback design:

```text
Any local Gemma-compatible service can work if it exposes the same HTTP interface.
```

## Core APIs

```ts
POST /generateLesson
```

Input:

```json
{
  "topic": "trigonometry",
  "studentProfileId": "profile_001"
}
```

Output:

```json
{
  "sessionId": "sess_001",
  "graph": {},
  "lessonPath": [],
  "openingMessage": "",
  "sources": []
}
```

```ts
POST /tutor/respond
```

Input:

```json
{
  "sessionId": "sess_001",
  "studentMessage": "i dont get why sin is a ratio",
  "signals": {
    "timeToRespondMs": 15000,
    "clickedHint": false
  }
}
```

Output:

```json
{
  "assistantMessage": "",
  "updatedGraphFocus": "ratios",
  "adaptation": "insert_repair_node",
  "nextCheck": {}
}
```

```ts
POST /profile/update
```

Input:

```json
{
  "studentProfileId": "profile_001",
  "observedSignals": [],
  "explicitPreferences": {}
}
```

Output:

```json
{
  "updatedProfile": {}
}
```

## Student Profile

```ts
type StudentProfile = {
  id: string

  readingMode: "standard" | "short_chunks"
  pace: "slow" | "medium" | "fast"

  dyslexiaMode: boolean
  adhdSupport: boolean

  prefers: string[]
  avoid: string[]

  strengths: string[]
  struggles: string[]

  topicConfidence: Record<string, "low" | "medium" | "high">

  recentPatterns: {
    confusionTriggers: string[]
    helpfulStrategies: string[]
  }

  conceptMastery: Record<string, LearnerConceptState>
  spacedReviews: SpacedReviewItem[]
}
```

```ts
type LearnerConceptState = {
  conceptId: string
  storedMastery: number
  confidence: number
  conceptType: "conceptual" | "procedural"
  lastSeenAt: string
  evidence: string[]
  source: "diagnostic" | "session" | "self_report" | "imported"
}

type SpacedReviewItem = {
  conceptId: string
  dueAt: string
  intervalDays: number
  lastResult: "pass" | "partial" | "fail"
}
```

Example:

```json
{
  "readingMode": "short_chunks",
  "pace": "slow",
  "dyslexiaMode": true,
  "adhdSupport": true,
  "prefers": ["examples first", "visual language"],
  "avoid": ["formula first", "long paragraphs"],
  "struggles": ["multi-step algebra", "abstract definitions"],
  "recentPatterns": {
    "confusionTriggers": ["ratios", "symbol-heavy explanations"],
    "helpfulStrategies": ["analogy", "small examples"]
  }
}
```

## Live Student Model

Aura needs a live student model during the session. This is different from the static student profile and different from chat history.

The live model represents what the student appears to understand right now.

```ts
type LiveStudentModel = {
  currentUnderstanding: Record<string, LiveConceptUnderstanding>
  demonstratedMisconceptions: DemonstratedMisconception[]
  fatigue: {
    level: number
    evidence: string[]
  }
  helpfulStrategies: Record<string, number>
}

type LiveConceptUnderstanding = {
  depth: "none" | "surface" | "structural" | "generative"
  confidence: number
  lastEvidence: string
  fragileAspects: string[]
}

type DemonstratedMisconception = {
  misconception: string
  detectedAtNode: string
  resolved: boolean
  affectedFutureNodes: string[]
  evidence: string[]
}
```

Every soft check, repair attempt, and student message updates this live model.

Teaching packets should read from the live model first, then the long-term profile.

Example:

```json
{
  "currentUnderstanding": {
    "right_triangles": {
      "depth": "surface",
      "confidence": 0.7,
      "lastEvidence": "Student recognized the square corner but did not know the formal name.",
      "fragileAspects": ["formal vocabulary"]
    },
    "ratios": {
      "depth": "structural",
      "confidence": 0.85,
      "lastEvidence": "Student explained ratio as one quantity compared to another.",
      "fragileAspects": []
    }
  }
}
```

This lets Aura anticipate problems. If a future node depends on a fragile concept, Aura can weave reinforcement into the lesson before the student fails.

## Misconception Runtime Tracker

Misconceptions persist across nodes. If a student demonstrates a wrong model, Aura should keep it active until resolved.

Example:

```json
{
  "misconception": "right triangle means pointing right",
  "detectedAtNode": "right_triangles",
  "resolved": false,
  "affectedFutureNodes": ["sine_ratio", "cosine_ratio", "tangent_ratio"],
  "evidence": ["Student answered that a right triangle is called right because it points right."]
}
```

When an affected future node becomes active, the teaching packet must include unresolved misconceptions as constraints.

Example teaching constraint:

```text
Student previously thought "right triangle" means pointing right.
Before using right triangles in sine, briefly reinforce that "right" means 90 degrees.
```

Misconceptions are marked resolved only after the student passes a targeted comfort check.

## Mastery Decay

Mastery is not permanent. Aura should compute effective mastery from stored mastery and time since last seen.

```ts
function effectiveMastery(state: LearnerConceptState, now: Date): number {
  const days = daysBetween(state.lastSeenAt, now)
  const halfLifeDays = state.conceptType === "procedural" ? 7 : 14
  const decay = Math.pow(0.5, days / halfLifeDays)
  return state.storedMastery * decay
}
```

If effective mastery drops below the readiness threshold, a mastered node can become shaky again.

This transition should be graceful:

```text
"Looks like this idea could use a quick warm-up."
```

not:

```text
"You forgot this."
```

## Spaced Repetition

After a concept is mastered, Aura schedules lightweight review checks.

Default intervals:

```text
day 1
day 3
day 7
day 21
```

Review behavior:

```text
pass:
increase interval

partial:
keep interval similar and add tiny reinforcement

fail:
lower mastery and schedule repair
```

At session start, Aura should surface due reviews before new content.

Limit:

```text
max review time: 2 minutes
```

Review nodes are not full lessons. They are one soft check plus optional tiny repair.

## MVP Principle

Aura should not pretend to be a full school system.

The hackathon MVP should prove one powerful idea:

> Aura creates a living knowledge map, turns it into an adaptive path, teaches one concept at a time, and rewrites the path when the learner needs a different route.
