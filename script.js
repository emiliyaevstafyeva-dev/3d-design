/* Анимации: появление, прогресс, DepthText, шапка, активный раздел. */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealItems = document.querySelectorAll('[data-reveal]');
  var progressBar = document.querySelector('.scroll-progress__bar');
  var header = document.querySelector('.header');

  // --- DepthText (адаптация React DepthText) ------------------------------

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function layerColor(faceColor, depthColor, index, total) {
    var progress = total <= 1 ? 1 : index / total;
    var eased = progress * progress;
    var faceMix = Math.round((1 - eased) * 72 + 4);
    return 'color-mix(in srgb, ' + faceColor + ' ' + faceMix + '%, ' + depthColor + ')';
  }

  function initDepthText(root) {
    var text = root.getAttribute('data-text') || root.textContent.trim() || '';
    var layers = clamp(Math.round(Number(root.getAttribute('data-layers')) || 28), 2, 48);
    var depth = clamp(Number(root.getAttribute('data-depth')) || 2.2, 0, 12);
    var tilt = clamp(Number(root.getAttribute('data-tilt')) || 6, 0, 12);
    var smoothing = clamp(Number(root.getAttribute('data-smoothing')) || 0.14, 0.02, 0.35);
    var perspective = clamp(Number(root.getAttribute('data-perspective')) || 900, 300, 2000);
    var orbitSpeed = clamp(Number(root.getAttribute('data-orbit-speed')) || 0.32, 0, 2);
    var faceColor = root.getAttribute('data-face') || '#f2f2f4';
    var depthColor = root.getAttribute('data-depth-color') || '#2a9fbf';
    var autoOrbit = root.getAttribute('data-auto-orbit') !== 'false';
    var pointerTracking = root.getAttribute('data-pointer') !== 'false';

    root.style.setProperty('--depth-text-perspective', perspective + 'px');
    root.style.setProperty('--depth-text-face-color', faceColor);
    root.style.setProperty('--depth-text-depth-color', depthColor);

    var stage = document.createElement('span');
    stage.className = 'depth-text__stage';

    var i;
    for (i = layers; i >= 1; i--) {
      var layer = document.createElement('span');
      layer.className = 'depth-text__layer';
      layer.setAttribute('aria-hidden', 'true');
      layer.textContent = text;
      layer.style.color = layerColor(faceColor, depthColor, i, layers);
      layer.style.transform = 'translateZ(' + (-i * depth) + 'px)';
      stage.appendChild(layer);
    }

    var face = document.createElement('span');
    face.className = 'depth-text__face';
    face.textContent = text;
    stage.appendChild(face);

    root.textContent = '';
    root.appendChild(stage);

    var base = { x: -tilt * 0.32, y: tilt * 0.42 };
    var current = { x: base.x, y: base.y };
    var target = { x: base.x, y: base.y };

    function apply() {
      stage.style.transform =
        'rotateX(' + current.x.toFixed(3) + 'deg) rotateY(' + current.y.toFixed(3) + 'deg)';
    }

    apply();

    if (reduced) return;

    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var canTrack = pointerTracking && finePointer;
    var activePointer = false;
    var startTime = performance.now();
    var frameId = 0;

    function onMove(event) {
      var rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      activePointer = true;
      var x = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.8), -1, 1);
      var y = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.8), -1, 1);
      target.x = base.x - y * tilt;
      target.y = base.y + x * tilt;
    }

    function onLeave() {
      activePointer = false;
      target.x = base.x;
      target.y = base.y;
    }

    if (canTrack) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerleave', onLeave);
      window.addEventListener('blur', onLeave);
    }

    function tick(now) {
      if ((!canTrack || !activePointer) && autoOrbit) {
        var elapsed = (now - startTime) / 1000;
        var orbit = elapsed * orbitSpeed * Math.PI * 2;
        var amount = canTrack ? 0.18 : 0.55;
        target.x = base.x + Math.sin(orbit) * tilt * amount;
        target.y = base.y + Math.cos(orbit * 0.85) * tilt * amount;
      }

      current.x += (target.x - current.x) * smoothing;
      current.y += (target.y - current.y) * smoothing;
      apply();
      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    // Сохраняем id на элементе на случай будущей очистки
    root._depthFrame = frameId;
  }

  document.querySelectorAll('[data-depth-text]').forEach(initDepthText);

  // --- Reveal / stagger --------------------------------------------------

  document.querySelectorAll('[data-stagger]').forEach(function (group) {
    Array.prototype.forEach.call(group.children, function (child, i) {
      child.classList.add('stagger-item');
      child.style.setProperty('--stagger', Math.min(i * 80, 480) + 'ms');
    });
  });

  function show(el) {
    el.classList.add('is-in');
    if (el.hasAttribute('data-stagger')) {
      Array.prototype.forEach.call(el.children, function (child) {
        child.classList.add('is-in');
      });
    }
  }

  if (reduced || !('IntersectionObserver' in window)) {
    revealItems.forEach(show);
    document.documentElement.classList.add('motion-ready');
  } else {
    document.documentElement.classList.add('motion-ready');

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        show(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });

    revealItems.forEach(function (el) { observer.observe(el); });
  }

  // --- Прогресс прокрутки + шапка ----------------------------------------

  var ticking = false;
  function updateScroll() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle('is-stuck', y > 24);

    if (progressBar && !reduced) {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      progressBar.style.transform = 'scaleX(' + p + ')';
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateScroll);
  }

  updateScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  var toggle = document.getElementById('nav-toggle');
  if (toggle) {
    document.querySelectorAll('.nav a').forEach(function (link) {
      link.addEventListener('click', function () { toggle.checked = false; });
    });
  }

  var links = Array.prototype.slice.call(document.querySelectorAll('.nav__list a'));
  var targets = links
    .map(function (link) { return document.querySelector(link.getAttribute('href')); })
    .filter(Boolean);

  if ('IntersectionObserver' in window && targets.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (link) {
          link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    targets.forEach(function (section) { spy.observe(section); });
  }
})();
