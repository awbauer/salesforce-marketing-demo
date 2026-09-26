---
id: WU-031
title: Learn page with context and GraphRAG primers and a demo concept explainer
status: active
plan_sections: [15, 16]
owners: [agent]
---

# Objective

Evaluators and newcomers can learn, inside the workbench, what context and GraphRAG are and how every piece of the demo works, with curated resources for going deeper.

## Delivered

- A **Learn** view (rail and narrow-screen header) with a sticky table of contents and a glossary. Each section has a summary, an in-depth Markdown explanation, an "In this demo" list pointing to UI surfaces and source files, and typed "Learn more" resources.
- **Primer: context:**
  - what context is
  - the three memory layers: working memory, audit trail, and long-term memory (issue #41)
  - context risks and the defenses the demo uses
- **Primer: RAG and GraphRAG:**
  - RAG basics
  - GraphRAG patterns: curated queries, text-to-Cypher, hybrid vector + graph, community summaries
  - how this demo implements GraphRAG
- **Every demo concept:**
  - orchestrator and Durable Objects
  - the gpt-oss-20b model
  - MCP and the three servers
  - Salesforce agents and Apex actions
  - routing and tool plans
  - reliability guards
  - governance and kill switches
  - structured UI
  - observability
  - evaluations
  - the image workflow
  - campaign context
- Content lives in `apps/web/src/learn/content.ts`, typed and unit-tested for anchors, https links, and glossary order.

## Resource verification

Every resource URL returned HTTP 200 on 2026-09-26, except the two `developer.salesforce.com` pages (Hosted MCP servers and HXL). That site answers every automated request with 403. Those two links are the ones already cited in the project plan.

## Layout fixes found while testing

- Table-of-contents jumps scroll only the Learn view, not the page.
- Views contain absolutely positioned descendants (`.sr-only`), so they can't stretch the document.
- The left rail scrolls on short viewports.

## Acceptance criteria

- [x] Unit tests: content coverage, unique anchors, https resources, and glossary order.
- [x] E2E in Chrome and Edge: navigation, table-of-contents jumps without page scroll, and external links open in a new tab safely.
- [x] `pnpm verify` passes.

## Verification

```text
pnpm verify
pnpm exec playwright test tests/e2e/workbench.spec.ts
```
