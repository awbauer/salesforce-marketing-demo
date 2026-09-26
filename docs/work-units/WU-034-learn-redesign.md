---
id: WU-034
title: Learn page as a visual, hands-on course
status: active
plan_sections: [15, 16]
owners: [agent]
---

# Objective

Turn the Learn page from a long reference into a well-designed learning experience. A reader should see how each concept works, try it in the workbench, check their understanding, and track their progress.

## Delivered

- **Hero and learning path:**
  - three part cards, each with its number, tagline, lesson count, reading time, and lessons read
  - an overall progress bar
- **Chapter banners** for each part, with an accent color, an intro, and a "You'll be able to" list of outcomes.
- **Lesson cards**, each with a number (1.1 …), a summary, and a **diagram**. Each card also has a **key idea** callout, the long-form text, **Try it** actions, "In this demo" and typed "Learn more" links, and a **Mark as read** toggle. Reaching the end of a lesson also marks it read.
- **18 diagrams**, built from accessible primitives (flows, lanes, cards as ordered lists) plus custom visuals:
  - a context-window breakdown
  - memory layers with reader and lifetime
  - a knowledge-graph evidence path (SVG with title and description)
  - the six graph tools with Neo4j and fixture parity
  - system architecture tiers
  - routing lanes
  - the confirmation stepper
  - the push-campaign tool plan
  - and more
- **Try it:**
  - prompt actions load a prompt into the workspace composer
  - view actions open Graph, History, or Evaluations
- **Check your understanding:** one question per part, with feedback that explains the answer.
- **Glossary** as a filterable card grid.
- **Progress storage:** saved in `localStorage`, wrapped in try/catch. The page works when storage is blocked.
- **Phone layout:** the header actions wrap on phones. Before, the chat header pushed the page to 573px wide at a 375px viewport.

## Verification

- Unit tests: every part has a path, outcomes, and a valid check answer. Every lesson has an existing diagram and a key idea.
- E2E in Chrome and Edge: table-of-contents jumps without page scroll, mark as read and progress, the quick check, glossary filter, safe external links, and Try it filling the composer.
- `pnpm verify` passes.
