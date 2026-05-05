(function () {
  const mount = document.getElementById("rl-lab");
  if (!mount) return;

  mount.innerHTML = `
    <div class="rl-shell">
      <div class="rl-panel">
        <div class="rl-topbar">
          <div>
            <div class="rl-kicker">gridworld://neural-q</div>
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
          <strong id="rl-epsilon">1.00</strong>
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
            <strong id="rl-policy">training</strong>
        </div>
        <div class="rl-stat">
            <span>trained at</span>
            <strong id="rl-trained-at">—</strong>
        </div>
        <div class="rl-note">
          Starts at ε=1 (pure random), decays toward greedy as it learns. BFS-based reward shaping gives a dense signal each step so the network learns even before it finds the goal. <b>Train</b> runs episodes automatically and stops when the greedy policy reaches the mouse 5 times in a row — <i>trained at</i> shows which episode that happened. <b>Run Policy</b> replays the learned path. <b>Reset</b> randomizes the map and clears the network.
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

  // ── Neural network: 2 → 32 → 32 → 4 ─────────────────────────────────────
  const nn = (() => {
    const lr = 0.01;
    const [I, H, O] = [2, 32, 4];
    const he = n => (Math.random() * 2 - 1) * Math.sqrt(2 / n);

    let w1, b1, w2, b2, w3, b3;

    function init() {
      w1 = Array.from({ length: H }, () => Array.from({ length: I }, () => he(I)));
      b1 = Array(H).fill(0);
      w2 = Array.from({ length: H }, () => Array.from({ length: H }, () => he(H)));
      b2 = Array(H).fill(0);
      w3 = Array.from({ length: O }, () => Array.from({ length: H }, () => he(H)));
      b3 = Array(O).fill(0);
    }

    function fwd(x) {
      const h1 = b1.map((b, i) => Math.max(0, w1[i].reduce((s, w, j) => s + w * x[j], b)));
      const h2 = b2.map((b, i) => Math.max(0, w2[i].reduce((s, w, j) => s + w * h1[j], b)));
      const out = b3.map((b, i) => w3[i].reduce((s, w, j) => s + w * h2[j], b));
      return { h1, h2, out };
    }

    function predict(x) { return fwd(x).out; }

    function train(x, target, a) {
      const { h1, h2, out } = fwd(x);
      const err = out[a] - target;

      // compute all gradients before touching weights
      const dout = Array(O).fill(0); dout[a] = err;
      const dh2 = h2.map((v, j) => (v > 0 ? w3.reduce((s, row, i) => s + dout[i] * row[j], 0) : 0));
      const dh1 = h1.map((v, j) => (v > 0 ? w2.reduce((s, row, i) => s + dh2[i]  * row[j], 0) : 0));

      w3.forEach((row, i) => { b3[i] -= lr * dout[i]; row.forEach((_, j) => { row[j] -= lr * dout[i] * h2[j]; }); });
      w2.forEach((row, i) => { b2[i] -= lr * dh2[i];  row.forEach((_, j) => { row[j] -= lr * dh2[i]  * h1[j]; }); });
      w1.forEach((row, i) => { b1[i] -= lr * dh1[i];  row.forEach((_, j) => { row[j] -= lr * dh1[i]  * x[j];  }); });
    }

    init();
    return { predict, train, reset: init };
  })();

  function stateVec(x, y) { return [x / (grid - 1), y / (grid - 1)]; }

  const visited = new Set();

  let episode  = 0;
  let steps    = 0;
  let epsilon  = 1.0;
  const gamma  = 0.9;
  let running  = false;
  let timer    = null;
  let winFlash  = 0;
  let showPath  = false;
  let successes = 0;
  let episodeReward = 0;
  let winRewards = [];
  let trainedAtEpisode = null;
  let stableChecks = 0;
  let trainingId = 0;
  const REQUIRED_STABLE_CHECKS = 5;
  const MAX_TRAIN_EPISODES = 400;
  let distMap = null;  // BFS distance from every cell to mouse, respecting walls

  // ── helpers ──────────────────────────────────────────────────────────────

  function isWall(x, y)    { return walls.some(w => w.x === x && w.y === y); }
  function isOutside(x, y) { return x < 0 || x >= grid || y < 0 || y >= grid; }

  function computeDistMap() {
    distMap = Array.from({ length: grid }, () => Array(grid).fill(Infinity));
    distMap[mouse.y][mouse.x] = 0;
    const queue = [{ x: mouse.x, y: mouse.y }];
    while (queue.length) {
      const { x, y } = queue.shift();
      for (const { dx, dy } of actions) {
        const nx = x + dx, ny = y + dy;
        if (!isOutside(nx, ny) && !isWall(nx, ny) && distMap[ny][nx] === Infinity) {
          distMap[ny][nx] = distMap[y][x] + 1;
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  function hasPath(sx, sy, ex, ey) {
    const seen = new Set();
    const queue = [{ x: sx, y: sy }];
    seen.add(`${sx},${sy}`);
    while (queue.length) {
      const { x, y } = queue.shift();
      if (x === ex && y === ey) return true;
      for (const { dx, dy } of actions) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (!isOutside(nx, ny) && !isWall(nx, ny) && !seen.has(k)) {
          seen.add(k); queue.push({ x: nx, y: ny });
        }
      }
    }
    return false;
  }

  function chooseBestAction(x, y) {
    const qVals = nn.predict(stateVec(x, y));
    return qVals.reduce((best, v, i) => v > qVals[best] ? i : best, 0);
  }

  function chooseAction(x, y) {
    if (Math.random() < epsilon) return Math.floor(Math.random() * actions.length);
    return chooseBestAction(x, y);
  }

  function policyReachesGoal() {
    const seen = new Set();
    let x = catStart.x, y = catStart.y;
    for (let i = 0; i < grid * grid; i++) {
      const key = `${x},${y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      if (x === mouse.x && y === mouse.y) return true;
      const { dx, dy } = actions[chooseBestAction(x, y)];
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
    cat.x = catStart.x = 1; cat.y = catStart.y = 6;
    mouse.x = 6; mouse.y = 1;
  }

  function randomizeWalls() {
    walls.length = 0;
    const safe = safeCells();
    const numGroups = 2 + Math.floor(Math.random() * 2);

    for (let g = 0; g < numGroups; g++) {
      for (let attempt = 0; attempt < 150; attempt++) {
        const t  = 0.25 + Math.random() * 0.5;
        const jx = Math.round((Math.random() - 0.5) * 3);
        const jy = Math.round((Math.random() - 0.5) * 3);
        const sx = Math.min(grid - 1, Math.max(0, Math.round(cat.x + t * (mouse.x - cat.x)) + jx));
        const sy = Math.min(grid - 1, Math.max(0, Math.round(cat.y + t * (mouse.y - cat.y)) + jy));
        if (safe.has(`${sx},${sy}`) || isWall(sx, sy)) continue;

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
          break;
        }
      }
    }
  }

  function resetCat() { cat.x = catStart.x; cat.y = catStart.y; steps = 0; }

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
    const cx = cat.x, cy = cat.y;
    visited.add(`${cx},${cy}`);

    const prevDist    = distMap ? distMap[cy][cx] : Infinity;
    const actionIndex = chooseAction(cx, cy);
    const result      = takeAction(actionIndex, shouldDraw);

    // Dense shaping: BFS distance respects walls, so detours are rewarded correctly
    const currDist    = distMap ? distMap[result.next.y][result.next.x] : Infinity;
    const reward      = result.reward + (result.done ? 0 : (prevDist - currDist) * 0.2);

    const nextQ  = nn.predict(stateVec(result.next.x, result.next.y));
    const target = reward + (result.done ? 0 : gamma * Math.max(...nextQ));
    nn.train(stateVec(cx, cy), target, actionIndex);

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

    if (shouldDraw) {
      updateState();
      draw();
    }
  }

  function trainUntilConverged() {
    const myId = ++trainingId;
    running = true;
    computeDistMap();
    const startEpisode = episode;
    stableChecks = 0;
    trainedAtEpisode = null;

    function finish() {
      if (trainingId !== myId) return;
      running = false;
      showPath = true;
      resetCat();
      updateState();
      draw();
    }

    function runBatch() {
      if (trainingId !== myId) return;

      const STEPS_PER_BATCH = 300;
      for (let s = 0; s < STEPS_PER_BATCH; s++) {
        if (episode - startEpisode >= MAX_TRAIN_EPISODES) { finish(); return; }
        LearningStep(false);
        // steps resets to 0 at each episode boundary
        if (steps === 0 && episode > startEpisode) {
          if (policyReachesGoal()) stableChecks++;
          else stableChecks = 0;
          if (stableChecks >= REQUIRED_STABLE_CHECKS) { trainedAtEpisode = episode; finish(); return; }
        }
      }

      // yield to browser so it can repaint with updated values
      document.getElementById("rl-epsilon").textContent = epsilon.toFixed(2);
      document.getElementById("rl-episode").textContent = episode.toString().padStart(3, "0");
      setTimeout(runBatch, 0);
    }

    runBatch();
  }

  function demoPolicy() {
    if (running) return;
    running = true;
    const savedEpsilon = epsilon;
    epsilon = 0.0;
    resetCat();
    updateState();
    draw();

    timer = setInterval(() => {
      const actionIndex = chooseBestAction(cat.x, cat.y);
      const result      = takeAction(actionIndex);
      steps++;

      if (result.done || steps > 30) {
        updateState();
        draw();
        clearInterval(timer);
        running = false;
        epsilon = savedEpsilon;
        return;
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

    document.getElementById("rl-episode").textContent    = episode.toString().padStart(3, "0");
    document.getElementById("rl-steps").textContent      = steps.toString().padStart(2, "0");
    document.getElementById("rl-epsilon").textContent    = epsilon.toFixed(2);
    document.getElementById("rl-success").textContent    = `${successRate.toFixed(0)}%`;
    document.getElementById("rl-avg-reward").textContent  = winRewards.length > 0 ? avgReward.toFixed(1) : "—";
    document.getElementById("rl-policy").textContent      = trainedAtEpisode ? "converged" : "training";
    document.getElementById("rl-trained-at").textContent  = trainedAtEpisode ? `${trainedAtEpisode}` : "—";
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(16,16,19,0.72)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        ctx.strokeStyle = "rgba(234,231,225,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x * cell, y * cell, cell, cell);
      }
    }

    // Q-value glow — visited cells where the network has learned positive value
    ctx.fillStyle = "rgba(25,229,223,0.06)";
    for (const key of visited) {
      const [x, y] = key.split(',').map(Number);
      if (Math.max(...nn.predict(stateVec(x, y))) > 0)
        ctx.fillRect(x * cell, y * cell, cell, cell);
    }

    drawPathHint();

    walls.forEach(w => {
      ctx.fillStyle = "rgba(234,231,225,0.14)";
      ctx.fillRect(w.x * cell + 8, w.y * cell + 8, cell - 16, cell - 16);
    });

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
    if (!showPath || visited.size === 0) return;

    const seen = new Set();
    let x = catStart.x, y = catStart.y;
    const path = [];

    for (let i = 0; i < grid * grid; i++) {
      const key = `${x},${y}`;
      if (seen.has(key)) break;
      seen.add(key);
      if (x === mouse.x && y === mouse.y) break;

      const best = chooseBestAction(x, y);
      const { dx, dy } = actions[best];
      const nx = x + dx, ny = y + dy;
      if (isOutside(nx, ny) || isWall(nx, ny)) break;

      path.push({ x, y, dx, dy });
      x = nx; y = ny;
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

  // ── win animation ─────────────────────────────────────────────────────────

  const RUN_FRAMES   = ['1','2','3','4'].map(n => `assets/cat/${n}.png`);
  const CELEB_FRAMES = ['5_1','5_2','5_3','5_2','5_1'].map(n => `assets/cat/${n}.png`);
  [...RUN_FRAMES, ...['assets/cat/5_1.png','assets/cat/5_2.png','assets/cat/5_3.png']]
    .forEach(src => { const i = new Image(); i.src = src; });

  const winOverlay = document.createElement('div');
  winOverlay.id = 'win-overlay';
  winOverlay.setAttribute('aria-hidden', 'true');
  const winCatImg = document.createElement('img');
  winCatImg.id = 'win-cat-img';
  winCatImg.alt = '';
  winOverlay.appendChild(winCatImg);
  document.body.appendChild(winOverlay);

  function playWinAnimation() {
    const CAT_W     = 945;
    const RUN_SPEED = 800;
    const RUN_MS    = 75;
    const CELEB_MS  = 110;
    const midX      = window.innerWidth / 2 - CAT_W / 2;
    const exitX     = window.innerWidth + 20;

    let phase = 'run-in', runFrame = 0, celebFrame = 0, x = -CAT_W;
    let lastTs = null, lastRunT = 0, lastCelebT = 0;

    winCatImg.src = RUN_FRAMES[0];
    winOverlay.style.display = 'block';

    function step(ts) {
      if (!lastTs) { lastTs = ts; lastRunT = ts; lastCelebT = ts; }
      const dt = ts - lastTs;
      lastTs = ts;

      if (phase === 'run-in') {
        x += RUN_SPEED * dt / 1000;
        if (ts - lastRunT > RUN_MS) { runFrame = (runFrame + 1) % RUN_FRAMES.length; winCatImg.src = RUN_FRAMES[runFrame]; lastRunT = ts; }
        if (x >= midX) { x = midX; phase = 'celebrate'; celebFrame = 0; winCatImg.src = CELEB_FRAMES[0]; lastCelebT = ts; }
      } else if (phase === 'celebrate') {
        if (ts - lastCelebT > CELEB_MS) {
          celebFrame++;
          if (celebFrame >= CELEB_FRAMES.length) { phase = 'run-out'; runFrame = 0; winCatImg.src = RUN_FRAMES[0]; lastRunT = ts; }
          else { winCatImg.src = CELEB_FRAMES[celebFrame]; lastCelebT = ts; }
        }
      } else {
        x += RUN_SPEED * dt / 1000;
        if (ts - lastRunT > RUN_MS) { runFrame = (runFrame + 1) % RUN_FRAMES.length; winCatImg.src = RUN_FRAMES[runFrame]; lastRunT = ts; }
        if (x > exitX) { winOverlay.style.display = 'none'; return; }
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
    trainUntilConverged();
  });

  mount.querySelector('[data-action="demo"]').addEventListener("click", () => {
    clearInterval(timer);
    running = false;
    demoPolicy();
  });

  mount.querySelector('[data-action="reset"]').addEventListener("click", () => {
    clearInterval(timer);
    running       = false;
    nn.reset();
    visited.clear();
    walls.length  = 0;
    randomizeCatMouse();
    randomizeWalls();
    computeDistMap();
    episode          = 0;
    epsilon          = 1.0;
    winFlash         = 0;
    showPath         = false;
    successes        = 0;
    episodeReward    = 0;
    winRewards       = [];
    trainedAtEpisode = null;
    stableChecks     = 0;
    resetCat();
    updateState();
    draw();
  });

  mount.querySelector('[data-action="step"]').addEventListener("click", () => {
    if (running) return;
    LearningStep(true);
  });

  // ── init ──────────────────────────────────────────────────────────────────

  randomizeCatMouse();
  randomizeWalls();
  computeDistMap();
  resetCat();
  updateState();
  draw();
})();
