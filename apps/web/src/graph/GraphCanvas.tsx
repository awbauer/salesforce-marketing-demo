import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import { useEffect, useRef } from "react";
import {
  DOMAINS,
  type GraphState,
  labelColor,
  labelName,
  nodeRadius,
  relationshipPhrase,
  type SimLink,
  type SimNode,
} from "./graph-model";

type Transform = { k: number; x: number; y: number };
type Pointer =
  | { mode: "idle" }
  | { mode: "pan"; startX: number; startY: number; origin: Transform; moved: boolean }
  | { mode: "node"; node: SimNode; startX: number; startY: number; moved: boolean };

export type CanvasCommand = {
  kind: "fit" | "zoom-in" | "zoom-out" | "focus";
  id?: string;
  n: number;
};

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5;
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const DOMAIN_ANCHORS: Record<string, { x: number; y: number }> = {
  marketing: { x: -300, y: -190 },
  audience: { x: -60, y: 190 },
  restaurant: { x: 330, y: -150 },
};
const DOMAIN_BY_LABEL = new Map(
  DOMAINS.flatMap((domain) => domain.labels.map((label) => [label, domain.id] as const)),
);
const domainOf = (label: string) => DOMAIN_BY_LABEL.get(label) ?? "audience";
const anchorOf = (label: string) => DOMAIN_ANCHORS[domainOf(label)] ?? { x: 0, y: 0 };
// Hubs that are always labeled so the regions are recognizable before any zooming.
const ANCHOR_LABELS = new Set([
  "Campaign",
  "Restaurant",
  "Location",
  "WeatherCondition",
  "Daypart",
]);

const endpointId = (end: SimLink["source"]) => (typeof end === "object" ? end.id : String(end));

/**
 * Force-directed drawing of the visible graph on a canvas. The canvas is a visual aid; every
 * node it shows is also reachable from the search, legend, and details panel for keyboard and
 * screen-reader users.
 */
