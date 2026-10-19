// The hero is a small wireless network, and you are in it.
// Radios drift in a 3D volume and link with the radios near them; a link's quality falls
// off with distance. Every radio sends messages toward you, passing them from radio to
// radio along the most reliable path (fewest expected transmissions, the sum of 1/quality).
// Radios wait for a quiet channel before they talk, and two transmissions that overlap at
// a receiver are lost and retried, so the traffic behaves like a real network. Some
// messages also carry a secondary message on the same transmission, the idea
// behind Frequency Lock Encoding; those are drawn in signal orange.
// Your radio wanders on its own until the cursor moves (or a finger taps), then follows it.
(() => {
  "use strict";
  const canvas = document.getElementById("mesh");
  if (!canvas) return;
  const hero = canvas.closest(".hero");
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const $ = (id) => document.getElementById(id);
  const liveDot = document.querySelector(".tele .dot");
  const ui = { bars: $("t-bars"), quality: $("t-quality"), range: $("t-range"), msgs: $("t-msgs"), hidden: $("t-hidden") };
  const QUALITY = ["No signal", "Weak signal", "Fair signal", "Good signal", "Strong signal"];
  const LEVELS = [0.35, 1.0, 1.9];     // summed link quality needed for 2, 3 and 4 bars

  let FG = "233,238,245", MUTE = "169,179,193", SIG = "255,106,61", GROUND = "6,8,12", INK = 1, RING = 1;
  function readPalette() {
    const p = window.siteTheme && window.siteTheme.palette();
    if (!p) return;
    FG = p.fg; MUTE = p.mute; SIG = p.sig; GROUND = p.ground;
    // ink on paper needs a little more weight to read the same, except the wide rings,
    // which read heavier on paper than light does on black
    INK = p.theme === "light" ? 1.3 : 1;
    RING = p.theme === "light" ? 0.62 : 1;
  }

  const F = 3.2;              // camera focal length, world units
  const R = 0.6;              // range between radios
  const ME_R = 0.27;          // your radio's range, measured on screen so the circle you see is the range you have
  const TX = 0.36;            // seconds per hop on air
  const RATE = 0.075;         // messages per radio per second
  const HIDDEN_SHARE = 0.3;   // messages that also carry a hidden one

  let W = 0, H = 0, dpr = 1, S = 1, AX = 1.6;
  let nodes = [], links = [], txs = [], fx = [];
  let me = null, target = null, mode = null, pinnedUntil = 0;
  let clear = [], open = { x0: 0, x1: 1, y0: 0, y1: 1 };
  let stats = { delivered: 0, hidden: 0 };
  let strength = 0, level = 0, pending = 0, pendingT = 0, shown = -1;
  let born = 0, running = false, raf = 0, last = 0, now = 0, routeT = 0, statT = 0, roamT = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const alive = (nd) => nd.born <= born || reduce.matches;

  // the canvas fills the hero, except on phones, where it is a band above the copy
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = H / 2;
    AX = (W / H) * 1.02;
    measure();
  }

  // Keep the reading areas calm (anything drawn behind the copy or the panel dims), and find
  // the open sky above the copy where your radio wanders when no one is steering it.
  function measure() {
    const h = canvas.getBoundingClientRect();
    const boxes = [...hero.querySelectorAll(".hero-copy, .tele, .hero-status")].map((el) => el.getBoundingClientRect()).filter((r) => r.width);
    clear = boxes.map((r) => ({ x0: r.left - h.left - 36, y0: r.top - h.top - 30, x1: r.right - h.left + 36, y1: r.bottom - h.top + 24 }));
    const bar = document.getElementById("bar");
    const barH = bar ? bar.getBoundingClientRect().height : 60;
    clear.push({ x0: -100, y0: -100, x1: W + 100, y1: barH - 6 });
    const top = barH + (W < 700 ? 40 : 56);
    const copyTop = boxes.length ? Math.min(...boxes.map((r) => r.top - h.top)) - (W < 700 ? 36 : 48) : H * 0.6;
    const bottom = Math.min(H - 40, copyTop - top > 60 ? copyTop : Math.max(top + 110, H * 0.45));
    const side = Math.max(48, W * 0.08);
    open = { x0: side, x1: W - side, y0: top, y1: bottom };
  }
  function calm(x, y) {
    let k = 1;
    for (const c of clear) {
      const dx = Math.max(c.x0 - x, 0, x - c.x1), dy = Math.max(c.y0 - y, 0, y - c.y1);
      const d = Math.hypot(dx, dy);
      if (d < 60) k = Math.min(k, 0.16 + 0.84 * (d / 60));
    }
    return k;
  }

  function roamPoint(t) {
    const cx = (open.x0 + open.x1) / 2, cy = (open.y0 + open.y1) / 2;
    const ax = (open.x1 - open.x0) / 2, ay = (open.y1 - open.y0) / 2;
    return { x: cx + ax * Math.sin(t * 0.083), y: cy + ay * Math.sin(t * 0.131 + 0.9) };
  }

  function build() {
    const n = Math.round(Math.min(72, Math.max(W < 700 ? 28 : 34, (W * H) / 19000)));
    // radios gather loosely in a few neighbourhoods with thinner ground between them,
    // so your signal rises and falls as you move
    const cols = W < 700 ? 2 : 3, homes = [];
    for (let c = 0; c < cols; c++) for (const y of [-0.5, 0.48]) {
      homes.push({ x: (-1 + (2 * c + 1) / cols) * AX * 0.92 + rand(-0.12, 0.12), y: y + rand(-0.14, 0.14), z: rand(-0.3, 0.3) });
    }
    nodes = [];
    for (let i = 0; i < n; i++) {
      const h = Math.random() < 0.84 ? homes[i % homes.length] : null;
      const x = h ? h.x + gauss() * 0.25 : rand(-AX, AX);
      const y = h ? h.y + gauss() * 0.2 : rand(-1, 1);
      const z = h ? h.z + gauss() * 0.24 : rand(-0.7, 0.7);
      nodes.push({ x, y, z, hx: x, hy: y, hz: z, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, p: 1, busyUntil: 0, queue: [], flash: 0, born: 0, nb: [] });
    }
    // start somewhere with good coverage, so the first thing a visitor sees is a working link
    for (const nd of nodes) project(nd);
    let best = -1;
    for (let k = 0; k < 32; k++) {
      const t = k * 2.3, q = roamPoint(t);
      const c = nodes.filter((nd) => Math.hypot(nd.sx - q.x, nd.sy - q.y) < ME_R * S * 0.8).length;
      if (c > best) { best = c; roamT = t; }
    }
    const start = roamPoint(roamT);
    me = { me: true, sx: start.x, sy: start.y, x: 0, y: 0, z: 0, p: 1, queue: [], busyUntil: 0, flash: 0, born: 0, nb: [] };
    placeMe(start.x, start.y);
    // the network forms outward from you on load
    for (const nd of nodes) nd.born = Math.hypot(nd.sx - me.sx, nd.sy - me.sy) / S * 0.5;
    born = 0; txs = []; fx = [];
    stats = { delivered: 0, hidden: 0 };
  }

  function project(nd) {
    nd.p = F / (F - nd.z);
    nd.sx = W / 2 + nd.x * S * nd.p;
    nd.sy = H / 2 + nd.y * S * nd.p;
  }
  function placeMe(px, py) {
    me.sx = px; me.sy = py;
    me.x = (px - W / 2) / S; me.y = (py - H / 2) / S;
  }

  function computeLinks() {
    links = [];
    for (const n of nodes) n.nb = [];
    me.nb = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (!alive(a)) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (!alive(b)) continue;
        const d = dist(a, b);
        if (d < R) {
          const q = 1 - (d / R) ** 2;
          links.push({ a, b, q });
          a.nb.push({ n: b, q }); b.nb.push({ n: a, q });
        }
      }
    }
    const rpx = ME_R * S;
    for (const n of nodes) {
      if (!alive(n)) continue;
      const d = Math.hypot(n.sx - me.sx, n.sy - me.sy);
      if (d < rpx) {
        const q = 1 - (d / rpx) ** 2;
        links.push({ a: n, b: me, q });
        n.nb.push({ n: me, q }); me.nb.push({ n, q });
      }
    }
  }

  // Dijkstra on expected transmissions (1/quality), toward you.
  function route() {
    const all = nodes.concat(me);
    for (const n of all) { n.cost = Infinity; n.next = null; n.done = false; }
    me.cost = 0;
    for (;;) {
      let u = null;
      for (const n of all) if (!n.done && n.cost < Infinity && (!u || n.cost < u.cost)) u = n;
      if (!u) break;
      u.done = true;
      for (const { n, q } of u.nb) {
        const c = u.cost + 1 / Math.max(q, 0.05);
        if (c < n.cost) { n.cost = c; n.next = u; }
      }
    }
  }

  const hears = (a, b) => (a.me || b.me ? Math.hypot(a.sx - b.sx, a.sy - b.sy) < ME_R * S : dist(a, b) < R);

  function send(nd, pkt) {
    if (!nd.next) { nd.queue.length = 0; return; }   // no path to you: nothing to do
    // listen before talking, and wait a random slot so neighbours don't start together
    const busy = txs.some((t) => t.from !== nd && now < t.t1 && hears(t.from, nd));
    if (!busy && !pkt.slotted) { pkt.slotted = true; pkt.retryAt = now + Math.random() * 0.12; return; }
    if (busy || now < nd.busyUntil) { pkt.retryAt = now + rand(0.08, 0.3); return; }
    txs.push({ from: nd, to: nd.next, t0: now, t1: now + TX, pkt });
    nd.busyUntil = now + TX + 0.02;
    nd.queue.shift();
  }

  function finish(t) {
    // lost if another transmission overlapped it at the receiver and was close enough to
    // drown it out; the nearer sender wins when the other is much farther away
    const dSig = t.to.me ? Math.hypot(t.from.sx - t.to.sx, t.from.sy - t.to.sy) / S : dist(t.from, t.to);
    const lost = txs.some((o) => {
      if (o === t || o.from === t.from || o.from === t.to || o.t0 >= t.t1 || o.t1 <= t.t0 || !hears(o.from, t.to)) return false;
      const dO = t.to.me ? Math.hypot(o.from.sx - t.to.sx, o.from.sy - t.to.sy) / S : dist(o.from, t.to);
      return dO < dSig * 1.3;
    });
    if (lost) {
      t.pkt.retryAt = now + rand(0.15, 0.6);
      t.pkt.slotted = false;
      t.pkt.tries = (t.pkt.tries || 0) + 1;
      if (t.pkt.tries < 6) t.from.queue.unshift(t.pkt);
      return;
    }
    t.to.flash = now;
    t.from.flow = Math.min(6, (t.from.flow || 0) + 1);
    if (t.to.me) {
      stats.delivered++;
      if (t.pkt.hidden) stats.hidden++;
      fx.push({ x: t.to.sx, y: t.to.sy, t0: now, hidden: t.pkt.hidden });
      if (liveDot) { liveDot.classList.remove("is-rx"); void liveDot.offsetWidth; liveDot.classList.add("is-rx"); }
    } else {
      t.pkt.retryAt = now + 0.04;
      t.to.queue.push(t.pkt);
    }
  }

  function moveMe(dt) {
    if (mode === "touch" && now > pinnedUntil) mode = null;
    roamT += dt;
    let tx, ty, tau;
    if (mode && target) { tx = target.x; ty = target.y; tau = mode === "touch" ? 0.35 : 0.08; }
    else { const p = roamPoint(roamT); tx = p.x; ty = p.y; tau = 0.9; }
    const k = 1 - Math.exp(-dt / tau);
    placeMe(me.sx + (tx - me.sx) * k, me.sy + (ty - me.sy) * k);
  }

  function signal(dt) {
    // summed quality of the links reaching you, smoothed, with a short delay before the
    // bars change so they read like a phone's rather than flicker
    let sum = 0;
    for (const { q } of me.nb) sum += q;
    strength += (sum - strength) * (1 - Math.exp(-dt / 0.5));
    const raw = !me.nb.length ? 0 : strength < LEVELS[0] ? 1 : strength < LEVELS[1] ? 2 : strength < LEVELS[2] ? 3 : 4;
    if (raw === level) { pendingT = 0; return; }
    if (raw !== pending) { pending = raw; pendingT = 0; }
    pendingT += dt;
    if (pendingT > (raw === 0 ? 0.15 : 0.45)) { level = raw; pendingT = 0; }
  }

  function step(dt) {
    now += dt;
    if (born < 3) born += dt;

    for (const n of nodes) {
      n.vx += (rand(-1, 1) * 0.012 + (n.hx - n.x) * 0.006) * dt;
      n.vy += (rand(-1, 1) * 0.012 + (n.hy - n.y) * 0.006) * dt;
      n.vz += (rand(-1, 1) * 0.012 + (n.hz - n.z) * 0.006) * dt;
      if (n.x < -AX) n.vx += 0.01 * dt; if (n.x > AX) n.vx -= 0.01 * dt;
      if (n.y < -1) n.vy += 0.01 * dt; if (n.y > 1) n.vy -= 0.01 * dt;
      const sp = Math.hypot(n.vx, n.vy, n.vz), max = 0.028;
      if (sp > max) { n.vx *= max / sp; n.vy *= max / sp; n.vz *= max / sp; }
      n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
      project(n);
      if (n.flow) n.flow *= Math.exp(-dt / 2.5);
    }
    moveMe(dt);

    routeT -= dt;
    if (routeT <= 0) { computeLinks(); route(); routeT = 0.2; }
    signal(dt);

    for (const n of nodes) {
      if (!alive(n)) continue;
      if (n.next && Math.random() < RATE * dt && n.queue.length < 3) n.queue.push({ hidden: Math.random() < HIDDEN_SHARE, retryAt: now });
      const p = n.queue[0];
      if (p && now >= p.retryAt && now >= n.busyUntil) send(n, p);
    }
    for (let i = txs.length - 1; i >= 0; i--) {
      if (now >= txs[i].t1) { const t = txs[i]; txs.splice(i, 1); finish(t); }
    }
    fx = fx.filter((f) => now - f.t0 < 0.9);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const ease = (k) => 1 - Math.pow(1 - k, 3);
    const small = W < 700 ? 1.6 : 1;
    const a3 = (v) => Math.min(1, v * INK).toFixed(3);

    // links: a faint web underneath, then the paths messages take toward you, heavier where
    // they have carried more traffic recently
    for (const l of links) {
      if (l.a.next === l.b || l.b.next === l.a) continue;
      const depth = (l.a.p + l.b.p) / 2 - 0.86;
      const k = calm((l.a.sx + l.b.sx) / 2, (l.a.sy + l.b.sy) / 2);
      ctx.strokeStyle = `rgba(${MUTE},${a3((0.02 + 0.06 * l.q) * small * Math.min(1, 0.55 + depth * 1.6) * k)})`;
      ctx.lineWidth = 0.75;
      ctx.beginPath(); ctx.moveTo(l.a.sx, l.a.sy); ctx.lineTo(l.b.sx, l.b.sy); ctx.stroke();
    }
    for (const l of links) {
      const child = l.a.next === l.b ? l.a : l.b.next === l.a ? l.b : null;
      if (!child) continue;
      const flow = Math.min(1, (child.flow || 0) / 3);
      const k = calm((l.a.sx + l.b.sx) / 2, (l.a.sy + l.b.sy) / 2);
      ctx.strokeStyle = `rgba(${FG},${a3(Math.min(0.9, (0.16 + 0.28 * l.q + 0.36 * flow) * k))})`;
      ctx.lineWidth = 1.05 + flow * 1.1;
      ctx.beginPath(); ctx.moveTo(l.a.sx, l.a.sy); ctx.lineTo(l.b.sx, l.b.sy); ctx.stroke();
    }

    // transmissions: a wavefront spreading from the sender, and the message moving along its link
    for (const t of txs) {
      const k = Math.min(1, (now - t.t0) / TX);
      const f = t.from, c = t.pkt.hidden ? SIG : FG;
      const cm = calm(f.sx, f.sy);
      ctx.strokeStyle = `rgba(${c},${a3((t.pkt.hidden ? 0.46 : 0.26) * RING * (1 - k) * cm)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(f.sx, f.sy, R * 0.72 * S * f.p * ease(k), 0, Math.PI * 2); ctx.stroke();
      const e = ease(k), x = f.sx + (t.to.sx - f.sx) * e, y = f.sy + (t.to.sy - f.sy) * e;
      const cp = calm(x, y), k0 = Math.max(0, e - 0.18);
      ctx.strokeStyle = `rgba(${c},${a3(0.65 * cp)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(f.sx + (t.to.sx - f.sx) * k0, f.sy + (t.to.sy - f.sy) * k0); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = `rgba(${c},${a3(0.95 * cp)})`;
      ctx.beginPath(); ctx.arc(x, y, t.pkt.hidden ? 2.6 : 2.2, 0, Math.PI * 2); ctx.fill();
    }

    // radios
    for (const n of nodes) {
      if (!alive(n)) continue;
      const appear = reduce.matches ? 1 : Math.min(1, (born - n.born) / 0.4);
      const depth = Math.min(1, Math.max(0, (n.p - 0.82) / 0.36));
      const k = calm(n.sx, n.sy) * appear;
      const fl = Math.max(0, 1 - (now - n.flash) / 0.35);
      const r = (1.3 + depth * 1.5) * (1 + fl * 0.8) * (W < 700 ? 1.35 : 1);
      ctx.fillStyle = `rgba(${FG},${a3((0.36 + 0.55 * depth + fl * 0.3) * k)})`;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2); ctx.fill();
    }

    // messages arriving at you
    for (const e of fx) {
      const k = (now - e.t0) / 0.9;
      ctx.strokeStyle = `rgba(${e.hidden ? SIG : FG},${a3(0.55 * (1 - k))})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, 7 + ease(k) * 16, 0, Math.PI * 2); ctx.stroke();
    }

    // you, and the reach of your radio
    const pulse = 0.5 + 0.5 * Math.sin(now * 2.2);
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = `rgba(${FG},${a3((me.nb.length ? 0.13 : 0.22) + 0.06 * pulse)})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(me.sx, me.sy, ME_R * S, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${FG},${a3(0.9)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(me.sx, me.sy, 7.5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(${FG},1)`;
    ctx.beginPath(); ctx.arc(me.sx, me.sy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = "600 11px 'Mona Sans', ui-sans-serif, system-ui, sans-serif";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0.1em";
    ctx.lineWidth = 4; ctx.lineJoin = "round";
    ctx.strokeStyle = `rgba(${GROUND},0.9)`;
    ctx.strokeText("YOU", me.sx + 14, me.sy - 10);
    ctx.fillStyle = `rgba(${FG},${a3(0.85)})`;
    ctx.fillText("YOU", me.sx + 14, me.sy - 10);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  function updateStats() {
    if (!ui.msgs) return;
    ui.range.textContent = me.nb.length;
    ui.msgs.textContent = stats.delivered.toLocaleString("en-US");
    ui.hidden.textContent = stats.hidden.toLocaleString("en-US");
    ui.hidden.classList.toggle("is-zero", !stats.hidden);
    if (level !== shown) {
      ui.bars.dataset.level = level;
      ui.quality.textContent = QUALITY[level];
      shown = level;
    }
  }

  function frame(t) {
    raf = 0;
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    step(dt);
    draw();
    statT -= dt;
    if (statT <= 0) { updateStats(); statT = 0.25; }
    if (running) raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduce.matches) return;
    running = true; last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  // a still picture for reduced motion: let the network settle offscreen, then draw once
  function still() {
    stop();
    for (let i = 0; i < 600; i++) step(1 / 30);
    level = !me.nb.length ? 0 : strength < LEVELS[0] ? 1 : strength < LEVELS[1] ? 2 : strength < LEVELS[2] ? 3 : 4;
    draw();
    updateStats();
  }
  function refreshStill() {
    fx = [];   // arrival rings belong to where you were
    computeLinks(); route();
    let sum = 0; for (const { q } of me.nb) sum += q;
    strength = sum;
    level = !me.nb.length ? 0 : sum < LEVELS[0] ? 1 : sum < LEVELS[1] ? 2 : sum < LEVELS[2] ? 3 : 4;
    draw(); updateStats();
  }

  // ---------- steering ----------
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: Math.min(H - 20, e.clientY - r.top) }; };
  hero.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    target = local(e); mode = "mouse";
    if (reduce.matches) { placeMe(target.x, target.y); refreshStill(); }
  });
  hero.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch" && mode === "mouse") mode = null; });
  hero.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || e.target.closest("a, button")) return;
    target = local(e); mode = "touch"; pinnedUntil = now + 8;
    if (reduce.matches) { placeMe(target.x, target.y); refreshStill(); }
  });

  const hint = document.getElementById("tele-hint");
  if (hint && matchMedia("(pointer: coarse)").matches) {
    hint.textContent = "Each dot is a radio. Messages hop from radio to radio to reach you; tap anywhere to move. Orange ones carry a secondary message on top of an ordinary signal, which is the idea behind my thesis.";
  }

  // ---------- lifecycle ----------
  readPalette();
  resize();
  build();
  computeLinks(); route();
  if (reduce.matches) still();

  if (window.siteTheme) window.siteTheme.on(() => { readPalette(); if (!running) draw(); });
  const io = new IntersectionObserver(([en]) => { if (en.isIntersecting && !document.hidden) start(); else stop(); });
  io.observe(hero);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (hero.getBoundingClientRect().bottom > 0) start(); });
  let rt = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const oldAX = AX, oldW = W, oldH = H;
      resize();
      // keep the network, rescale it to the new shape
      for (const n of nodes) { n.x *= AX / oldAX; n.hx *= AX / oldAX; project(n); }
      if (oldW && oldH) placeMe(me.sx * (W / oldW), me.sy * (H / oldH));
      if (reduce.matches) still(); else if (!running) draw();
    }, 120);
  });
  ro.observe(hero); ro.observe(canvas);
  if (document.fonts) document.fonts.ready.then(measure);
  reduce.addEventListener("change", () => (reduce.matches ? still() : start()));
})();
