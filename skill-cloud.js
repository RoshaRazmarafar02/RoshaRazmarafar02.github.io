// Skill cloud — organic scattered placement.
// Deterministic pseudo-random from seed so layout is stable across reloads,
// but can be re-shuffled on nav click.
(function () {
  const toolsSkills = [
    // Tier 1 — Identity (center of gravity)
    { t: 'ML', tier: 1, style: 'display' },
    { t: 'Generative Models', tier: 2, style: 'display' },
    { t: 'Representation Learning', tier: 3, style: 'display' },

    // Tier 2 — Core domains
    { t: 'Diffusion Models', tier: 2, style: 'display' },
    { t: 'RL', tier: 2, style: 'display' },
    { t: 'Optimization', tier: 2, style: 'display' },
    { t: 'Stochastic Modeling', tier: 2, style: 'serif' },
    { t: 'Dynamical Systems', tier: 2, style: 'serif' },

    // Tier 3 — Methods + ML ecosystem
    { t: 'Neural Networks', tier: 3, style: 'display' },
    { t: 'DL', tier: 1, style: 'display' },
    { t: 'Computer Vision', tier: 3, style: 'display' },
    { t: 'Information Theory', tier: 3, style: 'serif' },
    { t: 'Statistical Modeling', tier: 3, style: 'serif' },

    // Tier 3 — Tools (integrated, not separate)
    { t: 'Python', tier: 2, style: 'mono' },
    { t: 'PyTorch', tier: 3, style: 'display' },
    { t: 'C++', tier: 3, style: 'mono' },
    { t: 'Julia', tier: 3, style: 'mono' },
    { t: 'MATLAB', tier: 3, style: 'mono' },
    { t: 'JS', tier: 3, style: 'mono' },

    // Tier 4 — Supporting tools & systems
    { t: 'Linux', tier: 4, style: 'mono' },
    { t: 'Git', tier: 4, style: 'mono' },

    // Tier 4 — Extended / background
    { t: 'Complex Systems', tier: 4, style: 'serif' },
    { t: 'Control', tier: 4, style: 'serif' },
    { t: 'Monte Carlo', tier: 4, style: 'serif' },

    // Tier 4 — Modern + exploratory
    { t: 'Vector Databases', tier: 2, style: 'display' },
    { t: 'RAG Systems', tier: 2, style: 'display' },

    // Tier 4 — Background languages (low emphasis)
    { t: 'C#', tier: 4, style: 'mono' },
    { t: 'Java', tier: 4, style: 'mono' },
    { t: '.NET', tier: 4, style: 'mono' },
    { t: 'SQL', tier: 4, style: 'mono' },

  ];

  const TIER = {
    1: { size: 60, weight: 300, color: 'ink', lh: 1 },
    2: { size: 40, weight: 300, color: 'ink', lh: 1 },
    3: { size: 34, weight: 400, color: 'mid', lh: 1 },
    4: { size: 24, weight: 400, color: 'dim', lh: 1 },
  };

  // Simple deterministic RNG
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function measure(text, fontSize, fontFamily, weight) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    const m = ctx.measureText(text);
    return { w: m.width, h: fontSize * 1.05 };
  }

  function fontFor(style) {
    if (style === 'mono') return "'JetBrains Mono', ui-monospace, monospace";
    if (style === 'serif') return "'Instrument Serif', serif";
    return "'Space Grotesk', system-ui, sans-serif";
  }

  const CLOUD_SKILLS = {
    'skill-cloud':   toolsSkills,
    'skill-cloud-2': toolsSkills,
  };

  function layout(container, seed, skillsArr) {
    container.innerHTML = '';
    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const cx = W / 2;
    const cy = H / 2;

    const rand = mulberry32(seed || 42);
    // Sort by tier asc so big ones land first (near center).
    const items = [...skillsArr].sort((a, b) => a.tier - b.tier);
    const placed = []; // {x,y,w,h}

    const PAD = 28;

    function tryPlace(item, cfg, ff, sz, w, h, relaxBounds, relaxCollision) {
      const maxTries = relaxBounds ? 600 : 400;
      const tierBias = { 1: 0.12, 2: 0.32, 3: 0.55, 4: 0.78 }[item.tier];
      const scale = relaxBounds ? 0.88 : 0.82;
      for (let i = 0; i < maxTries; i++) {
        const jitter = relaxBounds ? (0.1 + rand() * 0.9) : (0.25 + rand() * 0.6);
        const effectiveBias = relaxBounds ? Math.max(tierBias, 0.1 + i / maxTries * 0.85) : tierBias;
        const rx = cx * scale * effectiveBias * jitter;
        const ry = cy * scale * effectiveBias * jitter;
        const theta = rand() * Math.PI * 2;
        const x = cx + Math.cos(theta) * rx;
        const y = cy + Math.sin(theta) * ry;

        const bx = x - w / 2 - PAD / 2;
        const by = y - h / 2 - PAD / 2;
        const bw = w + PAD;
        const bh = h + PAD;

        const margin = relaxBounds ? 2 : 4;
        if (bx < margin || by < margin || bx + bw > W - margin || by + bh > H - margin) continue;

        if (!relaxCollision) {
          let clash = false;
          for (const p of placed) {
            if (bx < p.x + p.w && bx + bw > p.x && by < p.y + p.h && by + bh > p.y) { clash = true; break; }
          }
          if (clash) continue;
        }
        return { x: bx, y: by, w: bw, h: bh, cx: x, cy: y };
      }
      return null;
    }

    for (const item of items) {
      const cfg = TIER[item.tier];
      const ff = fontFor(item.style);
      const sz = cfg.size * (W < 760 ? 0.72 : 1);
      const { w, h } = measure(item.t, sz, ff, cfg.weight);

      let best = tryPlace(item, cfg, ff, sz, w, h, false, false)
             || tryPlace(item, cfg, ff, sz, w, h, true, false)
             || tryPlace(item, cfg, ff, sz, w, h, true, true);

      if (!best) continue;
      placed.push(best);

      const el = document.createElement('div');
      el.className = `cloud-item ${item.style} ${cfg.color === 'dim' ? 'dim' : cfg.color === 'mid' ? 'mid' : ''}`;
      el.style.left = best.cx + 'px';
      el.style.top = best.cy + 'px';
      el.style.fontSize = sz + 'px';
      el.style.fontWeight = cfg.weight;
      el.style.lineHeight = cfg.lh;
      el.style.animationDelay = (placed.length * 14) + 'ms';
      el.textContent = item.t;
      container.appendChild(el);
    }
  }

  window.__renderCloud = function (containerId, seed) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const skillsArr = CLOUD_SKILLS[containerId] || toolsSkills;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => layout(el, seed, skillsArr));
    } else {
      layout(el, seed, skillsArr);
    }
    let t;
    const onR = () => { clearTimeout(t); t = setTimeout(() => layout(el, seed, skillsArr), 180); };
    window.addEventListener('resize', onR, { passive: true });
  };
})();
