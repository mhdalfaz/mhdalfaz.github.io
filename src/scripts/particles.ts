/*
 * Drifting particle field, drawn on a single canvas.
 *
 * Design constraints:
 *  - Monochrome. Particles and links are white at low alpha, so the effect
 *    reads as depth rather than colour.
 *  - Subtle. Density scales with viewport area and is capped; links only form
 *    between nearby particles, so the network never becomes visual noise.
 *  - Cheap. ~60 lines of drawing maths, no dependencies, no 3D context.
 *  - Accessible. Bails out entirely for prefers-reduced-motion and pauses
 *    when the tab is hidden or the canvas scrolls out of view.
 *
 * The cursor repels particles slightly, which makes the background feel
 * responsive without ever overlapping text.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface Options {
  canvas: HTMLCanvasElement;
  /** Max particles per megapixel-ish area unit. */
  density?: number;
  linkDistance?: number;
  /** Cursor influence radius in px. */
  repelRadius?: number;
}

const TAU = Math.PI * 2;

export function initParticles({
  canvas,
  density = 9000,
  linkDistance = 132,
  repelRadius = 150,
}: Options): () => void {
  const maybeContext = canvas.getContext('2d', { alpha: true });
  if (!maybeContext) return () => {};
  // Bound to a non-nullable name: the helper functions below are hoisted
  // declarations, and TS will not carry the narrowing into their bodies.
  const context: CanvasRenderingContext2D = maybeContext;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) return () => {};

  let width = 0;
  let height = 0;
  let ratio = 1;
  let particles: Particle[] = [];
  let frame = 0;
  let running = true;
  let visible = true;

  const pointer = { x: -9999, y: -9999, active: false };

  function resize(): void {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    // Cap the count so large monitors do not get a heavier GPU load.
    const target = Math.min(110, Math.round((width * height) / density));
    particles = Array.from({ length: target }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      radius: Math.random() * 1.4 + 0.5,
    }));
  }

  function draw(): void {
    context.clearRect(0, 0, width, height);

    // Links first so dots render on top of them.
    context.lineWidth = 0.6;
    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const squared = dx * dx + dy * dy;
        if (squared > linkDistance * linkDistance) continue;

        // Alpha falls off with distance, so links fade rather than pop.
        context.strokeStyle = `rgba(255,255,255,${0.12 * (1 - Math.sqrt(squared) / linkDistance)})`;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }

    for (const particle of particles) {
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, TAU);
      context.fillStyle = 'rgba(255,255,255,0.4)';
      context.fill();
    }
  }

  function step(): void {
    for (const particle of particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;

      // Wrap at the edges so density stays even without respawn logic.
      if (particle.x < -10) particle.x = width + 10;
      else if (particle.x > width + 10) particle.x = -10;
      if (particle.y < -10) particle.y = height + 10;
      else if (particle.y > height + 10) particle.y = -10;

      if (!pointer.active) continue;

      const dx = particle.x - pointer.x;
      const dy = particle.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance === 0 || distance > repelRadius) continue;

      // Gentle push away from the cursor; falls off toward the edge.
      const force = (1 - distance / repelRadius) * 0.7;
      particle.x += (dx / distance) * force;
      particle.y += (dy / distance) * force;
    }
  }

  function tick(): void {
    if (!running) return;
    step();
    draw();
    frame = requestAnimationFrame(tick);
  }

  function onPointerMove(event: PointerEvent): void {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }

  function onPointerLeave(): void {
    pointer.active = false;
  }

  function onVisibilityChange(): void {
    // Stop burning frames while the tab is in the background.
    running = document.visibilityState === 'visible';
    if (running) frame = requestAnimationFrame(tick);
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
    frame = requestAnimationFrame(tick);
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
        frame = requestAnimationFrame(tick);
      }
    },
    { threshold: 0 },
  );
  observer.observe(canvas);

  // Throttle resize to one handler per frame.
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', onPointerLeave);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reduceMotion.addEventListener('change', onReducedMotionChange);

  return destroy;
}