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
 *   - Signals travel along synapses and flash the receiving node as they land,
 *     so there is visible directionality and a pulse rhythm.
 *   - Edges are drawn with a slight curve, which is what makes them read as
 *     biological structures instead of a wireframe.
 *
 * Design constraints, unchanged from v3:
 *  - Monochrome. Everything is white at low alpha; depth comes from opacity.
 *  - Subtle. Synapses only form within a short radius, counts are capped, and
 *    the whole field is decoration behind content, never over it.
 *  - Cheap. Canvas 2D, no WebGL, no dependencies.
 *  - Accessible. Fully disabled under prefers-reduced-motion, and paused when
 *    the tab is hidden or the canvas leaves the viewport.
 */

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 0 = tissue node, 1 = neuron. Neurons are brighter and can fire. */
  neuron: boolean;
  /** Decaying excitement, drives the glow radius. */
  excitement: number;
  /** Countdown before this node may fire again, keeps pulses from stacking. */
  cooldown: number;
}

interface Synapse {
  from: number;
  to: number;
  /** Stable per-edge offset so the curve does not flicker between frames. */
  bend: number;
  /** Current signal strength along this edge, decays to 0. */
  signal: number;
  /** Signal travel position, 0 at the source and 1 at the target. */
  travel: number;
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
  let running = true;
  let visible = true;

  const pointer = { x: -9999, y: -9999, active: false };