export function GraphCanvas({
  graph,
  hiddenLabels,
  selectedId,
  onSelect,
  onHover,
  command,
}: {
  graph: GraphState;
  hiddenLabels: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (node: SimNode | null) => void;
  command: CanvasCommand | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const transform = useRef<Transform>({ k: 0.8, x: 0, y: 0 });
  const size = useRef({ width: 800, height: 600 });
  const visible = useRef<{ nodes: SimNode[]; links: SimLink[] }>({ nodes: [], links: [] });
  const hovered = useRef<SimNode | null>(null);
  const selected = useRef<string | null>(selectedId);
  const pointer = useRef<Pointer>({ mode: "idle" });
  const frame = useRef(0);
  const fitted = useRef(false);
  const userMoved = useRef(false);
  const settled = useRef(false);
  const handlers = useRef({ onSelect, onHover });
  handlers.current = { onSelect, onHover };

  const draw = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(paint);
  };

  function paint() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = size.current;
    const { k, x, y } = transform.current;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.translate(x, y);
    context.scale(k, k);

    const focusId = hovered.current?.id ?? selected.current;
    const neighborhood = new Set<string>();
    if (focusId) {
      neighborhood.add(focusId);
      for (const link of visible.current.links) {
        const from = endpointId(link.source);
        const to = endpointId(link.target);
        if (from === focusId) neighborhood.add(to);
        if (to === focusId) neighborhood.add(from);
      }
    }
    const dim = (id: string) => focusId !== null && !neighborhood.has(id);

    // Relationship phrases only when few links are highlighted; a burst of 60 would be noise.
    const phraseLinks =
      focusId !== null &&
      visible.current.links.filter(
        (link) => endpointId(link.source) === focusId || endpointId(link.target) === focusId,
      ).length <= 12;

    // Links: faint by default, strong inside the focused neighborhood.
    context.lineCap = "round";
    for (const link of visible.current.links) {
      const source = link.source as SimNode;
      const target = link.target as SimNode;
      if (source.x === undefined || target.x === undefined) continue;
      const active = focusId !== null && (source.id === focusId || target.id === focusId);
      context.strokeStyle = active
        ? "rgba(23, 61, 49, 0.75)"
        : focusId
          ? "rgba(101, 113, 105, 0.06)"
          : "rgba(101, 113, 105, 0.22)";
      context.lineWidth = (active ? 1.6 : 0.8) / Math.sqrt(k);
      context.beginPath();
      context.moveTo(source.x, source.y ?? 0);
      context.lineTo(target.x, target.y ?? 0);
      context.stroke();
      if (active && target.y !== undefined && source.y !== undefined) {
        // Arrowhead at the target edge shows the relationship direction.
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        const r = nodeRadius(target) + 2;
        const tipX = target.x - Math.cos(angle) * r;
        const tipY = target.y - Math.sin(angle) * r;
        const head = 6 / Math.sqrt(k);
        context.fillStyle = "rgba(23, 61, 49, 0.75)";
        context.beginPath();
        context.moveTo(tipX, tipY);
        context.lineTo(tipX - head * Math.cos(angle - 0.45), tipY - head * Math.sin(angle - 0.45));
        context.lineTo(tipX - head * Math.cos(angle + 0.45), tipY - head * Math.sin(angle + 0.45));
        context.fill();
        if (phraseLinks && k > 0.9) {
          context.font = `${10 / k}px Inter, system-ui, sans-serif`;
          context.fillStyle = "rgba(101, 113, 105, 0.95)";
          context.textAlign = "center";
          context.fillText(
            relationshipPhrase(link.type),
            (source.x + target.x) / 2,
            (source.y + target.y) / 2 - 3 / k,
          );
        }
      }
    }

    // Nodes.
    for (const node of visible.current.nodes) {
      if (node.x === undefined || node.y === undefined) continue;
      const r = nodeRadius(node);
      context.globalAlpha = dim(node.id) ? 0.14 : 1;
      context.fillStyle = labelColor(node.label);
      context.beginPath();
      context.arc(node.x, node.y, r, 0, Math.PI * 2);
      context.fill();
      context.lineWidth = 1.5 / k;
      context.strokeStyle = "#fbfcf8";
      context.stroke();
      if (node.id === selected.current) {
        context.lineWidth = 3 / k;
        context.strokeStyle = "#d9ef70";
        context.beginPath();
        context.arc(node.x, node.y, r + 4 / k, 0, Math.PI * 2);
        context.stroke();
        context.lineWidth = 1.2 / k;
        context.strokeStyle = "#173d31";
        context.beginPath();
        context.arc(node.x, node.y, r + 6 / k, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.globalAlpha = 1;

    // Domain captions give the layout its structure: one region per part of the demo.
    if (!focusId) {
      context.textAlign = "center";
      context.textBaseline = "bottom";
      for (const domain of DOMAINS) {
        const members = visible.current.nodes.filter(
          (node) => domainOf(node.label) === domain.id && node.x !== undefined,
        );
        if (members.length < 2) continue;
        const cx = members.reduce((sum, node) => sum + (node.x ?? 0), 0) / members.length;
        const top = Math.min(...members.map((node) => (node.y ?? 0) - nodeRadius(node)));
        context.font = `700 ${11 / k}px Inter, system-ui, sans-serif`;
        context.lineWidth = 4 / k;
        context.strokeStyle = "rgba(247, 249, 243, 0.95)";
        context.strokeText(domain.title.toUpperCase(), cx, top - 14 / k);
        context.fillStyle = "rgba(101, 113, 105, 0.9)";
        context.fillText(domain.title.toUpperCase(), cx, top - 14 / k);
      }
    }

    // Labels: the focused neighborhood first, then the most connected nodes, skipping any label
    // that would overlap one already drawn so the canvas stays readable at every zoom level.
    context.textAlign = "center";
    context.textBaseline = "top";
    const candidates = visible.current.nodes
      .filter((node) => {
        if (node.x === undefined || node.y === undefined) return false;
        if (focusId) return neighborhood.has(node.id);
        if (node.label === "PushSend") return k >= 2.2;
        return nodeRadius(node) >= 10 || k >= 1.2 || ANCHOR_LABELS.has(node.label);
      })
      .sort(
        (a, b) =>
          Number(b.id === focusId) - Number(a.id === focusId) ||
          Number(ANCHOR_LABELS.has(b.label)) - Number(ANCHOR_LABELS.has(a.label)) ||
          b.degree - a.degree,
      );
    const placed: Array<[number, number, number, number]> = [];
    for (const node of candidates) {
      const r = nodeRadius(node);
      const strong = node.id === focusId;
      const fontSize = (strong ? 13 : 11) / k;
      context.font = `${strong ? 700 : 500} ${fontSize}px Inter, system-ui, sans-serif`;
      const text = node.name.length > 30 ? `${node.name.slice(0, 28)}…` : node.name;
      const width = context.measureText(text).width;
      const left = (node.x ?? 0) - width / 2 - 2 / k;
      const top = (node.y ?? 0) + r + 2 / k;
      const box: [number, number, number, number] = [
        left,
        top,
        left + width + 4 / k,
        top + fontSize * 1.25,
      ];
      if (
        !strong &&
        placed.some(([x1, y1, x2, y2]) => box[0] < x2 && box[2] > x1 && box[1] < y2 && box[3] > y1)
      )
        continue;
      placed.push(box);
      context.lineWidth = 3 / k;
      context.strokeStyle = "rgba(247, 249, 243, 0.95)";
      context.strokeText(text, node.x ?? 0, top + 1 / k);
      context.fillStyle = "#15221d";
      context.fillText(text, node.x ?? 0, top + 1 / k);
    }
  }

  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const { k, x, y } = transform.current;
    return {
      x: (clientX - (rect?.left ?? 0) - x) / k,
      y: (clientY - (rect?.top ?? 0) - y) / k,
    };
  };

  const hit = (clientX: number, clientY: number) => {
    const point = toWorld(clientX, clientY);
    let best: SimNode | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of visible.current.nodes) {
      if (node.x === undefined || node.y === undefined) continue;
      const distance = Math.hypot(node.x - point.x, node.y - point.y);
      const reach = nodeRadius(node) + 4 / transform.current.k;
      if (distance <= reach && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  };

  const animateTo = (next: Transform) => {
    if (reducedMotion()) {
      transform.current = next;
      draw();
      return;
    }
    const start = { ...transform.current };
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / 380);
      const ease = 1 - (1 - t) ** 3;
      transform.current = {
        k: start.k + (next.k - start.k) * ease,
        x: start.x + (next.x - start.x) * ease,
        y: start.y + (next.y - start.y) * ease,
      };
      paint();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /** Frames every visible node; returns false when there is nothing to frame yet. */
  const fit = (animate = true, only?: ReadonlySet<string>, centerId?: string) => {
    const nodes = visible.current.nodes.filter(
      (node) => node.x !== undefined && (!only || only.has(node.id)),
    );
    if (!nodes.length) return false;
    const xs = nodes.map((node) => node.x ?? 0);
    const ys = nodes.map((node) => node.y ?? 0);
    const [minX, maxX, minY, maxY] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...ys),
    ];
    // Measure directly: the first fit can run before the resize observer reports a size.
    const rect = wrapRef.current?.getBoundingClientRect();
    const { width, height } = rect?.width ? rect : size.current;
    // A focused node stays centered; its neighborhood sets the zoom.
    const center = centerId ? nodes.find((node) => node.id === centerId) : undefined;
    const spanX = center
      ? 2 * Math.max(Math.abs(maxX - (center.x ?? 0)), Math.abs((center.x ?? 0) - minX))
      : maxX - minX;
    const spanY = center
      ? 2 * Math.max(Math.abs(maxY - (center.y ?? 0)), Math.abs((center.y ?? 0) - minY))
      : maxY - minY;
    const zoom = Math.max(
      MIN_ZOOM,
      Math.min(only ? 2.2 : 1.6, Math.min(width / (spanX + 220), height / (spanY + 110))),
    );
    const cx = center?.x ?? (minX + maxX) / 2;
    const cy = center?.y ?? (minY + maxY) / 2;
    const next = { k: zoom, x: width / 2 - cx * zoom, y: height / 2 - cy * zoom };
    if (animate) animateTo(next);
    else {
      transform.current = next;
      draw();
    }
    return true;
  };

  const zoomAt = (factor: number, screenX: number, screenY: number, animate = false) => {
    const { k, x, y } = transform.current;
    const nextK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k * factor));
    const next = {
      k: nextK,
      x: screenX - ((screenX - x) / k) * nextK,
      y: screenY - ((screenY - y) / k) * nextK,
    };
    if (animate) animateTo(next);
    else {
      transform.current = next;
      draw();
    }
  };

  // Simulation lifecycle: one simulation, fed whatever is currently visible.
  useEffect(() => {
    const simulation = forceSimulation<SimNode, SimLink>()
      .force(
        "link",
        forceLink<SimNode, SimLink>()
          .id((node) => node.id)
          .distance((link) =>
            (link.source as SimNode).label === "PushSend" ||
            (link.target as SimNode).label === "PushSend"
              ? 55
              : 70,
          )
          // Links inside a domain pull hard; links across domains only hint at the connection.
          .strength((link) =>
            domainOf((link.source as SimNode).label) === domainOf((link.target as SimNode).label)
              ? 0.5
              : 0.06,
          ),
      )
      .force(
        "charge",
        forceManyBody<SimNode>()
          .strength((node) => (node.label === "PushSend" ? -40 : -180))
          .distanceMax(360),
      )
      .force(
        "collide",
        forceCollide<SimNode>((node) => nodeRadius(node) + (node.label === "PushSend" ? 3 : 6)),
      )
      // Each domain settles into its own region, so unrelated parts of the graph stay apart.
      .force("x", forceX<SimNode>((node) => anchorOf(node.label).x).strength(0.14))
      .force("y", forceY<SimNode>((node) => anchorOf(node.label).y).strength(0.14))
      .on("tick", () => {
        draw();
        if (!fitted.current && simulation.alpha() < 0.25) fitted.current = fit(false);
        // Settle the camera once the layout is nearly at rest, unless the viewer has taken over.
        if (!settled.current && simulation.alpha() < 0.03) {
          settled.current = true;
          if (!userMoved.current) fit();
        }
      });

    simRef.current = simulation;
    return () => {
      simulation.stop();
      cancelAnimationFrame(frame.current);
    };
  }, []);

  useEffect(() => {
    const simulation = simRef.current;
    if (!simulation) return;
    const nodes = graph.nodes.filter((node) => !hiddenLabels.has(node.label));
    const ids = new Set(nodes.map((node) => node.id));
    const links = graph.links.filter(
      (link) => ids.has(endpointId(link.source)) && ids.has(endpointId(link.target)),
    );
    visible.current = { nodes, links };
    simulation.nodes(nodes);
    simulation.force<ReturnType<typeof forceLink<SimNode, SimLink>>>("link")?.links(links);
    simulation.alpha(reducedMotion() ? 0.3 : 0.7).restart();
    if (reducedMotion()) {
      // Settle the layout up front instead of animating it.
      simulation.stop();
      simulation.tick(200);
      if (!fitted.current) fitted.current = fit(false);
      draw();
    }
  }, [graph, hiddenLabels]);

  useEffect(() => {
    selected.current = selectedId;
    draw();
  }, [selectedId]);

  useEffect(() => {
    if (!command) return;
    userMoved.current = command.kind !== "fit";
    const { width, height } = size.current;
    if (command.kind === "fit") fit();
    if (command.kind === "zoom-in") zoomAt(1.4, width / 2, height / 2, true);
    if (command.kind === "zoom-out") zoomAt(1 / 1.4, width / 2, height / 2, true);
    if (command.kind === "focus" && command.id) {
      const id = command.id;
      // Frame the node with its neighborhood; expanded nodes need a moment of layout first.
      window.setTimeout(
        () => {
          const ids = new Set([id]);
          for (const link of visible.current.links) {
            const from = endpointId(link.source);
            const to = endpointId(link.target);
            if (from === id) ids.add(to);
            if (to === id) ids.add(from);
          }
          fit(true, ids, id);
        },
        reducedMotion() ? 0 : 450,
      );
    }
  }, [command]);

  // Canvas sizing follows the container, at device resolution.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      size.current = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // Wheel zoom needs a non-passive listener so the page does not scroll underneath.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      userMoved.current = true;
      const rect = canvas.getBoundingClientRect();
      zoomAt(
        Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0022)),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const node = hit(event.clientX, event.clientY);
    pointer.current = node
      ? { mode: "node", node, startX: event.clientX, startY: event.clientY, moved: false }
      : {
          mode: "pan",
          startX: event.clientX,
          startY: event.clientY,
          origin: { ...transform.current },
          moved: false,
        };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const state = pointer.current;
    if (state.mode === "idle") {
      const node = hit(event.clientX, event.clientY);
      if (node !== hovered.current) {
        hovered.current = node;
        handlers.current.onHover(node);
        event.currentTarget.style.cursor = node ? "pointer" : "grab";
        draw();
      }
      return;
    }
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) < 4) return;
    state.moved = true;
    userMoved.current = true;
    if (state.mode === "pan") {
      transform.current = { ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy };
      event.currentTarget.style.cursor = "grabbing";
      draw();
    } else {
      const point = toWorld(event.clientX, event.clientY);
      state.node.fx = point.x;
      state.node.fy = point.y;
      simRef.current?.alphaTarget(0.25).restart();
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const state = pointer.current;
    pointer.current = { mode: "idle" };
    event.currentTarget.style.cursor = "grab";
    if (state.mode === "node") {
      simRef.current?.alphaTarget(0);
      if (state.moved) {
        // A dragged node stays where it was dropped, like pinning it on a board.
        return;
      }
      handlers.current.onSelect(state.node.id);
    } else if (state.mode === "pan" && !state.moved) handlers.current.onSelect(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const { width, height } = size.current;
    const pan = (dx: number, dy: number) => {
      transform.current = {
        ...transform.current,
        x: transform.current.x + dx,
        y: transform.current.y + dy,
      };
      draw();
    };
    const actions: Record<string, () => void> = {
      "+": () => zoomAt(1.25, width / 2, height / 2, true),
      "=": () => zoomAt(1.25, width / 2, height / 2, true),
      "-": () => zoomAt(0.8, width / 2, height / 2, true),
      "0": () => fit(),
      ArrowLeft: () => pan(60, 0),
      ArrowRight: () => pan(-60, 0),
      ArrowUp: () => pan(0, 60),
      ArrowDown: () => pan(0, -60),
      Escape: () => handlers.current.onSelect(null),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      userMoved.current = event.key !== "0" && event.key !== "Escape";
      action();
    }
  };

  const onPointerLeave = () => {
    if (hovered.current) {
      hovered.current = null;
      handlers.current.onHover(null);
      draw();
    }
  };

  const visibleCount = graph.nodes.filter((node) => !hiddenLabels.has(node.label)).length;
  const selectedNode = graph.nodes.find((node) => node.id === selectedId);

  return (
    <div className="graph-canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        tabIndex={0}
        role="img"
        aria-label={`Knowledge graph drawing with ${visibleCount} nodes${
          selectedNode ? `, ${labelName(selectedNode.label)} “${selectedNode.name}” selected` : ""
        }. Use plus and minus to zoom, arrow keys to pan, and 0 to fit. The panels list every node.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          pointer.current = { mode: "idle" };
        }}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
