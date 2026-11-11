"use strict";
/* SKYFX — satu efek halaman (design-taste-frontend: tech pages deal one effect).
 * Langit berbintang 3 lapis kedalaman, drift pelan, parallax mengikuti kursor,
 * dan satu bintang jatuh setiap beberapa detik. Ringan: satu canvas, rAF
 * berhenti saat tab tersembunyi, render statis di prefers-reduced-motion. */
window.SkyFX = (function () {
  let canvas = null, ctx = null, raf = 0, running = false;
  let stars = [], meteors = [];
  let mx = 0, my = 0, tx = 0, ty = 0;          // parallax halus (lerp)
  let w = 0, h = 0, dpr = 1;
  let nextMeteor = 0;
  const N = 150;

  function seed() {
    stars = [];
    for (let i = 0; i < N; i++) {
      const depth = 0.25 + Math.random() * 0.75;          // 0.25 jauh … 1 dekat
      stars.push({
        x: Math.random(), y: Math.random(),
        depth,
        r: depth * 1.5 + 0.3,
        base: 0.25 + depth * 0.55,
        tw: Math.random() * Math.PI * 2,                  // fase kelip
        ts: 0.4 + Math.random() * 1.2,                    // kecepatan kelip
        hue: Math.random() < 0.18 ? 200 : 0               // sedikit biru
      });
    }
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnMeteor(now) {
    const ang = Math.PI * (0.62 + Math.random() * 0.18);   // dari kanan-atas ke kiri-bawah
    const speed = 420 + Math.random() * 320;
    meteors.push({
      x: w * (0.25 + Math.random() * 0.7), y: h * Math.random() * 0.35,
      vx: Math.cos(ang) * speed * -1, vy: Math.sin(ang) * speed * 0.6,
      life: 0, ttl: 0.9 + Math.random() * 0.5, len: 120 + Math.random() * 90
    });
    nextMeteor = now + 5500 + Math.random() * 4500;
  }

  function draw(now) {
    const t = now / 1000;
    mx += (tx - mx) * 0.04;
    my += (ty - my) * 0.04;
    ctx.clearRect(0, 0, w, h);

    for (const s of stars) {
      const px = ((s.x * w + mx * 26 * s.depth + t * 2.4 * s.depth) % (w + 40)) - 20;
      const py = ((s.y * h + my * 18 * s.depth) % (h + 40)) - 20;
      const a = s.base * (0.72 + 0.28 * Math.sin(t * s.ts + s.tw));
      ctx.globalAlpha = Math.max(0.05, a);
      ctx.fillStyle = s.hue ? "rgb(170, 214, 255)" : "rgb(255, 255, 255)";
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, 6.2832);
      ctx.fill();
    }

    if (now >= nextMeteor) spawnMeteor(now);
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.life += 1 / 60;
      m.x += m.vx / 60; m.y += m.vy / 60;
      const k = 1 - m.life / m.ttl;
      if (k <= 0 || m.x < -200 || m.y > h + 200) { meteors.splice(i, 1); continue; }
      const fade = k * k;
      const nx = m.vx / Math.hypot(m.vx, m.vy), ny = m.vy / Math.hypot(m.vx, m.vy);
      const g = ctx.createLinearGradient(m.x, m.y, m.x - nx * m.len, m.y - ny * m.len);
      g.addColorStop(0, "rgba(220, 240, 255, " + (0.85 * fade) + ")");
      g.addColorStop(1, "rgba(120, 190, 255, 0)");
      ctx.globalAlpha = 1;
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - nx * m.len, m.y - ny * m.len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!running) return;
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function init() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Render statis sekali — tanpa animasi (aturan skill).
      canvas = document.getElementById("skyfx");
      if (!canvas) return;
      ctx = canvas.getContext("2d");
      resize(); seed();
      draw(0);
      return;
    }
    canvas = document.createElement("canvas");
    canvas.id = "skyfx";
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
    seed();
    nextMeteor = performance.now() + 2600;
    window.addEventListener("resize", () => { resize(); }, { passive: true });
    window.addEventListener("pointermove", e => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop(); else start();
    });
    start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  return {};
})();
