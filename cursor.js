// Custom magenta cursor — soft circular glow that follows with easing
// and leaves a brief node-like fading trail.
(function () {
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
  if (window.__cursorMounted) return;
  window.__cursorMounted = true;

  const root = document.createElement('div');
  root.className = 'cursor-root';
  root.innerHTML = `
    <canvas class="cursor-trail" aria-hidden="true"></canvas>
    <div class="cursor-glow" aria-hidden="true"></div>
    <div class="cursor-dot" aria-hidden="true"></div>
  `;
  document.body.appendChild(root);

  const trail = root.querySelector('.cursor-trail');
  const glow = root.querySelector('.cursor-glow');
  const dot = root.querySelector('.cursor-dot');

  const tctx = trail.getContext('2d', { alpha: true });
  let DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resizeTrail() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    trail.width = window.innerWidth * DPR;
    trail.height = window.innerHeight * DPR;
    trail.style.width = window.innerWidth + 'px';
    trail.style.height = window.innerHeight + 'px';
    tctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resizeTrail();
  window.addEventListener('resize', resizeTrail);

  let tx = window.innerWidth / 2, ty = window.innerHeight / 2;
  let gx = tx, gy = ty;     // glow follows with easing
  let dx = tx, dy = ty;     // dot snaps tighter
  let visible = false;

  // Trail samples: [{x, y, t}], age-fading like hero nodes
  const samples = [];
  const TRAIL_DURATION = 0.55; // seconds before a sample fades to zero

  function show() {
    if (visible) return;
    visible = true;
    root.classList.add('is-visible');
  }

  window.addEventListener('mousemove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
    show();
  }, { passive: true });

  window.addEventListener('mouseleave', () => {
    visible = false;
    root.classList.remove('is-visible');
  });
  window.addEventListener('mouseenter', () => show());

  const HOVER_SEL = 'a, button, [role="button"], .nav-link, .cloud-item, .proj-row, .scroll-cue, input, textarea, select, summary';
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest && e.target.closest(HOVER_SEL)) root.classList.add('is-hover');
  }, true);
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest(HOVER_SEL)) root.classList.remove('is-hover');
  }, true);

  window.addEventListener('mousedown', () => root.classList.add('is-down'));
  window.addEventListener('mouseup',   () => root.classList.remove('is-down'));

  function tick(now) {
    const t = now / 1000;

    // Dot snaps tighter (still tiny ease to avoid jitter)
    dx += (tx - dx) * 0.55;
    dy += (ty - dy) * 0.55;
    // Glow eases (soft trailing)
    gx += (tx - gx) * 0.22;
    gy += (ty - gy) * 0.22;

    // Push a trail sample at the dot position only if it moved enough.
    // (Stationary samples produce stacked round line caps that look like
    // little dots floating on the trail.)
    const last = samples[samples.length - 1];
    if (!last || Math.hypot(dx - last.x, dy - last.y) > 1.5) {
      samples.push({ x: dx, y: dy, t });
    }
    while (samples.length > 1 && t - samples[0].t > TRAIL_DURATION) samples.shift();

    // Render trail — smooth quadratic curve through samples instead of
    // discrete line segments. Width and alpha vary along the curve based on
    // each sample's age, drawn as many short interpolated sub-segments.
    tctx.clearRect(0, 0, trail.width / DPR, trail.height / DPR);
    if (visible && samples.length >= 2) {
      tctx.lineCap = 'butt';
      tctx.lineJoin = 'round';

      // Build smoothed midpoints for a quadratic-curve path (Catmull-like
      // smoothing using midpoints as anchors).
      const pts = samples;
      // Sub-divide each pair of midpoints to vary width/alpha continuously.
      const SUB = 6;
      for (let i = 1; i < pts.length - 1; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        // Two midpoints + the control point p1 form a quadratic Bézier
        const m0x = (p0.x + p1.x) / 2, m0y = (p0.y + p1.y) / 2;
        const m1x = (p1.x + p2.x) / 2, m1y = (p1.y + p2.y) / 2;

        for (let s = 0; s < SUB; s++) {
          const u0 = s / SUB;
          const u1 = (s + 1) / SUB;
          // quadratic Bézier point
          const bz = (u, ax, ay, bx, by, cx, cy) => {
            const iu = 1 - u;
            return [iu * iu * ax + 2 * iu * u * bx + u * u * cx,
                    iu * iu * ay + 2 * iu * u * by + u * u * cy];
          };
          const [x0, y0] = bz(u0, m0x, m0y, p1.x, p1.y, m1x, m1y);
          const [x1, y1] = bz(u1, m0x, m0y, p1.x, p1.y, m1x, m1y);

          // Age interpolated between p1 and p2 across the sub
          const age0 = t - p1.t;
          const age1 = t - p2.t;
          const age = age0 + (age1 - age0) * u1;
          const k = Math.max(0, 1 - age / TRAIL_DURATION);
          if (k < 0.02) continue;
          // Skip degenerate sub-segments so end caps can't stack into dots.
          if (Math.hypot(x1 - x0, y1 - y0) < 0.6) continue;

          tctx.lineWidth = 1.2 + 5.0 * k;
          tctx.strokeStyle = `hsla(178, 95%, 55%, ${(0.55 * k).toFixed(3)})`;
          tctx.beginPath();
          tctx.moveTo(x0, y0);
          tctx.lineTo(x1, y1);
          tctx.stroke();
        }
      }
    }

    glow.style.transform = `translate3d(${gx}px, ${gy}px, 0) translate(-50%, -50%)`;
    dot.style.transform  = `translate3d(${dx}px, ${dy}px, 0) translate(-50%, -50%)`;

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