  // Fraction of nodes that are neurons. Kept low so pulses stay occasional.
  const NEURON_RATIO = 0.12;

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
    };
  }

  function resize(): void {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    // Cap the count so large monitors do not take a heavier GPU load.
    const target = Math.min(96, Math.round((width * height) / density));
    const neuronCount = Math.max(4, Math.round(target * NEURON_RATIO));

    nodes = Array.from({ length: target }, (_, index) => makeNode(index < neuronCount));
    synapses = [];
    growSynapses();
  }

  /**
   * Build the initial synapse graph.
   *
   * Only neurons emit axons, so the network has visible hubs instead of a
   * uniform mesh. Each neuron connects to its nearest few tissue nodes.
   */
  function growSynapses(): void {
    const maxPerNeuron = 5;
    const neurons = nodes.filter((node) => node.neuron);

    for (const neuron of neurons) {
      const index = nodes.indexOf(neuron);
      const candidates = nodes
        .map((node, other) => ({
          index: other,
          node,
          distance: Math.hypot(node.x - neuron.x, node.y - neuron.y),
        }))
        .filter((candidate) => candidate.index !== index && candidate.distance < reach * 2)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, maxPerNeuron);

      for (const candidate of candidates) {
        if (synapses.some((syn) => syn.from === index && syn.to === candidate.index)) continue;
        synapses.push({
          from: index,
          to: candidate.index,
          bend: (Math.random() - 0.5) * 0.32,
          signal: 0,
          travel: 0,
        });
      }
    }
  }

  /**
   * Let synapses drift in and out of range.
   *
   * Called occasionally rather than every frame. Edges that stretch too far or
   * dangle without carrying a signal are removed and occasionally re-grown,
   * which keeps the graph alive without rebuilding it every frame.
   */
  function rewire(): void {
    for (const synapse of synapses) {
      const a = nodes[synapse.from];
      const b = nodes[synapse.to];
      if (!a || !b) continue;
      synapse.bend += (Math.random() - 0.5) * 0.03;
    }

    synapses = synapses.filter((synapse) => {
      const a = nodes[synapse.from];
      const b = nodes[synapse.to];
      if (!a || !b) return false;
      // Drop stale edges that carry no signal.
      if (synapse.signal === 0 && Math.hypot(a.x - b.x, a.y - b.y) > reach * 2.4) return false;
      return true;
    });

    if (synapses.length < nodes.length && Math.random() < 0.3) growSynapses();
  }

  function fire(nodeIndex: number): void {
    const outgoing = synapses.filter((synapse) => synapse.from === nodeIndex && synapse.signal === 0);
    if (outgoing.length === 0) return;

    // Neurons do not fire down every axon at once; a subset keeps it organic.
    const maxToFire = 2 + Math.floor(Math.random() * 2);
    for (const synapse of outgoing.slice(0, maxToFire)) {
      synapse.signal = 1;
      synapse.travel = 0;
    }
  }

  function stepSignals(): void {
    for (const synapse of synapses) {
      if (synapse.signal <= 0) continue;

      synapse.travel += 0.014 + Math.random() * 0.006;
      // Slight fade as the signal travels, so arrival reads as an event.
      synapse.signal = Math.max(0, 1 - synapse.travel * 0.42);

      if (synapse.travel >= 1) {
        const target = nodes[synapse.to];
        if (target) target.excitement = 1;
        synapse.signal = 0;
        synapse.travel = 0;
      }
    }
  }

  function step(): void {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      node.x += node.vx;
      node.y += node.vy;

      // Wrap at the edges so density stays even without respawn logic.
      if (node.x < -12) node.x = width + 12;
      else if (node.x > width + 12) node.x = -12;
      if (node.y < -12) node.y = height + 12;
      else if (node.y > height + 12) node.y = -12;

      if (node.excitement > 0) node.excitement = Math.max(0, node.excitement - 0.022);

      if (node.cooldown > 0) {
        node.cooldown -= 1;
        continue;
      }

      // Neurons fire periodically; tissue nodes never initiate.
      if (node.neuron && Math.random() < 0.006) {
        fire(index);
        node.excitement = 1;
        node.cooldown = 70 + Math.random() * 160;
      }
    }

    stepSignals();
  }

  /** Quadratic control point offset from the edge midpoint, for a soft curve. */
  function drawSynapse(synapse: Synapse): void {
    const a = nodes[synapse.from];
    const b = nodes[synapse.to];
    if (!a || !b) return;

    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    // Perpendicular offset, so the bend always bows away from the straight line.
    const controlX = midX - dy * synapse.bend;
    const controlY = midY + dx * synapse.bend;

    const length = Math.hypot(dx, dy);
    const closeness = Math.max(0, 1 - length / (reach * 2.4));

    // Base axon: always faintly visible, brighter when the nodes are close.
    context.lineWidth = 0.55;
    context.strokeStyle = `rgba(255,255,255,${0.05 + closeness * 0.08})`;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.quadraticCurveTo(controlX, controlY, b.x, b.y);
    context.stroke();

    if (synapse.signal <= 0) return;

    // Impulse: a short arc of the curve, brightening as it arrives.
    const head = Math.min(1, synapse.travel);
    const tail = Math.max(0, head - 0.34);
    if (tail >= head) return;

    const start = pointOnCurve(a, controlX, controlY, b, tail);
    const end = pointOnCurve(a, controlX, controlY, b, head);

    context.lineWidth = 1.15;
    context.strokeStyle = `rgba(255,255,255,${0.16 + synapse.signal * 0.5})`;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.quadraticCurveTo(controlX, controlY, end.x, end.y);
    context.stroke();
  }

  /** Evaluate a quadratic bezier at t, returning the point. */
  function pointOnCurve(a: Node, cx: number, cy: number, b: Node, t: number) {
    const inverse = 1 - t;
    return {
      x: inverse * inverse * a.x + 2 * inverse * t * cx + t * t * b.x,
      y: inverse * inverse * a.y + 2 * inverse * t * cy + t * t * b.y,
    };
  }

  function draw(): void {
    context.clearRect(0, 0, width, height);

    // Synapses underneath, so nodes sit on top of the network.
    for (const synapse of synapses) drawSynapse(synapse);

    for (const node of nodes) {
      // Excitement both fills and enlarges the node, so an arriving signal is
      // visible as the cell lighting up.
      const glow = node.excitement;
      const radius = node.radius * (1 + glow * 1.5);
      const alpha = (node.neuron ? 0.5 : 0.3) + glow * 0.45;

      context.beginPath();
      context.arc(node.x, node.y, radius, 0, TAU);
      context.fillStyle = `rgba(255,255,255,${alpha})`;
      context.fill();

      // Excited neurons get a halo, which is what sells the pulse.
      if (glow > 0.02) {
        context.beginPath();
        context.arc(node.x, node.y, radius + glow * 7, 0, TAU);
        context.strokeStyle = `rgba(255,255,255,${glow * 0.22})`;
        context.lineWidth = 0.7;
        context.stroke();
      }
    }
  }

  // Frame counter drives the cursor force and the occasional rewire, so no
  // second timer is needed.
  let frames = 0;

  function loop(): void {
    if (!running) return;
    frames += 1;

    // Every 4th frame is smooth enough for the cursor force while leaving most
    // frames free for signal stepping.
    if (frames % 4 === 0) applyPointerForce();
    // Rewire roughly every 1.5s: alive enough to avoid a static graph, rare
    // enough that the network does not visibly churn.
    if (frames % 90 === 0) rewire();

    step();
    draw();
    frame = requestAnimationFrame(loop);
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
    running = document.visibilityState === 'visible';
    if (running) frame = requestAnimationFrame(loop);
    else cancelAnimationFrame(frame);
  }

  function onReducedMotionChange(event: MediaQueryListEvent): void {
    if (event.matches) destroy();
  }

  function destroy(): void {
    running = false;
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerleave', onPointerLeave);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    reduceMotion.removeEventListener('change', onReducedMotionChange);
    observer?.disconnect();
    resizeObserver.disconnect();
    context.clearRect(0, 0, width, height);
  }

  resize();

  // Fade the canvas in once the first frame is ready, avoiding a hard pop-in.
  requestAnimationFrame(() => {
    canvas.classList.add('is-visible');
    frame = requestAnimationFrame(loop);
  });

  // Pause entirely when scrolled away: the field is fixed, so no point drawing.
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (!visible && running) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (visible && !running && document.visibilityState === 'visible') {
        running = true;
        frame = requestAnimationFrame(loop);
      }
    },
    { threshold: 0 },
  );
  observer.observe(canvas);

  // ResizeObserver rather than a window listener: the canvas is fixed, so a
  // viewport resize is not the only thing that can change its box.
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', onPointerLeave);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reduceMotion.addEventListener('change', onReducedMotionChange);

  return destroy;
}