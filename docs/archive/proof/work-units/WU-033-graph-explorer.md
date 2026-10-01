---
id: WU-033
title: Interactive graph explorer over the live Neo4j knowledge graph
status: active
plan_sections: [15, 16]
owners: [agent]
---

# Objective

Anyone can see and explore the real knowledge graph that the orchestrator's `graph_` tools read. They should be able to tell what is in it, how the parts connect, and what it can answer, without writing Cypher.

## Delivered

- **API** (behind the same Access principal as the rest of `/api`). Both routes run fixed, parameterized, read-mode Cypher and never user queries:
  - `GET /api/graph/overview` returns every node except the 1,500 push sends, their relationships, and counts for the whole graph.
  - `GET /api/graph/nodes/:id/neighbors` returns up to 60 neighbors, best performing first (by `orderRate`). It also returns each neighbor's links to core nodes, so push sends settle between the location, daypart, weather, and menu item they relate to.
- **Graph page** (rail and narrow-screen header):
  - A force-directed canvas (`d3-force`) with the three domains in their own regions: campaigns and content, audience and consent, Coastline Kitchen pushes.
  - Colors by node type and size by connectedness.
  - Labels that avoid colliding with each other, plus neighborhood highlighting with direction arrows and relationship phrases.
  - Drag to pan, scroll to zoom, drag a node to pin it, and keyboard zoom and pan.
  - Guided tours: how a campaign fits together, who a campaign reaches, what worked in the rain, and a failed brand check.
  - Search, and node-type toggles grouped by domain with loaded and total counts.
  - A details panel with properties, grouped connections that work as keyboard and screen-reader navigation, on-demand expansion, and a "What the graph says" chart. The chart shows the average order rate per menu item (or per weather condition) across the loaded push sends.
- **Reduced motion:** the layout settles up front and the camera jumps instead of animating.

## Verification

- The live Aura instance and the fixture return identical overviews (134 nodes, 562 relationships) and an identical rain expansion (60 neighbors, 240 relationships, same order).
- Unit tests cover the explorer queries against the fixture and a recording Neo4j backend (read-only statements), and the web graph model: merging, grouping, and the insight chart.
- Worker test: overview, expansion, and a 404 for unknown nodes.
- E2E in Chrome and Edge: tours, expansion, search, detail navigation, and type toggles, with no page scroll. Screenshots are in `artifacts/evidence/WU-033/`.
