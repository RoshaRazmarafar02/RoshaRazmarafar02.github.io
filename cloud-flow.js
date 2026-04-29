// Dataism bowtie as a particle flow field.
//
// Physics:
//   - Bidirectional particle flow along X, constrained by a central attractor
//     that pinches everything through a long flat bottleneck.
//   - Past the bottleneck, a nonlinear radial field expands particles into a fan.
//   - Curl-noise perturbation gives organic wander.
//   - Rendered as additive trail lines -> overlapping strands "burn brighter"
//     and produce fiber-bundle / braided illusion.
//
// Color system:
//   - Two anchor hues: cyan-teal (cool) and copper-magenta-ish (warm).
//   - Each particle has a bias toward one anchor.
//   - Along its path, color lerps longitudinally (0 at left -> 1 at right, modulated).
//   - Spatial bias: right side skews cool, left side skews warm (so streams cross).
//   - Density via additive alpha; micro-jitter on hue/lightness.

(function () {
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // --- Curl noise (2D) from a cheap hashed value noise ---------------------
  function hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash2(xi, yi);
    const b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1);
    const d = hash2(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  // Curl from scalar noise: returns (dN/dy, -dN/dx)
  function curl(x, y, t) {
    const eps = 1.0;
    const nx1 = vnoise(x, y + eps + t * 0.07);
    const nx2 = vnoise(x, y - eps + t * 0.07);
    const ny1 = vnoise(x + eps, y + t * 0.07);
    const ny2 = vnoise(x - eps, y + t * 0.07);
    const dndy = (nx1 - nx2) / (2 * eps);
    const dndx = (ny1 - ny2) / (2 * eps);
    return [dndy, -dndx];
  }

  // --- Color helpers -------------------------------------------------------
  // Two anchor hues matching Colorpong "Dataism IV": cyan + magenta on black.
  const HUE_COOL = 178;  // cyan
  const HUE_WARM = 310;  // magenta
  // Build a stop sequence of 3..5 hues alternating between cool and warm.
  // `startCool`=true means stops go cool, warm, cool, warm...
  function makeStops(startCool) {
    const n = 3;
    const stops = [];
    for (let i = 0; i < n; i++) {
      const cool = startCool ? (i % 2 === 0) : (i % 2 === 1);
      const jitter = (Math.random() - 0.5) * 8;
      stops.push(cool ? HUE_COOL + jitter : HUE_WARM + jitter);
    }
    return stops;
  }
  // Stops are still used, but we blend them with a vertical override so the
  // TOP half of the render is always magenta-leaning and the BOTTOM half
  // teal-leaning. The per-particle stops give longitudinal variation on top
  // of that spatial rule, so strands don't all look identical.
  function hueAtPoint(stops, along, yNorm) {
    // Base from the particle's own stop sequence
    const n = stops.length;
    let baseH;
    if (n === 1) baseH = stops[0];
    else {
      const segLen = 1 / (n - 1);
      const t = Math.min(1, Math.max(0, along));
      const idx = Math.min(n - 2, Math.floor(t / segLen));
      const local = (t - idx * segLen) / segLen;
      const a = stops[idx], b = stops[idx + 1];
      const u = local * local * (3 - 2 * local);
      baseH = a + (b - a) * u;
    }
    // Vertical override: yNorm in [-1,1] with +ve = bottom half (cyan), -ve = top (magenta).
    // Mix strongly with the base so top/bottom rule dominates near the tips
    // but mid-section strands can show stop variation.
    const topHue = HUE_WARM;  // magenta
    const botHue = HUE_COOL;  // cyan
    const targetH = yNorm > 0 ? botHue : topHue;
    // Mix weight: stronger in the fan zones (|yNorm| larger), softer near centerline
    const mix = Math.min(1, Math.abs(yNorm) * 1.4);
    return baseH + (targetH - baseH) * mix;
  }
  function strokeStyle(p, along, xNorm, yNorm) {
    let h = hueAtPoint(p.stops, along, yNorm);
    h += -xNorm * 6 + p.jitter * 6;
    const s = 90 + p.jitter * 8;
    const l = 58 + p.jitter * 10;
    return `hsl(${h.toFixed(1)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
  }

  let animState = null;

  window.__renderCloudFlow = function (canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Logical space: 1600x800. We draw in this space then let CSS scale.
    const W = 1600, H = 800;
    const CX = W / 2, CY = H / 2;

    // Retina-ish sizing
    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      // sx adapts to viewport width as before.
      // sy is locked to the original 720px reference height so making the
      // canvas taller only adds transparent bleed — it never stretches content.
      const sx = canvas.width / W;
      const sy = (720 * dpr) / H;
      const dy = (canvas.height - H * sy) / 2;
      ctx.setTransform(sx, 0, 0, sy, 0, dy);
    }
    resize();
    if (!window.__cloudFlowResizeBound) {
      window.addEventListener('resize', () => {
        resize();
      });
      window.__cloudFlowResizeBound = true;
    }

    // --- Particles -------------------------------------------------------
    // Each particle represents one "fiber" — it has a stable trajectory
    // (seeded target entry/exit points) and a trail drawn as additive lines.
    const COUNT = 70;
    // Unused now — pinch uses continuous exp falloff
    // const NECK_LEN = 960;
    // const NECK_HALF = NECK_LEN / 2;
    // const RAMP = 240;
    const FAN_Y = 380;
    // Two rope clusters share the same neck band, intertwined.
    // Small offset keeps a slight color bias in the band without a visible gap.
    const CLUSTER_OFFSET = 4;
    const NECK_CORE = 10;       // rope thickness at entrances (tight)
    const NECK_BELLY = 20;      // rope thickness at middle of neck (slightly looser)
    const NECK_FLARE = 34;      // loosest, right before the fan opens up
    const NECK_FRAC = 0.6;      // neck spans 60% of width (0.3 on each side of CX)

    // Per-side "bundles" — each fan splits into 3–5 discrete strand groups.
    // Evenly-spaced slots with noticeable jitter so it doesn't read as perfectly
    // symmetric, but contained enough that bundles stay close together.
    function makeBundles() {
      const n = 3 + ((Math.random() * 3) | 0); // 3..5
      const targets = [];
      const span = 1.1; // tighter total vertical range (was 1.7)
      for (let i = 0; i < n; i++) {
        const slot = n === 1 ? 0 : -span / 2 + (span / (n - 1)) * i;
        const jitter = (Math.random() - 0.5) * (span / n) * 0.9; // more asymmetry
        targets.push({ u: slot + jitter, spread: rand(0.12, 0.25) }); // 1.5× bundle spread
      }
      return targets;
    }
    const leftBundles = makeBundles();
    const rightBundles = makeBundles();

    const particles = [];
    for (let i = 0; i < COUNT; i++) {
      // Strongly bimodal color assignment — no mixed/violet particles.
      const isCool = Math.random() < 0.5;
      const bias = isCool ? rand(0.86, 0.99) : rand(0.01, 0.14);

      // Cluster band in the neck
      const clusterSide = isCool ? 1 : -1;
      const crossed = Math.random() < 0.15 ? -1 : 1;
      const clusterY = clusterSide * crossed * CLUSTER_OFFSET;

      // Pick a bundle on each side — the two sides are independent, so some
      // strands travel from one bundle to another (makes for interesting
      // directional variety at the neck).
      const bL = leftBundles[(Math.random() * leftBundles.length) | 0];
      const bR = rightBundles[(Math.random() * rightBundles.length) | 0];
      const uL = bL.u + (Math.random() - 0.5) * 2.5 * bL.spread;
      const uR = bR.u + (Math.random() - 0.5) * 2.75 * bR.spread;

      particles.push({
        // Per-particle entry delay (s) so strands appear individually
        entryDelay: Math.random() * 1.6,
        entryDur: rand(0.7, 1.3),
        yL: CY + uL * FAN_Y,
        yR: CY + uR * FAN_Y,
        xL: -80 - Math.random() * 120,
        xR: W + 80 + Math.random() * 120,
        neckOff: clusterY + (Math.random() - 0.5) * 3,
        // Rope twist per particle
        twistFreq: rand(0.008, 0.020),
        twistPhase: Math.random() * Math.PI * 2,
        twistSlot: Math.random() * Math.PI * 2,
        // Hover wave (gentle per-strand oscillation)
        waveSpeed: rand(-0.25, 0.25),
        wavePhase: Math.random() * Math.PI * 2,
        twistSpeed: rand(0.04, 0.10) * (Math.random() < 0.5 ? -1 : 1),
        // Curl noise offset so each particle samples a different slice
        noiseOffset: Math.random() * 1000,
        noiseFreq: rand(0.0035, 0.007),
        noiseAmp: rand(8, 22),  // slightly wilder fan-out
        // Color
        bias,
        // Vertical-biased gradient: top half starts magenta (warm), bottom half starts teal (cool).
        // Use the mean of left/right vertical targets to decide.
        stops: makeStops(((uL + uR) / 2) > 0),
        jitter: (Math.random() - 0.5) * 0.4, // much smaller jitter — keep colors pure
        // Per-strand line weight
        weight: rand(0.5, 0.9),
        alpha: rand(0.38, 0.68),
      });
    }

    // Static dots (cyan/magenta punctuation) — saturated, solid
    const DOTS = 90;
    const dots = [];
    for (let i = 0; i < DOTS; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      // Mix big accent dots with smaller scatter dots
      const big = Math.random() < 0.35;
      const x = CX + side * rand(big ? 420 : 300, 880);
      const y = CY + (Math.random() - 0.5) * FAN_Y * 1.9;
      const cool = Math.random() < 0.55;
      dots.push({
        x, y,
        r: big ? rand(2.8, 5.0) : rand(1.0, 2.2),
        phase: Math.random() * Math.PI * 2,
        freq: rand(0.3, 0.9),
        amp: rand(3.5, 8.0),
        hue: cool ? HUE_COOL + (Math.random() - 0.5) * 6 : HUE_WARM + (Math.random() - 0.5) * 10,
        light: rand(big ? 58 : 62, 72),
        solid: big,
      });
    }

    // Tip dots — small dots that ride along the loose ends of each strand.
    // Density packs the fan ends without adding more line particles.
    const TIP_DOTS = 260;
    const tipDots = [];
    for (let i = 0; i < TIP_DOTS; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      // Place in the fan region (outside the neck), biased toward the tips
      const xn = side * (0.35 + Math.pow(Math.random(), 0.6) * 0.65); // 0.35..1 from CX
      const x = CX + xn * (W / 2);
      const spread = Math.pow(Math.abs(xn) - 0.3, 1.1);
      // Match the strand tip-widening: 2× spread past 0.8
      const tipBoost = Math.abs(xn) > 0.8
        ? 1 + 1.0 * Math.min(1, (Math.abs(xn) - 0.8) / 0.2)
        : 1;
      const y = CY + (Math.random() - 0.5) * FAN_Y * 2 * spread * tipBoost;
      const cool = Math.random() < 0.5;
      tipDots.push({
        x, y,
        r: rand(0.8, 1.8),
        phase: Math.random() * Math.PI * 2,
        freq: rand(0.4, 1.0),
        amp: rand(3.0, 7.0),
        hue: cool ? HUE_COOL + (Math.random() - 0.5) * 5 : HUE_WARM + (Math.random() - 0.5) * 9,
        light: rand(55, 72),
      });
    }

    // Convert a particle's x position to its point on the trajectory at time t.
    function pointAt(p, x, t) {
      const dx = x - CX;
      const xn = dx / (W / 2);        // -1..1
      const absXn = Math.abs(xn);
      const neckHalf = NECK_FRAC;     // 0.6 => neck half = 0.3 in xn units (not px)
      const neckEdge = neckHalf / 2;  // xn at which neck transitions to fan = 0.3

      // Pinch: 0 inside the 60% neck (flat), then exp-ramp out past it.
      // Past neckEdge, remap remaining space to 0..1 and apply 1 - exp(-u²k).
      let pinch;
      if (absXn <= neckEdge) {
        pinch = 0;
      } else {
        const u = (absXn - neckEdge) / (1 - neckEdge); // 0..1+
        pinch = 1 - Math.exp(-(u * u) * 8);
      }

      const sgn = dx < 0 ? 0 : 1;
      const aL = p.yL - CY;
      const aR = p.yR - CY;
      // Tip widening: past ~80% of half-width, amplify vertical spread up to 2×
      // so the very ends of both fans are twice as wide.
      let tipBoost = 1;
      if (absXn > 0.8) {
        const u = Math.min(1, (absXn - 0.8) / 0.2); // 0..1 across outer 20%
        tipBoost = 1 + 1.0 * (u * u * (3 - 2 * u));
      }
      const baseY = (CY + p.neckOff) + ((1 - sgn) * aL + sgn * aR) * pinch * tipBoost;

      // Rope thickness profile across the neck:
      //   entrances (|xn| ≈ neckEdge): CORE (tight)
      //   middle (xn ≈ 0):              BELLY (slightly looser)
      // Past neckEdge fades up to FLARE as pinch takes over.
      let ropeY = 0;
      // Use a cosine bump that's maximal at xn=0 and drops to 0 at xn=±neckEdge
      const bellyInfluence = absXn < neckEdge
        ? Math.cos((absXn / neckEdge) * Math.PI * 0.5) // 1 at center, 0 at edge
        : 0;
      // Inside neck: core + belly; just past neck: flare fade
      let thickness;
      if (absXn <= neckEdge) {
        thickness = NECK_CORE + (NECK_BELLY - NECK_CORE) * bellyInfluence;
      } else {
        // short transition zone where rope loosens into the flare before the fan dominates
        const over = Math.min(1, (absXn - neckEdge) / 0.12);
        thickness = NECK_CORE + (NECK_FLARE - NECK_CORE) * over;
      }
      {
        const ang = x * p.twistFreq + p.twistPhase + t * p.twistSpeed;
        ropeY = Math.sin(ang + p.twistSlot) * thickness;
        // Fade rope influence once fully in the fan
        const fade = absXn <= neckEdge ? 1 : Math.max(0, 1 - (absXn - neckEdge) / 0.25);
        ropeY *= fade;
      }

      // Curl noise perturbation — small in neck, loose at the fan tips
      const [cx, cy] = curl(
        x * p.noiseFreq + p.noiseOffset,
        baseY * p.noiseFreq * 0.6 + p.noiseOffset * 0.5,
        t * 0.6
      );
      const yJitter = cy * p.noiseAmp * (0.15 + pinch * 1.4);
      const xJitter = cx * p.noiseAmp * 0.5 * (0.08 + pinch);

      // Hover wave — a slow, small vertical oscillation along each strand so
      // the lines appear to breathe in place. Phase varies by particle + x so
      // adjacent strands don't move in lockstep. Amplitude is gentle across
      // the full strand (larger near tips where strands are free).
      const waveAmp = 2.0 + 3.5 * absXn;          // px, grows toward tips
      const wave = Math.sin(
        t * (0.6 + p.waveSpeed) + p.wavePhase + x * 0.006
      ) * waveAmp;

      return { x: x + xJitter, y: baseY + ropeY + yJitter + wave, pinch };
    }

    // Render one particle's trail via many short additive line segments.
    function drawParticle(p, t) {
      // Per-particle entry: each strand reveals on its own delay.
      // We do a quick left→right per-strand wipe over entryDur once unblocked.
      const localT = t - p.entryDelay;
      if (localT <= 0) return;
      const e = Math.min(1, localT / p.entryDur);
      const ease = e * e * (3 - 2 * e);          // smoothstep
      const strandFront = ease * 1.15;            // slight overshoot to clear soft band
      const SAMPLES = 48;
      const xLen = p.xR - p.xL;
      let prev = null;
      // We draw each segment twice when it's near the front:
      //  - a base pass at normal weight/alpha (the trail)
      //  - a glow pass with thicker stroke + 'lighter' compositing, alpha
      //    proportional to how close the segment is to the leading edge.
      // The glow tapers off behind the head so the line settles to normal.
      for (let i = 0; i <= SAMPLES; i++) {
        const along = i / SAMPLES;
        const x = p.xL + xLen * along;
        const pt = pointAt(p, x, t);
        if (prev) {
          const xn = clamp((x - CX) / (W / 2), -1, 1);
          const xnDraw = (xn + 1) / 2;
          const soft = 0.22;
          const revealAlpha = clamp((strandFront - xnDraw) / soft, 0, 1);
          if (revealAlpha > 0.01) {
            const yn = clamp(((prev.y + pt.y) / 2 - CY) / FAN_Y, -1, 1);
            const ss = strokeStyle(p, along, xn, yn);

            // ---- Base trail segment ----
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = ss;
            ctx.globalAlpha = p.alpha * revealAlpha;
            ctx.lineWidth = p.weight;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(pt.x, pt.y);
            ctx.stroke();

            // ---- Glow pass at the leading tip ----
            // headness = 1 right at the front (revealAlpha→0 from above 0),
            // fading to 0 behind it. Only fires while the strand is still
            // entering (ease < 1) so the line settles to normal afterward.
            const headness = (1 - revealAlpha);
            // sharper falloff so the glow is concentrated at the tip
            const tipFalloff = Math.pow(headness, 2.4);
            const settle = 1 - Math.pow(Math.max(0, ease - 0.7) / 0.3, 1.5);
            const glowAmt = tipFalloff * Math.max(0, settle);
            if (glowAmt > 0.02) {
              ctx.globalCompositeOperation = 'lighter';
              // Outer wide soft glow
              ctx.strokeStyle = ss;
              ctx.lineWidth = p.weight * 5.5;
              ctx.globalAlpha = 0.18 * glowAmt;
              ctx.beginPath();
              ctx.moveTo(prev.x, prev.y);
              ctx.lineTo(pt.x, pt.y);
              ctx.stroke();
              // Mid glow
              ctx.lineWidth = p.weight * 2.8;
              ctx.globalAlpha = 0.35 * glowAmt;
              ctx.beginPath();
              ctx.moveTo(prev.x, prev.y);
              ctx.lineTo(pt.x, pt.y);
              ctx.stroke();
              // Bright hot core right at the tip
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = p.weight * 1.4;
              ctx.globalAlpha = 0.85 * glowAmt;
              ctx.beginPath();
              ctx.moveTo(prev.x, prev.y);
              ctx.lineTo(pt.x, pt.y);
              ctx.stroke();
              ctx.globalCompositeOperation = 'source-over';
            }
          }
        }
        prev = pt;
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // --- Animation loop --------------------------------------------------
    if (animState) animState.cancelled = true;
    const state = { cancelled: false, started: false, startTime: 0 };
    animState = state;

    // Start the reveal only when the canvas first scrolls into view.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !state.started) {
            state.started = true;
            state.startTime = performance.now();
            io.disconnect();
          }
        }
      }, { threshold: 0.15 });
      io.observe(canvas);
    } else {
      state.started = true;
      state.startTime = performance.now();
    }

    function tick(now) {
      if (state.cancelled) return;
      // Pre-reveal: clear and idle until the section comes into view
      const t = state.started ? (now - state.startTime) / 1000 : 0;
      const drawLines = state.started;

      // Clear to transparent (no black fill — let the page background show)
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // Clear the full physical canvas (not just logical W×H) so the bleed
      // area doesn't accumulate stale frames and appear thicker.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // No glow — source-over compositing keeps colors true
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Per-particle entry: drawParticle handles its own delay & wipe.
      // Track the longest strand finish time so dots fade in after lines settle.
      let maxFinish = 0;
      for (const p of particles) {
        const f = p.entryDelay + p.entryDur;
        if (f > maxFinish) maxFinish = f;
      }
      for (let i = 0; i < particles.length; i++) {
        drawParticle(particles[i], t);
      }

      // Global dot fade-in — dots fade up once most strands have appeared
      const dotIn = clamp((t - maxFinish * 0.55) / (maxFinish * 0.6), 0, 1);

      // Dots (big accents + scatter) — fade in with the wipe
      for (const d of dots) {
        const dx = Math.sin(t * d.freq + d.phase) * d.amp;
        const dy = Math.cos(t * d.freq * 0.9 + d.phase * 1.3) * d.amp * 0.8;
        ctx.beginPath();
        ctx.arc(d.x + dx, d.y + dy, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${d.hue.toFixed(0)} 92% ${d.light.toFixed(0)}%)`;
        ctx.globalAlpha = (d.solid ? 0.95 : 0.75) * dotIn;
        ctx.fill();
      }
      // Tip dots (small scatter riding the fan ends)
      for (const d of tipDots) {
        const dx = Math.sin(t * d.freq + d.phase) * d.amp;
        const dy = Math.cos(t * d.freq * 0.9 + d.phase * 1.3) * d.amp * 0.8;
        ctx.beginPath();
        ctx.arc(d.x + dx, d.y + dy, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${d.hue.toFixed(0)} 90% ${d.light.toFixed(0)}%)`;
        ctx.globalAlpha = 0.55 * dotIn;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };
})();
