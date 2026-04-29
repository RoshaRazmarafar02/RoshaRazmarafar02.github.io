(function () {
  const mount = document.getElementById("rl-lab");
  if (!mount) return;

  mount.innerHTML = `
    <div class="rl-shell">
      <div class="rl-panel">
        <div class="rl-topbar">
          <div>
            <div class="rl-kicker">gridworld://cat-agent</div>
            <h3>Reinforcement Learning Micro-Lab: Cat vs. Mouse</h3>
          </div>
          <div class="rl-status">
            <span class="rl-dot"></span>
            idle
          </div>
        </div>

        <canvas id="rl-canvas" width="560" height="560"></canvas>

        <div class="rl-controls">
            <button data-action="train-fast">Train</button>
            <button data-action="demo">Run Policy</button>
            <button data-action="step">One Step</button>
            <button data-action="reset">Reset</button>        
        </div>
      </div>

      <div class="rl-side">
        <div class="rl-stat">
          <span>episode</span>
          <strong id="rl-episode">000</strong>
        </div>
        <div class="rl-stat">
          <span>steps</span>
          <strong id="rl-steps">00</strong>
        </div>
        <div class="rl-stat">
          <span>epsilon</span>
          <strong id="rl-epsilon">0.40</strong>
        </div>
        
        <div class="rl-stat">
            <span>success</span>
            <strong id="rl-success">0%</strong>
        </div>
        <div class="rl-stat">
            <span>avg reward</span>
            <strong id="rl-avg-reward">0.0</strong>
        </div>
        <div class="rl-stat">
            <span>policy</span>
            <strong id="rl-policy">raw</strong>
        </div>
        <div class="rl-note">
          Press <b>Train</b> to let the cat learn over multiple episodes, then <b>Run Policy</b> to see the learned behavior. The cat explores the grid, seeking the mouse while avoiding walls, and learns from rewards and penalties.
          Press <b>One Step</b> to advance the simulation incrementally, or <b>Reset</b> to start fresh with new random positions and walls.
        </div>
      </div>
    </div>
  `;

  const canvas = document.getElementById("rl-canvas");
  const ctx = canvas.getContext("2d");

  const agentImg  = new Image();
  const targetImg = new Image();
  let _assetsReady = 0;
  agentImg.onload = targetImg.onload = () => { if (++_assetsReady === 2) draw(); };
  agentImg.src  = 'assets/cat/agent.png';
  targetImg.src = 'assets/cat/target.png';

  const grid = 8;
  const cell = canvas.width / grid;

  const cat      = { x: 1, y: 6 };
  const mouse    = { x: 6, y: 1 };
  const catStart = { x: 1, y: 6 };
  const walls = [
    { x: 3, y: 2 },
    { x: 3, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
    { x: 5, y: 4 },
  ];

  const actions = [
    { name: "up",    dx:  0, dy: -1 },
    { name: "down",  dx:  0, dy:  1 },
    { name: "left",  dx: -1, dy:  0 },
    { name: "right", dx:  1, dy:  0 },
  ];

  const q = {};

  let episode  = 0;
  let steps    = 0;
  let epsilon  = 0.4;
  const alpha  = 0.25;
  const gamma  = 0.9;
  let running  = false;
  let timer    = null;
  let winFlash  = 0;
  let showPath  = false;
  let successes = 0;
  let episodeReward = 0;
  let winRewards = [];

  // ── helpers ──────────────────────────────────────────────────────────────

  function stateKey(pos) { return `${pos.x},${pos.y}`; }

  function getQ(state) {
    if (!q[state]) q[state] = [0, 0, 0, 0];
    return q[state];
  }

  function isWall(x, y)    { return walls.some(w => w.x === x && w.y === y); }
  function isOutside(x, y) { return x < 0 || x >= grid || y < 0 || y >= grid; }

  function hasPath(sx, sy, ex, ey) {
    const visited = new Set();
    const queue = [{ x: sx, y: sy }];
    visited.add(`${sx},${sy}`);
    while (queue.length) {
      const { x, y } = queue.shift();
      if (x === ex && y === ey) return true;
      for (const { dx, dy } of actions) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (!isOutside(nx, ny) && !isWall(nx, ny) && !visited.has(k)) {
          visited.add(k); queue.push({ x: nx, y: ny });
        }
      }
    }
    return false;
  }

  function policyReachesGoal() {
    const visited = new Set();
    let x = catStart.x, y = catStart.y;
    for (let i = 0; i < grid * grid; i++) {
      const key = `${x},${y}`;
      if (visited.has(key)) return false;
      visited.add(key);
      if (x === mouse.x && y === mouse.y) return true;
      const { dx, dy } = actions[chooseBestAction(key)];
      const nx = x + dx, ny = y + dy;
      if (isOutside(nx, ny) || isWall(nx, ny)) return false;
      x = nx; y = ny;
    }
    return false;
  }

  function safeCells() {
    const safe = new Set();
    const pad = (px, py) => {
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const nx = px + dx, ny = py + dy;
          if (!isOutside(nx, ny)) safe.add(`${nx},${ny}`);
        }
    };
    pad(cat.x, cat.y);
    pad(mouse.x, mouse.y);
    return safe;
  }

  function randomizeCatMouse() {
    for (let attempt = 0; attempt < 400; attempt++) {
      const cx = Math.floor(Math.random() * grid);
      const cy = Math.floor(Math.random() * grid);
      const mx = Math.floor(Math.random() * grid);
      const my = Math.floor(Math.random() * grid);
      const dist = Math.abs(cx - mx) + Math.abs(cy - my);
      if (dist < 7) continue;
      if (isWall(cx, cy) || isWall(mx, my)) continue;
      cat.x = cx;   cat.y = cy;
      catStart.x = cx; catStart.y = cy;
      mouse.x = mx; mouse.y = my;
      if (hasPath(cx, cy, mx, my)) return;
    }
    // fallback
    cat.x = catStart.x = 1; cat.y = catStart.y = 6;
    mouse.x = 6; mouse.y = 1;
  }

  function randomizeWalls() {
    walls.length = 0;
    const safe = safeCells();
    const numGroups = 2 + Math.floor(Math.random() * 2); // 2–3 groups

    for (let g = 0; g < numGroups; g++) {
      for (let attempt = 0; attempt < 150; attempt++) {
        // Bias seed toward the midpoint between cat and mouse (t in 0.25–0.75)
        // with a random offset of ±1–2 cells so groups don't all stack exactly
        const t   = 0.25 + Math.random() * 0.5;
        const jx  = Math.round((Math.random() - 0.5) * 3);
        const jy  = Math.round((Math.random() - 0.5) * 3);
        const sx  = Math.min(grid - 1, Math.max(0, Math.round(cat.x + t * (mouse.x - cat.x)) + jx));
        const sy  = Math.min(grid - 1, Math.max(0, Math.round(cat.y + t * (mouse.y - cat.y)) + jy));
        if (safe.has(`${sx},${sy}`) || isWall(sx, sy)) continue;

        // Grow a connected group of 2–4 cells
        const group = [{ x: sx, y: sy }];
        const size = 2 + Math.floor(Math.random() * 3);
        let cur = group[0];

        for (let i = 1; i < size; i++) {
          const dirs = [{ dx:0,dy:-1 },{ dx:0,dy:1 },{ dx:-1,dy:0 },{ dx:1,dy:0 }]
            .sort(() => Math.random() - 0.5);
          for (const { dx, dy } of dirs) {
            const nx = cur.x + dx, ny = cur.y + dy;
            const key = `${nx},${ny}`;
            if (!isOutside(nx, ny) && !safe.has(key) && !isWall(nx, ny)
                && !group.some(c => c.x === nx && c.y === ny)) {
              group.push({ x: nx, y: ny });
              cur = { x: nx, y: ny };
              break;
            }
          }
        }

        if (group.length < 2) continue;

        for (const c of group) walls.push(c);
        if (!hasPath(cat.x, cat.y, mouse.x, mouse.y)) {
          for (let i = 0; i < group.length; i++) walls.pop();
        } else {
          break; // group placed successfully
        }
      }
    }
  }

  function resetCat() { cat.x = catStart.x; cat.y = catStart.y; steps = 0; }

  function chooseAction(state) {
    if (Math.random() < epsilon) return Math.floor(Math.random() * actions.length);
    return chooseBestAction(state);
  }

  function chooseBestAction(state) {
    const values = getQ(state);
    let best = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[best]) best = i;
    }
    return best;
  }

  function takeAction(actionIndex, animate = true) {
    const action = actions[actionIndex];
    const nx = cat.x + action.dx;
    const ny = cat.y + action.dy;

    if (isOutside(nx, ny) || isWall(nx, ny)) {
      return { next: { x: cat.x, y: cat.y }, reward: -0.5, done: false };
    }

    cat.x = nx;
    cat.y = ny;

    const reachedMouse = cat.x === mouse.x && cat.y === mouse.y;
    if (reachedMouse) {
      winFlash = 10;
      if (animate) playWinAnimation();
    }
    return {
      next:   { x: cat.x, y: cat.y },
      reward: reachedMouse ? 10 : -0.1,
      done:   reachedMouse,
    };
  }

  // ── learning ──────────────────────────────────────────────────────────────

  function LearningStep(shouldDraw = true) {
    const state       = stateKey(cat);
    const actionIndex = chooseAction(state);
    const result      = takeAction(actionIndex, shouldDraw);
    const nextState   = stateKey(result.next);

    const currentQ = getQ(state);
    const nextQ    = getQ(nextState);
    const oldValue = currentQ[actionIndex];
    const bestNext = Math.max(...nextQ);

    currentQ[actionIndex] = oldValue + alpha * (result.reward + gamma * bestNext - oldValue);
    episodeReward += result.reward;
    steps++;

    if (result.done || steps >= 80) {
      if (result.done) {
        successes++;
        winRewards.push(episodeReward);
        if (winRewards.length > 20) winRewards.shift();
      }
      episodeReward = 0;
      episode++;
      epsilon = Math.max(0.05, epsilon * 0.985);
      resetCat();
    }

    updateState();
    if (shouldDraw) draw();
  }

  function trainFast(episodesTarget = 25) {
    if (running) return;
    const target = episode + episodesTarget;
    while (episode < target) {
      LearningStep(false);
    }
    epsilon = 0.0;
    showPath = true;
    resetCat();
    updateState();
    draw();
  }

  function demoPolicy() {
    if (running) return;
    running = true;
    epsilon = 0.0;
    resetCat();
    updateState();
    draw();

    timer = setInterval(() => {
      const state       = stateKey(cat);
      const actionIndex = chooseBestAction(state);
      const result      = takeAction(actionIndex);
      steps++;

      if (result.done) {
        updateState();
        draw();
        clearInterval(timer);
        running = false;
        return;
      }

      // Bail if stuck (shouldn't happen with a trained policy, but safety net)
      if (steps > 30) {
        clearInterval(timer);
        running = false;
      }

      updateState();
      draw();
    }, 180);
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  function updateState() {
    const successRate = episode > 0 ? (successes / episode) * 100 : 0;
    const avgReward   = winRewards.length > 0
      ? winRewards.reduce((a, b) => a + b, 0) / winRewards.length
      : 0;

    document.getElementById("rl-episode").textContent     = episode.toString().padStart(3, "0");
    document.getElementById("rl-steps").textContent       = steps.toString().padStart(2, "0");
    document.getElementById("rl-epsilon").textContent     = epsilon.toFixed(2);
    document.getElementById("rl-success").textContent     = `${successRate.toFixed(0)}%`;
    document.getElementById("rl-avg-reward").textContent  = winRewards.length > 0 ? avgReward.toFixed(1) : "—";
    document.getElementById("rl-policy").textContent      = policyReachesGoal() ? "learned" : "exploring";
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = "rgba(16,16,19,0.72)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        ctx.strokeStyle = "rgba(234,231,225,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x * cell, y * cell, cell, cell);
      }
    }

    // Q-value glow — cells the agent has learned value for
    ctx.fillStyle = "rgba(25,229,223,0.06)";
    for (let key in q) {
      const [x, y] = key.split(',').map(Number);
      const maxVal = Math.max(...q[key]);
      if (maxVal > 0) ctx.fillRect(x * cell, y * cell, cell, cell);
    }

    // Path hint — greedy policy trace from cat start to mouse
    drawPathHint();

    // Walls
    walls.forEach(w => {
      ctx.fillStyle = "rgba(234,231,225,0.14)";
      ctx.fillRect(w.x * cell + 8, w.y * cell + 8, cell - 16, cell - 16);
    });

    // Win flash on mouse cell
    if (winFlash > 0) {
      ctx.fillStyle = "rgba(25,229,223,0.22)";
      ctx.fillRect(mouse.x * cell, mouse.y * cell, cell, cell);
      winFlash--;
    }

    drawToken(mouse.x, mouse.y, targetImg, "rgba(25,229,223,0.18)", 0,  1.5);
    drawToken(cat.x,   cat.y,   agentImg,  "rgba(235,71,210,0.20)", 6,  2.0);
  }

  function drawToken(x, y, img, glow, yOffset = 0, sizeScale = 1) {
    const cx = x * cell + cell / 2;
    const cy = y * cell + cell / 2 + yOffset;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 0.7 * sizeScale);
    grad.addColorStop(0, glow);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.62 * sizeScale, 0, Math.PI * 2);
    ctx.fill();

    const size = cell * 0.72 * sizeScale;
    const dx = cx - size / 2;
    const dy = cy - size / 2;

    // Square clip mask — cover-fit (crop sides/top to fill the square)
    const iw = img.naturalWidth  || size;
    const ih = img.naturalHeight || size;
    const scale = Math.max(size / iw, size / ih);
    const sw = size / scale;
    const sh = size / scale;
    const sx = (iw - sw) / 2;
    const sy = (ih - sh) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, size, size);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, size, size);
    ctx.restore();
  }

  function drawPathHint() {
    if (!showPath || Object.keys(q).length === 0) return;

    const visited = new Set();
    let x = catStart.x, y = catStart.y;
    const path = [];

    for (let i = 0; i < grid * grid; i++) {
      const key = `${x},${y}`;
      if (visited.has(key)) break;
      visited.add(key);
      if (x === mouse.x && y === mouse.y) break;

      const best = chooseBestAction(key);
      const { dx, dy } = actions[best];
      const nx = x + dx;
      const ny = y + dy;
      if (isOutside(nx, ny) || isWall(nx, ny)) break;

      path.push({ x, y, dx, dy });
      x = nx;
      y = ny;
    }

    ctx.save();
    ctx.strokeStyle = "rgba(25,229,223,0.45)";
    ctx.fillStyle   = "rgba(25,229,223,0.45)";
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = "round";

    path.forEach(({ x, y, dx, dy }) => {
      const cx  = x * cell + cell / 2;
      const cy  = y * cell + cell / 2;
      const sx  = cx - dx * cell * 0.18;
      const sy  = cy - dy * cell * 0.18;
      const ex  = cx + dx * cell * 0.28;
      const ey  = cy + dy * cell * 0.28;
      const ang = Math.atan2(dy, dx);
      const h   = 7;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - h * Math.cos(ang - Math.PI / 5), ey - h * Math.sin(ang - Math.PI / 5));
      ctx.lineTo(ex - h * Math.cos(ang + Math.PI / 5), ey - h * Math.sin(ang + Math.PI / 5));
      ctx.closePath();
      ctx.fill();
    });

    ctx.restore();
  }

  // ── win animation ────────────────────────────────────────────────────────

  const RUN_FRAMES   = ['1','2','3','4'].map(n => `assets/cat/${n}.png`);
  const CELEB_FRAMES = ['5_1','5_2','5_3','5_2','5_1'].map(n => `assets/cat/${n}.png`);
  [...RUN_FRAMES, ...['assets/cat/5_1.png','assets/cat/5_2.png','assets/cat/5_3.png']]
    .forEach(src => { const i = new Image(); i.src = src; });

  // Body-level overlay — escapes backdrop-filter containing blocks
  const winOverlay = document.createElement('div');
  winOverlay.id = 'win-overlay';
  winOverlay.setAttribute('aria-hidden', 'true');
  const winCatImg = document.createElement('img');
  winCatImg.id = 'win-cat-img';
  winCatImg.alt = '';
  winOverlay.appendChild(winCatImg);
  document.body.appendChild(winOverlay);

  function playWinAnimation() {
    const CAT_W        = 945;
    const RUN_SPEED    = 800;   // px/s
    const RUN_MS       = 75;    // ms per run frame
    const CELEB_MS     = 110;   // ms per celebration frame
    const midX         = window.innerWidth / 2 - CAT_W / 2;
    const exitX        = window.innerWidth + 20;

    let phase      = 'run-in';
    let runFrame   = 0;
    let celebFrame = 0;
    let x          = -CAT_W;
    let lastTs     = null;
    let lastRunT   = 0;
    let lastCelebT = 0;

    winCatImg.src = RUN_FRAMES[0];
    winOverlay.style.display = 'block';

    function step(ts) {
      if (!lastTs) { lastTs = ts; lastRunT = ts; lastCelebT = ts; }
      const dt = ts - lastTs;
      lastTs = ts;

      if (phase === 'run-in') {
        x += RUN_SPEED * dt / 1000;
        if (ts - lastRunT > RUN_MS) {
          runFrame = (runFrame + 1) % RUN_FRAMES.length;
          winCatImg.src = RUN_FRAMES[runFrame];
          lastRunT = ts;
        }
        if (x >= midX) {
          x = midX;
          phase = 'celebrate';
          celebFrame = 0;
          winCatImg.src = CELEB_FRAMES[0];
          lastCelebT = ts;
        }
      } else if (phase === 'celebrate') {
        if (ts - lastCelebT > CELEB_MS) {
          celebFrame++;
          if (celebFrame >= CELEB_FRAMES.length) {
            phase = 'run-out';
            runFrame = 0;
            winCatImg.src = RUN_FRAMES[0];
            lastRunT = ts;
          } else {
            winCatImg.src = CELEB_FRAMES[celebFrame];
            lastCelebT = ts;
          }
        }
      } else {
        x += RUN_SPEED * dt / 1000;
        if (ts - lastRunT > RUN_MS) {
          runFrame = (runFrame + 1) % RUN_FRAMES.length;
          winCatImg.src = RUN_FRAMES[runFrame];
          lastRunT = ts;
        }
        if (x > exitX) {
          winOverlay.style.display = 'none';
          return;
        }
      }

      winCatImg.style.left = x + 'px';
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── controls ──────────────────────────────────────────────────────────────

  mount.querySelector('[data-action="train-fast"]').addEventListener("click", () => {
    clearInterval(timer);
    running = false;
    trainFast(25);
  });

  mount.querySelector('[data-action="demo"]').addEventListener("click", () => {
    clearInterval(timer);
    running = false;
    demoPolicy();
  });

  mount.querySelector('[data-action="reset"]').addEventListener("click", () => {
    clearInterval(timer);
    running       = false;
    for (const key in q) delete q[key];
    walls.length  = 0;
    randomizeCatMouse();
    randomizeWalls();
    episode       = 0;
    epsilon       = 0.4;
    winFlash      = 0;
    showPath      = false;
    successes     = 0;
    episodeReward = 0;
    winRewards    = [];
    resetCat();
    updateState();
    draw();
  });

  mount.querySelector('[data-action="step"]').addEventListener("click", () => {
    if (running) return;
    LearningStep(true);
  });

  // ── init ──────────────────────────────────────────────────────────────────

  draw();
})();
