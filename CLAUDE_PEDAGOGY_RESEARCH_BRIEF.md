# Aura Pedagogy Research Brief

Use this as context for deep research. The goal is to improve Aura's teaching method, not to research LiteRT-LM itself. Runtime details matter only when they affect pedagogy, speed, privacy, or local-first user experience.

## Project

Aura is a fully local desktop learning app. A student enters a topic, goal, depth preference, and learner profile. The app uses local Gemma 4 through LiteRT-LM to generate a comprehensive learning graph, linearize it into a teachable path, and expand each node into lecture cards with questions and interactive learning flow.

Aura should not behave like a generic chatbot. It should behave like a structured tutor that plans, teaches, checks understanding, repairs misconceptions, adapts pacing, and helps the learner build durable knowledge.

The primary audience is neurodivergent learners, especially students with ADHD, dyslexia, anxiety around learning, low confidence, or difficulty staying engaged with long linear explanations. Aura should use game-like motivation, visible progress, low-friction interaction, and dyslexia/ADHD-aware design without becoming childish, noisy, or overstimulating.

## Current Product Shape

- Desktop app: Electron + Vite + React
- Backend: Node/Express TypeScript
- LLM runtime: local Gemma 4 through LiteRT-LM
- Main flow is fully local
- User enters topic, goal, depth, and learner mode
- Gemma generates a knowledge graph
- Nodes have roles:
  - `core`
  - `bridge`
  - `repair`
  - `practice`
  - `application`
- The app derives a linear learning path from graph dependencies
- Gemma expands nodes into lecture cards, questions, recaps, examples, and practice
- UI should reveal content gradually so the learner never feels stuck
- Math should render with LaTeX/KaTeX
- There is currently no central free-form chat tutor experience.
- There is currently no full gamified progression system.
- There is currently no durable spaced-review/scheduling system.
- There is currently no rich learner model that updates from every answer.
- There is currently no polished reward loop beyond progress/status UI.

## What Aura Already Has

- A local-first architecture with Gemma-only generation.
- A topic-to-graph pipeline.
- Linear lesson path derivation from graph dependencies.
- Node roles for `core`, `bridge`, `repair`, `practice`, and `application`.
- Lecture card generation.
- Entry/exit question support.
- Recaps and examples.
- UI progress updates during generation.
- Hidden debug/dev logs behind a small control.
- KaTeX/LaTeX rendering in the frontend.
- Cache selection support for explicit testing, while the main flow stays Gemma-only.

## What Aura Does Not Have Yet

- A chat option where a learner can ask follow-up questions during a lesson.
- A guided hint ladder after wrong answers.
- A real adaptive learner model that updates mastery, confidence, speed, and confusion over time.
- A polished gamification layer with quests, XP, streaks, badges, unlocks, or mastery maps.
- ADHD-specific controls such as focus mode, micro-goals, timed sprints, novelty pacing, and break prompts.
- Dyslexia-specific controls such as font choice, line spacing, reduced visual clutter, reading ruler, text-to-speech hooks, or simplified wording mode.
- A spaced repetition/review queue.
- A final mastery challenge that proves the learner can apply the concept.
- A robust pedagogical judge that rejects shallow questions, repetitive cards, or explanations that are too abstract.
- Long-term local memory of topics learned, misconceptions fixed, and review needs.

## Current Pedagogy Problem

The system can generate graph nodes and lecture cards, but the teaching method needs to become more intentional.

Known issues to solve:

- Cards can become redundant.
- Questions can feel shallow or obvious.
- Entry questions should be optional and only appear when pedagogically useful.
- The app needs better misconception detection and repair.
- The graph should not only list topics; it should reflect a learning strategy.
- The UI should show progress and purpose, not raw chunks/dev data.
- Explanations need better examples, checks, and transfer activities.
- The student should feel guided through a lesson, not dumped into generated text.
- The experience is not gamified enough yet to sustain attention for ADHD learners.
- The design does not yet specifically support dyslexic learners.
- The app does not yet offer an optional chat/hint channel when a learner gets stuck.

## Research Task

Research how Aura should improve its teaching methods. Focus on concrete learning science, tutoring patterns, UX mechanics, and implementation ideas that can be turned into product features.

Please investigate:

1. Best teaching structure for one generated lesson:
   - How should a lesson begin?
   - When should it ask an entry question?
   - How much explanation before practice?
   - When should it recap?
   - How should it end?

2. Knowledge graph pedagogy:
   - What makes a concept map useful for learning?
   - How should prerequisite nodes, bridge nodes, repair nodes, and application nodes be arranged?
   - When should the graph branch?
   - How should a linear path be derived from a graph?
   - How should the app decide when to unlock, skip, or revisit a node?

3. Question design:
   - What makes a good diagnostic question?
   - How should multiple-choice questions avoid being too obvious?
   - When should questions be open-ended vs multiple-choice?
   - How should distractors be generated from real misconceptions?
   - How should exit questions differ from entry questions?
   - How should confidence ratings or self-explanations be used?

