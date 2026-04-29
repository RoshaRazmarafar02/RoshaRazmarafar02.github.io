// Landing page entry animation + scroll fade-in.
(function () {
  // ---- Hero entry: typewriter for h1-terminal, fade-in for the rest ----
  function runHeroAnim() {
    const term = document.querySelector('.hero h1 .h1-terminal');
    const fadeTargets = document.querySelectorAll(
      '.hero h1 .name, .hero-sub, .hero-eyebrow, .hero-meta, .hero-plate, .scroll-cue'
    );

    if (term) {
      const finalText = term.dataset.text || term.textContent.trim();
      term.dataset.text = finalText;
      term.textContent = '';
      term.classList.add('typing');

      const caret = document.createElement('span');
      caret.className = 'type-caret';
      caret.textContent = '▍';
      term.appendChild(caret);

      let i = 0;
      const speed = 55; // ms per char
      const startDelay = 350;

      setTimeout(function step() {
        if (i < finalText.length) {
          caret.insertAdjacentText('beforebegin', finalText[i]);
          i++;
          setTimeout(step, speed + (Math.random() * 40 - 20));
        } else {
          // Keep caret blinking after typing completes
          caret.classList.add('blink');
        }
      }, startDelay);
    }

    fadeTargets.forEach((el, idx) => {
      el.classList.add('fade-in-prep');
      // Stagger lightly
      setTimeout(() => el.classList.add('fade-in-go'), 120 + idx * 60);
    });
  }

  // ---- Scroll fade-in for sections + cards ----
  function runScrollObserver() {
    const targets = document.querySelectorAll(
      '#outlet .section, .nav-card, .research-item, .edu-entry, .honor-row, .proj-row, .cloud-wrap'
    );
    if (!('IntersectionObserver' in window)) {
      targets.forEach(t => t.classList.add('reveal-go'));
      return;
    }
    targets.forEach(t => t.classList.add('reveal-prep'));

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-go');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    targets.forEach(t => io.observe(t));
  }

  function init() {
    // Only run hero anim on home page
    const onHome = document.querySelector('.page[data-page="home"]');
    if (onHome) runHeroAnim();
    runScrollObserver();
  }

  // Expose for router to call after mounting
  window.__runLandingAnim = init;

  // First load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Run on next tick so the templates are mounted
    setTimeout(init, 30);
  }
})();
