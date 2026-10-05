/*
 * Neuron network background.
 *
 * The previous version was a proximity mesh: every particle connected to every
 * other nearby particle, which reads as undifferentiated static. This version
 * models it as a small neural network instead:
 *
 *   - Two node populations. Neurons (larger, brighter, few) fire signals down
 *     axons; nodes (smaller, dimmer, many) are the surrounding tissue.
 *   - Synapses persist between specific pairs rather than being recomputed from
 *     proximity every frame. A network that never forgets looks like a real
 *     graph rather than a particle effect.
 *   - Signals travel along synapses, flash the receiving node as they land, and
 *     a fraction of arrivals are relayed onward, so pulses cross the field
 *     instead of stopping dead at the first synapse.
 *   - Edges are drawn with a slight curve, which is what makes them read as
 *     biological structures instead of a wireframe.
 *
 * Three bugs this version is built around, all of which showed up as white
 * lines leaving their own path:
 *
 *   1. The impulse head was drawn with the full curve's control point. For a
 *      quadratic that point is only correct at t = 0.5, so any sub-arc drawn
 *      with it bowed away from the axon underneath it. The head arc now comes
 *      from a de Casteljau split, which is exact at every t.
 *   2. Nodes wrap at the canvas edge. A node that teleported kept its synapses,
 *      so for a frame or two an edge spanned the whole viewport as a long white
 *      streak. Wrapping is now detected in the same frame and those synapses are
 *      dropped before anything is drawn, plus a hard length cap as a backstop.
 *   3. Signal speed and curve bend were re-rolled every frame. Both moved in
 *      visible jumps. Speed is now constant along the arc in pixels per frame,
 *      and bend eases toward a target instead of being reassigned outright.
 *
 * Design constraints, unchanged from v3:
 *  - Monochrome. Everything is white at low alpha; depth comes from opacity.
 *  - Subtle. Synapses only form within a short radius, counts are capped, and
 *    the whole field is decoration behind content, never over it.
 *  - Cheap. Canvas 2D, no WebGL, no dependencies, no per-frame allocation in
 *    the draw path (stroke colour is set once and modulated with globalAlpha).
 *  - Accessible. Fully disabled under prefers-reduced-motion, and paused when
 *    the tab is hidden or the canvas leaves the viewport.
 */

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 0 = tissue node, 1 = neuron. Neurons are brighter and fire more often. */
  neuron: boolean;
  /** Decaying excitement, drives the glow radius. */
  excitement: number;
  /** Countdown before this node may fire again, keeps pulses from stacking. */
  cooldown: number;
  /** Set for the frame this node wraps, so its synapses can be dropped. */
  wrapped: boolean;
}

interface Synapse {
  from: number;
  to: number;
  /** Current curve offset, eased toward bendTarget so the shape never pops. */
  bend: number;
  /** Where bend is heading. Re-rolled occasionally, never applied outright. */
  bendTarget: number;
  /** Current signal strength along this edge, decays to 0. */
  signal: number;
  /** Signal travel position, 0 at the source and 1 at the target. */
  travel: number;
  /** Hops travelled, capped so a pulse cannot loop around forever. */
  hops: number;
}

interface Options {
  canvas: HTMLCanvasElement;
  /** Higher means fewer nodes. */
  density?: number;
  /** Max connection length for a synapse. */
  reach?: number;
  repelRadius?: number;
}

const TAU = Math.PI * 2;
const WHITE = 'rgb(255 255 255)';

/** One frame at 60fps. All motion is scaled by a delta measured against this. */
const FRAME_MS = 1000 / 60;
/** Signal head speed along the arc, in pixels per frame. */
const SIGNAL_PX_PER_FRAME = 3.4;
/** Length of the visible impulse head, as a fraction of the arc. */
const IMPULSE_LENGTH = 0.34;
/** Signal reaches full brightness over this much of the arc, then fades. */
const IMPULSE_FADE = 0.72;
/** A pulse stops relaying past this many synapses. */
const MAX_HOPS = 5;
/** Rewire and pointer-force intervals, in milliseconds. */
const REWIRE_MS = 1500;
const POINTER_MS = 90;