4. Misconception repair:
   - How should Aura detect likely misconceptions?
   - What should happen after a wrong answer?
   - How should it explain why the wrong answer was tempting?
   - How should it generate a targeted repair card?
   - How should it avoid shaming or overcorrecting the learner?

5. Adaptive sequencing:
   - How should the app adapt to goal type: exam, curiosity, project, application, revision?
   - How should it adapt to depth: intuition-only vs mechanical vs deep?
   - How should it adapt to learner profile: ADHD, anxiety, low confidence, visual preference, fast learner, beginner?
   - What signals should trigger shorter cards, more examples, more practice, or repair?

6. Explanation quality:
   - What makes an explanation clear and memorable?
   - How should analogies be used without misleading the learner?
   - How should abstract math/science concepts become concrete?
   - How should examples progress from easy to exam-level?
   - How should worked examples be faded into independent practice?

7. Cognitive load and UX:
   - How much text should appear at once?
   - How should cards be chunked?
   - What progress indicators reduce waiting anxiety?
   - How should animations support learning rather than distract?
   - How should the UI handle long generation time?

8. Retrieval practice and retention:
   - How should Aura add spaced review?
   - How should it generate recap cards?
   - How should it ask the learner to explain in their own words?
   - How should it create a final "can you now do this?" task?
   - How should it schedule future revision locally?

9. Gamification for neurodivergent learners:
   - What forms of gamification help ADHD learners without becoming distracting?
   - How should quests, XP, streaks, badges, levels, unlocks, progress maps, and mastery meters be used?
   - How can Aura create short dopamine loops while still teaching seriously?
   - How should rewards be tied to effort, retrieval, correction, and persistence rather than only correct answers?
   - How can the graph become a game board or mastery map?
   - What should be avoided because it may overstimulate, shame, or reduce intrinsic motivation?

10. Dyslexia-aware teaching and UI:
   - What UI choices help dyslexic learners read and navigate lessons?
   - Which font, spacing, contrast, line length, chunking, and highlighting patterns are recommended?
   - How should explanations be simplified without becoming babyish?
   - How should Aura support visual, audio, and interactive alternatives to dense text?
   - How should math notation be explained step by step for dyslexic learners?

11. ADHD-aware teaching and UX:
   - How should lessons be chunked into micro-goals?
   - How should the app use timers, progress, novelty, and immediate feedback?
   - How should it handle task switching, boredom, overwhelm, and waiting?
   - How should the app reduce executive-function load?
   - What kind of optional focus mode should Aura provide?

12. Chat and help mode:
   - Should Aura add a chat option?
   - If yes, where should it live so it does not turn Aura into a generic chatbot?
   - Should chat be node-scoped, lesson-scoped, or always available?
   - How should chat answers stay aligned to the current graph and learner profile?
   - Should the chat offer hints first, then explanations, then worked solutions?

13. Pedagogical judge/evaluator:
   - What should a local LLM judge check before showing a card?
   - How should it detect redundancy?
   - How should it detect shallow questions?
   - How should it verify age/grade appropriateness?
   - How should it verify that every card has a real teaching purpose?

14. Product features to add:
   - Which features would most improve learning quality?
   - Which features would make Aura feel meaningfully different from ChatGPT?
   - Which features are easiest to implement first?
   - Which features would make the best demo?
   - Which gamification features should ship first?
   - Which neurodivergent accessibility features should ship first?

## Implementation Constraints

- All generation must be local Gemma 4 only.
- Do not recommend cloud APIs.
- Avoid features that require a large external database.
- The app should work for school topics such as:
  - probability class 10
  - quadratic equations
  - arithmetic progression
  - circles
  - momentum
  - photosynthesis
- The frontend should hide developer logs by default.
- The UI should center actual teaching content, not raw chunks.
- The map and linear path should be visible in a learner-friendly way.
- Gamification must support learning rather than become visual noise.
- ADHD support should prioritize fast feedback, visible progress, short loops, and low task-switching cost.
- Dyslexia support should prioritize readable text, spacing, chunking, multimodal explanation, and reduced clutter.
- Chat should be optional and scoped to the lesson, not the primary product surface.

## Output Requested

Please produce:

1. A short strategic verdict: what Aura's teaching philosophy should be.
2. A recommended lesson flow from topic entry to final task.
3. A recommended node taxonomy and graph/linear path strategy.
4. A question design framework with examples.
5. A misconception repair framework with examples.
6. A redundancy/shallow-content judging rubric for the local LLM.
7. A gamification system proposal for ADHD/dyslexia learners.
8. A chat/hint mode proposal that does not turn Aura into a generic chatbot.
9. A ranked feature roadmap:
   - must build now
   - should build next
   - ambitious demo features
10. A polished demo lesson flow for “probability class 10”.
11. Specific prompt/schema changes Aura should make.

## Key Question

How should Aura teach, motivate, and adapt so that it becomes a genuinely effective local tutor for neurodivergent learners, not just a local text generator?
