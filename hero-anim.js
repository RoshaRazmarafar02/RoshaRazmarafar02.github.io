// Hero node-graph animation
// Smooth Brownian wander inside a soft circular boundary, fading trails,
// bold magenta + complementary teal palette.
(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });

  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  // Palette: bold magenta (hue 310) + teal (hue 178).
  const PALETTE = [
    { r: 245, g: 30,  b: 210 },  // bold magenta
    { r: 232, g: 95,  b: 220 },  // soft magenta
    { r: 200, g: 0,   b: 172 },  // deep magenta
    { r: 25,  g: 229, b: 223 },  // bright teal
    { r: 72,  g: 166, b: 180 },  // mid teal
  ];

  const NODE_COUNT = 110;
  const CONNECT_RADIUS = 180;
  const MAX_EDGES_PER_NODE = 3;
  const TRAIL_DURATION = 3; // seconds before a trail segment fades to zero

  let CLUSTER_CX = 0, CLUSTER_CY = 0, CLUSTER_R = 0;

  const nodes = [];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    CLUSTER_CX = W * (W > 900 ? 0.68 : 0.5);
    CLUSTER_CY = H * 0.5;
    CLUSTER_R = Math.min(W, H) * (W > 900 ? 0.28 : 0.34);
  }

  function seedNodes() {
    nodes.length = 0;
    for (let i = 0; i < NODE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = CLUSTER_R * Math.pow(Math.random(), 0.55);
      const x = CLUSTER_CX + Math.cos(angle) * r;
      const y = CLUSTER_CY + Math.sin(angle) * r;
      const color = PALETTE[i % PALETTE.length];
      nodes.push({
        x, y,
        px: x, py: y,
        vx: 0, vy: 0,
        tax: 0, tay: 0,
        ax: 0, ay: 0,
        size: 1.1 + Math.random() * 1.3,
        color,
        twinkle: Math.random() * Math.PI * 2,
        noiseSeed: Math.random() * 1000,
        trail: [], // [{x, y, t}, ...] timestamped positions
      });
    }
  }

  function step(dt, t) {
    for (const n of nodes) {
      if (Math.random() < dt * 1.4) {
        n.tax = (Math.random() - 0.5) * 0.9;
        n.tay = (Math.random() - 0.5) * 0.9;
      }
      const lp = 1 - Math.exp(-dt * 3.5);
      n.ax += (n.tax - n.ax) * lp;
      n.ay += (n.tay - n.ay) * lp;

      n.vx += n.ax * dt * 18;
      n.vy += n.ay * dt * 18;

      const damp = Math.exp(-dt * 1.8);
      n.vx *= damp;
      n.vy *= damp;

      const px = n.x - CLUSTER_CX;
      const py = n.y - CLUSTER_CY;
      const d = Math.hypot(px, py);
      if (d > CLUSTER_R) {
        const over = (d - CLUSTER_R) / CLUSTER_R;
        const pull = (0.12 + over * 0.9) * dt * 14;
        n.vx -= (px / d) * pull;
        n.vy -= (py / d) * pull;
      }

      n.px = n.x; n.py = n.y;
      n.x += n.vx * dt * 18;
      n.y += n.vy * dt * 18;
      n.twinkle += dt * 1.2;

      // Record position with timestamp, trim points older than TRAIL_DURATION
      n.trail.push({ x: n.x, y: n.y, t });
      while (n.trail.length > 1 && t - n.trail[0].t > TRAIL_DURATION) n.trail.shift();
    }
  }

  function drawFrame(dt, t) {
    ctx.clearRect(0, 0, W, H);

    // Trails — each segment's alpha is purely age-based, guaranteed zero at TRAIL_DURATION
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.8;
    for (const n of nodes) {
      const trail = n.trail;
      if (trail.length < 2) continue;
      const c = n.color;
      for (let i = 1; i < trail.length; i++) {
        const age = t - trail[i].t;
        const alpha = Math.max(0, 1 - age / TRAIL_DURATION) * 0.3;
        if (alpha < 0.01) continue;
        ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
    }

    // Edges
    ctx.lineWidth = 0.6;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const neigh = [];
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < CONNECT_RADIUS) neigh.push({ b, d });
      }
      neigh.sort((p, q) => p.d - q.d);
      const take = neigh.slice(0, MAX_EDGES_PER_NODE);
      for (const { b, d } of take) {
        if (b.x + b.y < a.x + a.y) continue;
        const alpha = (1 - d / CONNECT_RADIUS) * 0.2;
        const mix = {
          r: (a.color.r + b.color.r) / 2,
          g: (a.color.g + b.color.g) / 2,
          bl: (a.color.b + b.color.b) / 2,
        };
        ctx.strokeStyle = `rgba(${mix.r},${mix.g},${mix.bl},${alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Nodes — subtle smooth glow
    for (const n of nodes) {
      const tw = 0.78 + 0.22 * Math.sin(n.twinkle);
      const c = n.color;

      const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.size * 9);
      grd.addColorStop(0,    `rgba(${c.r},${c.g},${c.b},${(0.28 * tw).toFixed(3)})`);
      grd.addColorStop(0.45, `rgba(${c.r},${c.g},${c.b},${(0.08 * tw).toFixed(3)})`);
      grd.addColorStop(1,    `rgba(${c.r},${c.g},${c.b},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.size * 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${(0.85 * tw + 0.1).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt, now / 1000);
    drawFrame(dt, now / 1000);
    requestAnimationFrame(loop);
  }

  const ro = new ResizeObserver(() => {
    resize();
    seedNodes();
  });
  ro.observe(canvas);

  resize();
  seedNodes();
  requestAnimationFrame(loop);
})();