export function initParticles({
  canvas,
  density = 11000,
  reach = 128,
  repelRadius = 155,
}: Options): () => void {
  const maybeContext = canvas.getContext('2d', { alpha: true });
  if (!maybeContext) return () => {};

  // The drawing helpers below are hoisted declarations, and TS does not carry
  // the null narrowing into their bodies, so bind a non-nullable name.
  const context: CanvasRenderingContext2D = maybeContext;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) return () => {};

  let width = 0;
  let height = 0;
  let ratio = 1;
  let nodes: Node[] = [];
  let synapses: Synapse[] = [];
  let frame = 0;
  let running = false;
  let inViewport = true;
  let tabVisible = document.visibilityState === 'visible';
  let lastTime = 0;
  let rewireClock = 0;
  let pointerClock = 0;

  const pointer = { x: -9999, y: -9999, active: false };

  // Fraction of nodes that are neurons. Kept low so pulses stay occasional.
  const NEURON_RATIO = 0.12;
  const MAX_NODES = 96;
  /** Longest edge drawn. Stretched edges fade out before they reach this. */
  const edgeLimit = reach * 2.6;
  /** Curve offset bound. Beyond this the arc reads as a kink, not a bend. */
  const maxBend = 0.3;

  /** Scratch point for the impulse head, so drawing never allocates. */
  const arc = { startX: 0, startY: 0, cx: 0, cy: 0, endX: 0, endY: 0 };

  function makeNode(neuron: boolean): Node {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      radius: neuron ? Math.random() * 1.6 + 2.2 : Math.random() * 1.1 + 0.7,
      neuron,
      excitement: 0,
      cooldown: Math.random() * 90,
      wrapped: false,
    };
  }

  function resize(): void {
    const pixels = Math.max(1, canvas.clientWidth * canvas.clientHeight);
    // Doubling a 4K background is 8 million pixels of fill every frame, so the
    // pixel ratio is capped harder on very large canvases. Hairlines still look
    // fine at 1.25.
    ratio = Math.min(window.devicePixelRatio || 1, pixels > 2_600_000 ? 1.25 : 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    // Cap the count so large monitors do not take a heavier GPU load.
    const target = Math.min(MAX_NODES, Math.round(pixels / density));
    const neuronCount = Math.max(4, Math.round(target * NEURON_RATIO));

    nodes = Array.from({ length: target }, (_, index) => makeNode(index < neuronCount));
    synapses = [];
    growSynapses();
  }

  /**
   * Build the initial synapse graph.
   *
   * Neurons get several outgoing axons so the network has visible hubs instead
   * of a uniform mesh. Tissue nodes get one, which is what lets a signal relay
   * from a landing point onward instead of stopping there.
   *
   * Each node is wired to its nearest unused neighbour, found by repeated
   * nearest-neighbour passes rather than by sorting a candidate list, so this
   * allocates only the membership set below.
   */
  function growSynapses(): void {
    const cap = nodes.length * 2;
    if (synapses.length >= cap) return;

    const existing = new Set<string>();
    for (const synapse of synapses) existing.add(`${synapse.from}:${synapse.to}`);

    for (let index = 0; index < nodes.length && synapses.length < cap; index += 1) {
      const node = nodes[index];
      const maxOut = node.neuron ? 4 : 1;
      const range = node.neuron ? reach * 1.7 : reach * 1.2;
      const rangeSquared = range * range;

      for (let pass = 0; pass < maxOut && synapses.length < cap; pass += 1) {
        let nearest = -1;
        let nearestDistance = rangeSquared;

        for (let other = 0; other < nodes.length; other += 1) {
          if (other === index) continue;
          if (existing.has(`${index}:${other}`)) continue;
          // Squared distance: this loop runs for every node, so the sqrt is
          // worth skipping.
          const dx = nodes[other].x - node.x;
          const dy = nodes[other].y - node.y;
          const distance = dx * dx + dy * dy;
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = other;
          }
        }

        if (nearest < 0) break;

        existing.add(`${index}:${nearest}`);
        const bendTarget = (Math.random() - 0.5) * maxBend;
        synapses.push({
          from: index,
          to: nearest,
          bend: bendTarget,
          bendTarget,
          signal: 0,
          travel: 0,
          hops: 0,
        });
      }
    }
  }

  /**
   * Let synapses drift in and out of range.
   *
   * Called occasionally rather than every frame. The shape of an edge is eased
   * toward its target in stepSignals, so this only decides where each curve is
   * heading, which keeps the graph alive without any edge snapping to a new
   * shape.
   */
  function rewire(): void {
    // Re-roll a few targets. The bend eases toward these in stepSignals, so the
    // curve morphs instead of snapping. Re-rolling everything here would average
    // out to a straight line.
    const rolls = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < rolls && synapses.length > 0; i += 1) {
      const synapse = synapses[(Math.random() * synapses.length) | 0];
      synapse.bendTarget = (Math.random() - 0.5) * maxBend;
    }

    prune();

    // Unwire the odd edge, then let the graph regrow around the gap.
    if (synapses.length > 0 && Math.random() < 0.5) {
      const drop = (Math.random() * synapses.length) | 0;
      if (synapses[drop].signal <= 0) synapses.splice(drop, 1);
    }
  }

  /**
   * Drop synapses that would draw badly.
   *
   * Called in the same frame a node wraps, because an edge attached to a node
   * that just teleported spans the viewport for as long as it is kept.
   */
  function prune(): void {
    let changed = false;
    let write = 0;

    for (let i = 0; i < synapses.length; i += 1) {
      const synapse = synapses[i];
      const a = nodes[synapse.from];
      const b = nodes[synapse.to];

      let keep = a !== undefined && b !== undefined;
      if (keep) {
        if (a!.wrapped || b!.wrapped) keep = false;
        else if (synapse.signal <= 0 && Math.hypot(a!.x - b!.x, a!.y - b!.y) > edgeLimit) keep = false;
      }

      if (keep) {
        synapses[write] = synapse;
        write += 1;
      } else {
        changed = true;
      }
    }

    synapses.length = write;
    for (const node of nodes) node.wrapped = false;

    // Regrow so the field keeps its density after nodes leave.
    if (changed) growSynapses();
  }

  /** A signal landed: light the node, and sometimes pass it on. */
  function arrive(index: number, synapse: Synapse): void {
    const node = nodes[index];
    if (!node) return;

    node.excitement = 1;

    if (synapse.hops >= MAX_HOPS) return;
    if (Math.random() > (node.neuron ? 0.55 : 0.22)) return;

    for (let i = 0; i < synapses.length; i += 1) {
      const outgoing = synapses[i];
      // Never straight back down the axon the signal arrived on.
      if (outgoing.from !== index || outgoing.signal > 0 || outgoing.to === synapse.from) continue;
      outgoing.signal = 1;
      outgoing.travel = 0;
      outgoing.hops = synapse.hops + 1;
      return;
    }
  }

  function fire(nodeIndex: number): void {
    // Neurons do not fire down every axon at once; a subset keeps it organic.
    const maxToFire = 2 + Math.floor(Math.random() * 2);
    let fired = 0;

    for (let i = 0; i < synapses.length && maxToFire > 0; i += 1) {
      const synapse = synapses[i];
      if (synapse.from !== nodeIndex || synapse.signal > 0) continue;
      synapse.signal = 1;
      synapse.travel = 0;
      synapse.hops = 0;
      fired += 1;
      if (fired >= maxToFire) break;
    }
  }

  function stepSignals(delta: number): void {
    for (const synapse of synapses) {
      // Curve shape is eased every frame rather than at rewire time, so an edge
      // never changes shape in a single visible jump.
      const bend = synapse.bend;
      if (bend !== synapse.bendTarget) {
        synapse.bend = bend + (synapse.bendTarget - bend) * 0.05 * delta;
      }

      if (synapse.signal <= 0) continue;

      const a = nodes[synapse.from];
      const b = nodes[synapse.to];
      if (!a || !b) {
        synapse.signal = 0;
        continue;
      }

      // Advance by a constant number of pixels, so a pulse moves at the same
      // speed along a short axon as along a long one. Randomising the increment
      // per frame is what made the head jitter.
      const arcLength = Math.hypot(b.x - a.x, b.y - a.y) * 1.08 + 1;
      synapse.travel += (SIGNAL_PX_PER_FRAME * delta) / arcLength;
      // Slight fade as the signal travels, so arrival reads as an event.
      synapse.signal = Math.min(1, (1 - synapse.travel) / IMPULSE_FADE);

      if (synapse.travel >= 1) {
        synapse.signal = 0;
        synapse.travel = 0;
        arrive(synapse.to, synapse);
      }
    }
  }

  function step(delta: number): void {
    let wrapped = false;

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      node.x += node.vx * delta;
      node.y += node.vy * delta;

      // Wrap at the edges so density stays even without respawn logic. The flag
      // makes prune drop the node's synapses in this same frame.
      if (node.x < -12) {
        node.x = width + 12;
        node.wrapped = true;
        wrapped = true;
      } else if (node.x > width + 12) {
        node.x = -12;
        node.wrapped = true;
        wrapped = true;
      }
      if (node.y < -12) {
        node.y = height + 12;
        node.wrapped = true;
        wrapped = true;
      } else if (node.y > height + 12) {
        node.y = -12;
        node.wrapped = true;
        wrapped = true;
      }

      if (node.excitement > 0) node.excitement = Math.max(0, node.excitement - 0.022 * delta);

      if (node.cooldown > 0) {
        node.cooldown -= delta;
        continue;
      }

      // Neurons fire periodically; tissue nodes only relay what lands on them.
      if (node.neuron && Math.random() < 0.006 * delta) {
        fire(index);
        node.excitement = 1;
        node.cooldown = 70 + Math.random() * 160;
      }
    }

    if (wrapped) prune();
    stepSignals(delta);
  }

  /**
   * Control points for the slice of a quadratic between t0 and t1.
   *
   * de Casteljau, written into a scratch object so the draw loop stays
   * allocation free. Reusing the full curve's control point instead, as an
   * earlier version did, is what put the impulse head off the axon.
   */
  function sliceArc(
    ax: number,
    ay: number,
    cx: number,
    cy: number,
    bx: number,
    by: number,
    t0: number,
    t1: number,
  ): void {
    // Split at t0 into (a, p1, m) and (m, p2, b).
    const p1x = ax + (cx - ax) * t0;
    const p1y = ay + (cy - ay) * t0;
    const p2x = cx + (bx - cx) * t0;
    const p2y = cy + (by - cy) * t0;
    const mx = p1x + (p2x - p1x) * t0;
    const my = p1y + (p2y - p1y) * t0;

    // Split the right half again at the normalised position of t1.
    const span = 1 - t0;
    const u = span > 0 ? (t1 - t0) / span : 0;
    const q1x = mx + (p2x - mx) * u;
    const q1y = my + (p2y - my) * u;
    const q2x = p2x + (bx - p2x) * u;
    const q2y = p2y + (by - p2y) * u;

    arc.startX = mx;
    arc.startY = my;
    arc.cx = q1x;
    arc.cy = q1y;
    arc.endX = q1x + (q2x - q1x) * u;
    arc.endY = q1y + (q2y - q1y) * u;
  }

  /** Base axon plus, when one is in flight, the bright head along the same arc. */
  function drawSynapse(synapse: Synapse): void {
    const a = nodes[synapse.from];
    const b = nodes[synapse.to];
    if (!a || !b) return;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);

    // Backstop for the wrap case: nothing this long is ever drawn.
    if (length >= edgeLimit) return;

    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    // Perpendicular offset, so the bend always bows away from the straight line.
    const controlX = midX - dy * synapse.bend;
    const controlY = midY + dx * synapse.bend;

    // Base axon: always faintly visible, brighter when the nodes are close, and
    // faded out over the last stretch so a stretching edge dissolves rather than
    // snapping off.
    const closeness = 1 - length / edgeLimit;
    context.lineWidth = 0.55;
    context.globalAlpha = 0.05 + closeness * closeness * 0.09;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.quadraticCurveTo(controlX, controlY, b.x, b.y);
    context.stroke();

    if (synapse.signal <= 0) return;

    // Impulse: a short arc of the same curve, brightening as it arrives.
    const head = synapse.travel < 1 ? synapse.travel : 1;
    const tail = Math.max(0, head - IMPULSE_LENGTH);
    sliceArc(a.x, a.y, controlX, controlY, b.x, b.y, tail, head);

    context.lineWidth = 1.15;
    context.globalAlpha = 0.16 + synapse.signal * 0.5;
    context.beginPath();
    context.moveTo(arc.startX, arc.startY);
    context.quadraticCurveTo(arc.cx, arc.cy, arc.endX, arc.endY);
    context.stroke();
  }

  function draw(): void {
    context.globalAlpha = 1;
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    context.strokeStyle = WHITE;

    // Synapses underneath, so nodes sit on top of the network.
    for (const synapse of synapses) drawSynapse(synapse);

    context.fillStyle = WHITE;
    for (const node of nodes) {
      // Excitement both fills and enlarges the node, so an arriving signal is
      // visible as the cell lighting up.
      const glow = node.excitement;
      const radius = node.radius * (1 + glow * 1.5);
      const alpha = (node.neuron ? 0.5 : 0.3) + glow * 0.45;

      context.globalAlpha = alpha > 1 ? 1 : alpha;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, TAU);
      context.fill();

      // Excited nodes get a halo, which is what sells the pulse.
      if (glow > 0.02) {
        context.lineWidth = 0.7;
        context.globalAlpha = glow * 0.22;
        context.beginPath();
        context.arc(node.x, node.y, radius + glow * 7, 0, TAU);
        context.stroke();
      }
    }

    context.globalAlpha = 1;
  }

  function loop(now: number): void {
    if (!running) return;

    // Motion is measured against a 60fps frame, so a 120Hz display runs the
    // field at the same speed rather than twice as fast.
    const delta = Math.min(3, Math.max(0, (now - lastTime) / FRAME_MS));
    lastTime = now;

    pointerClock += delta;
    if (pointerClock >= POINTER_MS / FRAME_MS) {
      pointerClock = 0;
      applyPointerForce();
    }

    // Rewire roughly every 1.5s: alive enough to avoid a static graph, rare
    // enough that the network does not visibly churn.
    rewireClock += delta;
    if (rewireClock >= REWIRE_MS / FRAME_MS) {
      rewireClock = 0;
      rewire();
    }

    step(delta);
    draw();
    frame = requestAnimationFrame(loop);
  }

  /** Single place where start and stop happen, so two loops can never coexist. */
  function sync(): void {
    const shouldRun = inViewport && tabVisible;
    if (shouldRun === running) return;

    running = shouldRun;
    if (running) {
      lastTime = performance.now();
      frame = requestAnimationFrame(loop);
    } else {
      cancelAnimationFrame(frame);
    }
  }

  function onPointerMove(event: PointerEvent): void {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }

  function onPointerLeave(): void {
    pointer.active = false;
  }

  /** Pull nodes away from the cursor. Declared here to keep step() tidy. */
  function applyPointerForce(): void {
    if (!pointer.active) return;
    for (const node of nodes) {
      const dx = node.x - pointer.x;
      const dy = node.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance === 0 || distance > repelRadius) continue;
      const force = (1 - distance / repelRadius) * 0.6;
      node.x += (dx / distance) * force;
      node.y += (dy / distance) * force;
    }
  }

  function onVisibilityChange(): void {
    tabVisible = document.visibilityState === 'visible';
    sync();
  }

  function onReducedMotionChange(event: MediaQueryListEvent): void {
    if (event.matches) destroy();
  }

  // Pause entirely when scrolled away: the field is fixed, so no point drawing.
  const observer = new IntersectionObserver(
    ([entry]) => {
      inViewport = entry.isIntersecting;
      sync();
    },
    { threshold: 0 },
  );

  // ResizeObserver rather than a window listener: the canvas is fixed, so a
  // viewport resize is not the only thing that can change its box.
  const resizeObserver = new ResizeObserver(resize);

  function destroy(): void {
    running = false;
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerleave', onPointerLeave);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    reduceMotion.removeEventListener('change', onReducedMotionChange);
    observer.disconnect();
    resizeObserver.disconnect();
    context.globalAlpha = 1;
    context.clearRect(0, 0, width, height);
  }

  resize();
  observer.observe(canvas);
  resizeObserver.observe(canvas);

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', onPointerLeave);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reduceMotion.addEventListener('change', onReducedMotionChange);

  // Fade the canvas in once the first frame is ready, avoiding a hard pop-in.
  requestAnimationFrame(() => {
    canvas.classList.add('is-visible');
    sync();
  });

  return destroy;
}