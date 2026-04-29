// Simple client-side router + Projects dropdown rendering.
(function () {
  const routes = ['home', 'projects', 'research', 'education'];
  const outlet = document.getElementById('outlet');

  // Project entries — placeholders the user will fill later.
  const PROJECTS = [
    {
      title: 'Real-Time Air Pollution Monitoring via WSN Simulation',
      year: '2024',
      tags: ['Distributed Systems', 'Simulation', 'Networks'],
      repo: 'https://github.com/RoshaRazmarafar02/Real-Time-Air-Monitoring-System',
      summary: [
        'RAPM is a demonstration of two complementary architectural patterns applied together.',
        'N-tier (3-layer) Web Architecture — the web application strictly separates Presentation, Business Logic, and Data Access into independent deployable layers, following the standard N-tier pattern used in enterprise web application development.',
        'LEACH-inspired WSN Distributed Architecture — the data collection layer is modelled on the LEACH (Low-Energy Adaptive Clustering Hierarchy) protocol, a well-established distributed clustering algorithm for wireless sensor networks. Sensor nodes report to elected Cluster Head (CH) nodes, which aggregate readings and forward them to a centralised Sink Node — mirroring how a real-world WSN would route data through a multi-hop hierarchy before persisting it.',
        'The primary goal of the project is to demonstrate the integration of these two architectural paradigms: a distributed, concurrent sensor network feeding into a structured, layered web platform. The AQI data used in the simulation is synthetically generated for demonstration purposes and is designed to be replaceable with readings from physical sensors with no change to the upstream architecture.',
      ],
      meta: {
        Role: 'Sole engineer',
        Stack: 'C# · ASP.NET 4.8.1 · WebForms · MVC 5 · SQL Server · MailKit',
        Domain: 'WSN · IoT · Env. sensing',
        Status: 'Shipped',
        Scope: 'Architecture → implementation',
      },
    },
    {
      title: 'Phishing Security Awareness Platform',
      year: '2023',
      tags: ['Security', 'Systems', 'ASP.NET MVC'],
      repo: 'https://github.com/RoshaRazmarafar02/PhishingEmail',
      summary: [
        'ASP.NET MVC 5 web application for conducting controlled phishing security awareness campaigns. Administrators create HTML email templates, manage target user lists, and dispatch tracked emails via SMTP — each recipient receives a unique token that ties their interactions back to the campaign.',
        'Interaction events (link open, credential submission) are captured by simulated phishing landing pages modelled on Google, Netflix, and Mubis login flows, then surfaced in a live analytics dashboard showing sent / visited / submitted rates per campaign and per site.',
      ],
      meta: {
        Role: 'Designer · Engineer',
        Stack: 'C# · ASP.NET MVC 5 · Entity Framework 6 · SQL Server · MailKit',
        Domain: 'Offensive security · awareness training',
        Status: 'Research prototype',
      },
    },
    {
      title: 'MathWorks Minidrone Competition',
      year: '2024',
      tags: ['Control', 'MATLAB', 'Robotics'],
      repo: 'https://github.com/RoshaRazmarafar02/MathworksMiniDroneCompetition-BigO1-2024',
      summary: [
        '1st place nationally in 2024, after 4th in 2023. The challenge: design a controller that autonomously flies a Parrot Mambo Minidrone along a marked track, executes turns, and lands on a designated circle — using only onboard sensors and a downward camera. No external positioning allowed.',
        'We developed the Equilibrium Algorithmic Framework, an approach that tightly integrates image processing, yaw-based control, and a Stateflow path planner. The core insight was treating the camera frame as a matrix and applying morphological erosion and structured submatrices to extract path direction, turn cues, and circle detection signals simultaneously — rather than solving them sequentially.',
        'Three algorithm generations were built and hardware-tested. The final version uses seven symmetric submatrices for line following, a dual-blob-analysis pipeline for circle detection, and a four-state Stateflow machine (hover → move → yaw → land) that reads directly from image processing flags. The controller was compiled via Embedded Coder and deployed directly to the drone — progressing from 16% track completion in early flights to consistent 100% across ten hardware sessions.',
      ],
      meta: {
        Role: 'Co-designer · Engineer',
        Stack: 'MATLAB · Simulink · Stateflow · Embedded Coder · Parrot SDK',
        Domain: 'Autonomous control · computer vision · model-based design',
        Result: '1st place · 2024 · National',
      },
    },
    {
      title: 'Project placeholder',
      year: '—',
      tags: ['To add'],
      summary: [
        'Reserved slot — a new project entry will live here. The dropdown structure is ready; content will be filled in later.',
      ],
      meta: {
        Role: '—',
        Stack: '—',
        Status: 'To be added',
      },
    },
  ];

  function renderProjects(container) {
    container.innerHTML = '';
    PROJECTS.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'proj-row';
      row.innerHTML = `
        <div class="proj-head">
          <div class="proj-num">${String(i + 1).padStart(2, '0')}</div>
          <div class="proj-title">${p.title}</div>
          <div class="proj-tags">
            ${p.tags.map(t => `<span class="proj-tag">${t}</span>`).join('')}
          </div>
          <div class="proj-year">${p.year}</div>
          <div class="proj-caret">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3 V13 M3 8 H13" stroke="currentColor" stroke-width="1"/>
            </svg>
          </div>
        </div>
        <div class="proj-body-wrap">
          <div class="proj-body">
            <div class="proj-body-inner">
              <div class="proj-copy">
                ${p.summary.map(s => `<p>${s}</p>`).join('')}
                ${p.repo ? `<a class="proj-read-more" href="${p.repo}" target="_blank" rel="noopener">Read more &rarr;</a>` : ''}
              </div>
              <div class="proj-meta-grid">
                <dl>
                  ${Object.entries(p.meta).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
                </dl>
              </div>
            </div>
          </div>
        </div>
      `;
      row.querySelector('.proj-head').addEventListener('click', () => {
        row.classList.toggle('open');
      });
      container.appendChild(row);
    });
  }

  function setActive(route) {
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.route === route);
    });
  }

  function mount(route) {
    if (!routes.includes(route)) route = 'home';
    const tpl = document.getElementById('tpl-' + route);
    if (!tpl) return;
    outlet.innerHTML = '';
    outlet.appendChild(tpl.content.cloneNode(true));
    setActive(route);

    // Post-mount wiring
    if (route === 'home') {
      // Re-run hero anim script by reloading it (simple + reliable)
      const s = document.createElement('script');
      s.src = 'hero-anim.js?_=' + Date.now();
      document.body.appendChild(s);
      // Cloud
      setTimeout(() => {
        window.__renderCloud && window.__renderCloud('skill-cloud', 42);
        window.__renderCloudFlow && window.__renderCloudFlow('cloud-flow-canvas');
        window.__renderRLLab && window.__renderRLLab('rl-lab-canvas');
      }, 80);
    }
    
    // Run landing/scroll animations after mount
    setTimeout(() => {
      window.__runLandingAnim && window.__runLandingAnim();
    }, 30);
    if (route === 'projects') {
      renderProjects(document.getElementById('proj-list'));
    }

    // Scroll to top gently
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

    // Persist
    try { localStorage.setItem('portfolio-route', route); } catch (_) {}
  }

  function currentRouteFromHash() {
    const h = (location.hash || '').replace('#', '').trim();
    return routes.includes(h) ? h : null;
  }

  // Intercept clicks on [data-route]
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-route]');
    if (!a) return;
    e.preventDefault();
    const r = a.dataset.route;
    location.hash = '#' + r;
  });

  window.addEventListener('hashchange', () => {
    const r = currentRouteFromHash() || 'home';
    mount(r);
  });

  // Initial
  const initial = currentRouteFromHash() || (function () {
    try { return localStorage.getItem('portfolio-route'); } catch (_) { return null; }
  })() || 'home';
  if (!location.hash) location.hash = '#' + initial;
  else mount(initial);
})();
