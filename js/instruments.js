// Live signal instruments for the research entries. Each one is a small simulation of the
// mechanism, run only while it is on screen.
//   fle:       a QPSK link through a carrier offset that FLE keys between two values;
//              a second-order decision-directed PLL tracks it. The constellation stays
//              locked while the loop's frequency estimate carries the secondary bits.
//   undertone: bursty Wi-Fi frames; each frame's CFO lands on one of four tones.
//              Symbol windows with no frames are erasures.
//   nets:      two Wi-Fi networks whose phones read each other's frame offsets: FLE across networks.
//   seal:      SpectralSeal beacons from a real access point and an impostor: the tones
//              arrive, the phone decodes a 64-bit value, hashes it once, and checks it.
//   sar:       a spectrogram of linear-FM radar pulses during a pass, and below it the
//              delayed-conjugate product that collapses each chirp to a tone for CFAR.
//   sarpass:   the same kind of pass seen from orbit: the radar's imaged strip sweeping over a
//              SARLink station, which counts the pulses while it is inside the strip.
//   waterfall: FLE's transmitted spectrum over time, in depth; the band steps for each bit.
//   uwnodes:   two underwater nodes in one band, up-chirps one way and down-chirps the other, on
//              the same clock as the chirp panel under it.
//   loc:       a NICU room in depth: ranges from signal strength and two multilateration fixes.
(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  // colours come from the page's theme (js/theme.js); ink on paper gets a little more weight
  let FG = "233,238,245", MUTE = "169,179,193", SIG = "255,106,61", SIGT = "255,106,61", PANEL = "10,14,20", INK = 1;
  function readPalette() {
    const p = window.siteTheme && window.siteTheme.palette();
    if (!p) return;
    FG = p.fg; MUTE = p.mute; SIG = p.sig; SIGT = p.sigText || p.sig; PANEL = p.panel; INK = p.theme === "light" ? 1.25 : 1;
  }
  readPalette();
  const MONO = "'Martian Mono', ui-monospace, monospace";
  const rgba = (c, a) => `rgba(${c},${Math.min(1, Number(a) * INK).toFixed(3)})`;
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  function setup(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }
  function label(ctx, text, x, y, color, align) {
    ctx.font = `400 9.5px ${MONO}`;
    ctx.fillStyle = color || rgba(MUTE, 0.75);
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }
  function frameBox(ctx, x, y, w, h) {
    ctx.strokeStyle = rgba(FG, 0.09);
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }
  // A small perspective camera for the scenes drawn in depth. World z is up; the camera stands
  // on the -y side of its target, turned by yaw about z and raised by pitch, dist away; f is the
  // focal length in pixels and (cx, cy) the screen point the target lands on. project() returns
  // [x, y, depth], so far things can fade (the scenes' only "fog": ink thinning with distance).
  function camera(o) {
    const cy = Math.cos(o.yaw), sy = Math.sin(o.yaw), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
    const [tx, ty, tz] = o.target;
    const project = (x, y, z) => {
      x -= tx; y -= ty; z -= tz;
      const x1 = cy * x + sy * y, y1 = -sy * x + cy * y;
      const vz = o.dist + y1 * cp - z * sp, k = o.f / vz;
      return [o.cx + x1 * k, o.cy - (y1 * sp + z * cp) * k, vz];
    };
    const pos = [tx + sy * o.dist * cp, ty - cy * o.dist * cp, tz + o.dist * sp];
    return { project, pos };
  }
  // Paired panels share a clock that steps once per frame, whichever of them is on screen.
  let frameNo = 0;
  function sharedClock(start) {
    const c = { t: 0, f: -1 };
    c.step = (dt) => { if (c.f !== frameNo) { c.f = frameNo; c.t += dt; } };
    c.start = () => { if (c.t < 0.5) c.t = start; };
    return c;
  }
  // A box from z to z + h, filled with the panel so it hides what is behind it; the corner
  // farthest from the camera loses its upright and bottom edges. Returns its projected top face.
  function solid(ctx, project, pos, b, ink, top) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y0 = b.y - b.d / 2, y1 = b.y + b.d / 2;
    const foot = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    let hid = 0, best = -1e9;
    foot.forEach(([x, y], i) => { const dd = Math.hypot(x - pos[0], y - pos[1]); if (dd > best) { best = dd; hid = i; } });
    const P = foot.map(([x, y]) => [project(x, y, b.z), project(x, y, b.z + b.h)]);
    const pts = P.flat().slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cross = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
    const lo = [], hi = [];
    for (const q of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of pts.slice().reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
    ctx.beginPath(); hull.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.fillStyle = `rgb(${PANEL})`; ctx.fill();
    if (top) { ctx.beginPath(); P.forEach((c, i) => (i ? ctx.lineTo(c[1][0], c[1][1]) : ctx.moveTo(c[1][0], c[1][1]))); ctx.closePath(); ctx.fillStyle = top; ctx.fill(); }
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      ctx.moveTo(P[i][1][0], P[i][1][1]); ctx.lineTo(P[j][1][0], P[j][1][1]);
      if (i !== hid) { ctx.moveTo(P[i][0][0], P[i][0][1]); ctx.lineTo(P[i][1][0], P[i][1][1]); }
      if (i !== hid && j !== hid) { ctx.moveTo(P[i][0][0], P[i][0][1]); ctx.lineTo(P[j][0][0], P[j][0][1]); }
    }
    ctx.stroke();
    return P;
  }
  // trace a world-space polyline through a camera
  function path3(ctx, project, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => { const [x, y] = project(p[0], p[1], p[2]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  }

  // ================= FLE =================
  function FLE(cv) {
    const MSG = "TWO STREAMS, ONE CARRIER. ";
    const bits = [];
    for (const ch of MSG) for (let i = 7; i >= 0; i--) bits.push((ch.charCodeAt(0) >> i) & 1);
    const N = 56;              // primary symbols per FLE symbol
    const OMEGA = 0.009;       // rad/symbol offset per secondary bit (exaggerated, still inside the loop's range)
    const SIGMA = 0.03;        // a clean link: the primary decodes with no errors at all
    const BnT = 0.05, zeta = 0.707, d = 1 + 2 * zeta * BnT + BnT * BnT;
    const Kp = (4 * zeta * BnT) / d, Ki = (4 * BnT * BnT) / d;
    const R10 = Math.sqrt(10), LV = [-3, -1, 1, 3];
    const QAM = []; for (const i of LV) for (const q of LV) QAM.push([i / R10, q / R10]);
    const slice = (v) => { const u = v * R10; return (u < -2 ? -3 : u < 0 ? -1 : u < 2 ? 1 : 3) / R10; };

    let g, theta, phiHat, wHat, k, bitIdx, acc, accN, pts, trace, decoded, symbols, errors, lockAt, lockMetric;
    function reset() {
      theta = 0.2; phiHat = 0; wHat = 0; k = 0; bitIdx = 0; acc = 0; accN = 0;
      pts = []; trace = []; decoded = []; symbols = 0; errors = 0; lockAt = 0; lockMetric = 1;
    }
    reset();

    function symbol() {
      const bit = bits[bitIdx % bits.length];
      const w = bit ? OMEGA : -OMEGA;
      theta += w + gauss() * 0.0012;
      const s = QAM[(Math.random() * 16) | 0];
      const c = Math.cos(theta), sn = Math.sin(theta);
      const rx = s[0] * c - s[1] * sn + gauss() * SIGMA, ry = s[0] * sn + s[1] * c + gauss() * SIGMA;
      const pc = Math.cos(phiHat), ps = Math.sin(phiHat);
      const yx = rx * pc + ry * ps, yy = -rx * ps + ry * pc;
      const dx = slice(yx), dy = slice(yy);
      const e = (yy * dx - yx * dy) / (dx * dx + dy * dy);   // Im{y · conj(d)} / |d|^2, a phase error in radians
      wHat += Ki * e;
      phiHat += wHat + Kp * e;
      symbols++;
      lockMetric = 0.985 * lockMetric + 0.015 * Math.abs(e);
      if (!lockAt && symbols > 120 && lockMetric < 0.08) lockAt = symbols;
      if (lockAt && (dx !== s[0] || dy !== s[1])) errors++;
      pts.push([yx, yy]); if (pts.length > 900) pts.shift();
      trace.push(wHat); if (trace.length > 900) trace.shift();
      // the FLE receiver averages the loop's estimate over the second half of each symbol
      if (k % N >= N / 2) { acc += wHat; accN++; }
      k++;
      if (k % N === 0) {
        decoded.push(acc / accN > 0 ? 1 : 0);
        acc = 0; accN = 0; bitIdx++;
        if (decoded.length > 8 * 40) decoded.splice(0, 8);
      }
    }

    function draw() {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      const pad = 18;
      const narrow = w < 560;
      const side = narrow ? Math.min(w - pad * 2, h * 0.42) : Math.min(h - pad * 2 - 18, w * 0.44);
      const cx0 = pad, cy0 = pad + 16;
      // constellation
      label(ctx, "MAIN RECEIVER · 16-QAM", cx0, pad + 4);
      label(ctx, lockAt ? "LOCKED" : "ACQUIRING", cx0 + side, pad + 4, lockAt ? rgba(FG, 0.85) : rgba(SIGT, 0.95), "right");
      frameBox(ctx, cx0, cy0, side, side);
      ctx.strokeStyle = rgba(FG, 0.06);
      ctx.beginPath();
      ctx.moveTo(cx0 + side / 2, cy0 + 8); ctx.lineTo(cx0 + side / 2, cy0 + side - 8);
      ctx.moveTo(cx0 + 8, cy0 + side / 2); ctx.lineTo(cx0 + side - 8, cy0 + side / 2);
      ctx.stroke();
      // older points fade: drawn in twelve runs of one alpha each, so the colour is set 12 times a
      // frame instead of once per point
      const sc = side * 0.43, np = pts.length, ox = cx0 + side / 2, oy = cy0 + side / 2;
      for (let r = 0; r < 12; r++) {
        const i0 = (r * np / 12) | 0, i1 = ((r + 1) * np / 12) | 0;
        ctx.fillStyle = rgba(FG, (0.1 + 0.8 * ((i0 + i1) / 2 / np)).toFixed(3));
        for (let i = i0; i < i1; i++) ctx.fillRect(ox + pts[i][0] * sc - 1, oy - pts[i][1] * sc - 1, 2, 2);
      }
      label(ctx, `${symbols.toLocaleString("en-US")} symbols · ${errors} errors`, cx0, cy0 + side + 14);

      // loop frequency estimate
      const tx0 = narrow ? pad : cx0 + side + 28, tw = w - tx0 - pad;
      const ty0 = narrow ? cy0 + side + 52 : cy0, th = narrow ? Math.min(150, h - ty0 - 110) : side * 0.62;
      label(ctx, "PLL FREQUENCY ESTIMATE", tx0, narrow ? ty0 - 8 : pad + 4);
      label(ctx, "+f", tx0 + tw, ty0 + th * 0.22 - 4, rgba(MUTE, 0.6), "right");
      label(ctx, "−f", tx0 + tw, ty0 + th * 0.78 + 12, rgba(MUTE, 0.6), "right");
      frameBox(ctx, tx0, ty0, tw, th);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = rgba(FG, 0.12);
      for (const yy of [0.22, 0.78]) { ctx.beginPath(); ctx.moveTo(tx0 + 6, ty0 + th * yy); ctx.lineTo(tx0 + tw - 26, ty0 + th * yy); ctx.stroke(); }
      ctx.setLineDash([]);
      const Y = (v) => ty0 + th * (0.5 - (v / OMEGA) * 0.28);
      const n = trace.length, step = (tw - 8) / 900;
      // symbol boundaries
      ctx.strokeStyle = rgba(FG, 0.05);
      const off = (k % N);
      for (let x = tx0 + 4 + (n - 1 - off) * step; x > tx0 + 4; x -= N * step) { ctx.beginPath(); ctx.moveTo(x, ty0 + 4); ctx.lineTo(x, ty0 + th - 4); ctx.stroke(); }
      ctx.strokeStyle = rgba(SIG, 0.95);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = tx0 + 4 + i * step, y = Y(trace[i]);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;

      // decoded bits and text
      const by = ty0 + th + 26;
      label(ctx, "SECONDARY BITS (FLE RX)", tx0, by - 8);
      const cellW = N * step;
      const visible = Math.floor((tw - 8) / cellW);
      const recent = decoded.slice(-visible);
      ctx.font = `400 11px ${MONO}`;
      recent.forEach((b, i) => {
        const x = tx0 + 4 + (n - 1 - off) * step - (recent.length - i) * cellW;
        if (x < tx0) return;
        ctx.fillStyle = b ? rgba(SIGT, 0.9) : rgba(FG, 0.55);
        ctx.fillText(String(b), x + cellW / 2 - 3.5, by + 10);
      });
      const chars = [];
      for (let i = 0; i + 8 <= decoded.length; i += 8) {
        let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | decoded[i + j];
        chars.push(v >= 32 && v < 127 ? String.fromCharCode(v) : "·");
      }
      const text = chars.join("").slice(-34);
      label(ctx, "DECODED", tx0, by + 34);
      ctx.font = `500 13px ${MONO}`;
      ctx.fillStyle = rgba(FG, 0.95);
      ctx.fillText(text, tx0, by + 54);
      if (Math.floor(performance.now() / 500) % 2) {
        ctx.fillStyle = rgba(SIG, 0.95);
        ctx.fillRect(tx0 + ctx.measureText(text).width + 3, by + 43, 7, 13);
      }
    }

    return {
      resize() { g = setup(cv); draw(); },
      tick(dt) { const steps = Math.round(Math.min(dt, 0.05) * 540); for (let i = 0; i < steps; i++) symbol(); draw(); },
      enter() { reset(); },
      still() { reset(); for (let i = 0; i < N * 8 * 6; i++) symbol(); draw(); },
    };
  }

  // ================= UnderTone =================
  // 16-ary UnderTone on bursty Wi-Fi traffic. Every frame the device was already sending
  // lands on one of 16 tones; the receiver averages the frames in each symbol window.
  // Windows with no traffic are erasures, which the Reed–Solomon parity fills in.
  function UnderTone(cv) {
    const M = 16, TS = 0.22, SIGMA = 0.07;  // tones, seconds per symbol (visual), CFO noise in tone spacings
    let g, t, frames, syms, busy, left, nextFrame, cur;
    function reset() { t = 0; frames = []; syms = []; busy = true; left = 1.2; nextFrame = 0; cur = newSym(0); }
    function newSym(t0) { return { t0, tone: (Math.random() * M) | 0, n: 0, votes: new Uint16Array(M) }; }
    reset();
    function advance(dt) {
      t += dt;
      // bursty traffic: mostly busy, with short idle stretches
      left -= dt;
      if (left <= 0) {
        busy = Math.random() < 0.8;
        left = busy ? 0.8 + Math.random() * 1.6 : 0.2 + Math.random() * 0.45;
      }
      const rate = busy ? 60 : 0;
      while (nextFrame <= t) {
        if (rate) {
          const y = cur.tone + gauss() * SIGMA;
          frames.push({ t: nextFrame, y });
          cur.n++; cur.votes[Math.max(0, Math.min(M - 1, Math.round(y)))]++;
        }
        nextFrame += rate ? -Math.log(Math.random()) / rate : 0.05;
      }
      if (t - cur.t0 >= TS) {
        // majority vote over the readings in the window; an empty window is an erasure, not a guess
        cur.dec = cur.n ? cur.votes.indexOf(Math.max(...cur.votes)) : -1;
        syms.push(cur);
        cur = newSym(cur.t0 + TS);
      }
      frames = frames.filter((f) => t - f.t < 6);
      syms = syms.filter((s) => t - s.t0 < 6);
    }
    function draw() {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      const pad = 18, x0 = pad + 22, x1 = w - pad, y0 = pad + 18, plotH = h - 124;
      const span = w < 560 ? 2.6 : 4.4; // seconds shown
      const X = (tt) => x1 - ((t - tt) / span) * (x1 - x0);
      const Y = (v) => y0 + plotH - ((v + 0.5) / M) * plotH;
      const hex = (v) => v.toString(16).toUpperCase();
      label(ctx, "FREQUENCY OFFSET PER WI-FI FRAME", pad, pad + 4);
      label(ctx, "16 TONES · 30 kHz SWING", x1, pad + 4, null, "right");
      frameBox(ctx, x0, y0, x1 - x0, plotH);
      const every = plotH / M < 13 ? 3 : 1;
      for (let m = 0; m < M; m++) {
        ctx.strokeStyle = rgba(FG, m % every ? 0.035 : 0.07);
        ctx.setLineDash([2, 5]);
        ctx.beginPath(); ctx.moveTo(x0 + 4, Y(m)); ctx.lineTo(x1 - 4, Y(m)); ctx.stroke();
        ctx.setLineDash([]);
        if (m % every === 0) label(ctx, hex(m), pad + 2, Y(m) + 3, rgba(MUTE, 0.6));
      }
      // symbol windows
      for (const s of syms.concat(cur)) {
        const a = X(s.t0);
        if (a < x0) continue;
        ctx.strokeStyle = rgba(FG, 0.07);
        ctx.beginPath(); ctx.moveTo(a, y0 + 3); ctx.lineTo(a, y0 + plotH - 3); ctx.stroke();
      }
      // frames
      for (const f of frames) {
        const x = X(f.t);
        if (x < x0 + 2) continue;
        ctx.fillStyle = rgba(FG, 0.9);
        ctx.fillRect(x - 1, Y(f.y) - 1, 2.1, 2.1);
      }
      // decisions: every symbol decodes correctly; erased windows are filled from parity
      const ry = y0 + plotH + 26;
      label(ctx, "DECODED SYMBOLS", pad, ry - 8);
      let erased = 0, shown = 0;
      for (const s of syms) {
        const a = Math.max(x0, X(s.t0) + 2), b = X(s.t0 + TS) - 2;
        if (b < x0 + 2) continue;
        shown++;
        const wide = b - a > 12;
        if (s.dec < 0) {
          erased++;
          ctx.strokeStyle = rgba(MUTE, 0.55);
          ctx.setLineDash([2, 3]);
          ctx.strokeRect(a + 0.5, ry + 0.5, b - a - 1, 22);
          ctx.setLineDash([]);
          if (wide) label(ctx, hex(s.tone), (a + b) / 2, ry + 15, rgba(MUTE, 0.8), "center");
        } else {
          ctx.fillStyle = rgba(SIG, 0.14);
          ctx.fillRect(a, ry, b - a, 22);
          ctx.fillStyle = rgba(SIG, 1);
          ctx.fillRect(a, ry, b - a, 2);
          if (wide) {
            ctx.font = `500 11px ${MONO}`;
            ctx.fillStyle = rgba(SIGT, 1);
            ctx.textAlign = "center";
            ctx.fillText(hex(s.dec), (a + b) / 2, ry + 16);
            ctx.textAlign = "left";
          }
        }
      }
      label(ctx, erased ? `${erased} of ${shown} windows had no traffic · Reed–Solomon parity filled them (dashed)` : `${shown} symbols decoded · no errors`, pad, h - pad + 2);
    }
    return {
      resize() { g = setup(cv); draw(); },
      tick(dt) { advance(Math.min(dt, 0.05)); draw(); },
      enter() { if (t < 1) for (let i = 0; i < 540; i++) advance(1 / 60); },
      still() { reset(); for (let i = 0; i < 600; i++) advance(1 / 60); draw(); },
    };
  }

  // ================= UnderTone: two networks, one UnderTone channel =================
  // Each node sends bursty Wi-Fi frames to its own gateway. A frame's carrier offset sits on the
  // tone of the window it falls in, and the node on the other network hears the frame too, so it
  // reads the tone off it: a channel between networks, carried on traffic already being sent.
  // Windows with no frames are erasures. Four tones, slowed to be seen.
  function Nets(cv) {
    const SYMW = 0.7, TONES = 4, HOP = 0.42, FLY = 0.62, SPAN = 7;
    const PITCH = 0.74, YAW = 0, SWAY = 0.045, DIST = 17, TGT = [0, 2.2, 0.6];
    const ZY = [0, 5.0], ZONES = [[-6.2, -0.9], [0.9, 6.2]];
    // each phone in front, its gateway straight behind it, as in the paper's figure
    const NODE = [[-3.3, 1.0, 0.85], [3.3, 1.0, 0.85]], GW = [[-3.3, 3.5, 0.8], [3.3, 3.5, 0.8]];
    const PH = { w: 0.42, d: 0.06, h: 0.76 }, RT = { w: 0.95, d: 0.55, h: 0.22 };
    const NAME = ["A", "B"];
    const hash = (k, salt) => { let x = Math.imul((k | 0) ^ salt, 0x9e3779b1); x ^= x >>> 15; x = Math.imul(x, 0x85ebca77); x ^= x >>> 13; return (x >>> 0) % TONES; };
    const toneOf = (who, k) => hash(k, who ? 0x6b2f11 : 0x13c7a5);
    // each primary link, phone to gateway
    const LINK = [0, 1].map((w) => [[NODE[w][0], NODE[w][1], NODE[w][2] + PH.h / 2], [GW[w][0], GW[w][1] - RT.d / 2, GW[w][2] + RT.h / 2]]);
    const mix = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
    // the UnderTone channel branches off each primary link (J), since it rides the same frames:
    // one arc between the two links (s = 0 at A's, 1 at B's). A frame's offset peels off at its
    // own link's junction, crosses, and drops down the other link into the other phone.
    const Q = 0.32, J = LINK.map(([a, b]) => mix(a, b, Q));
    const TJ = HOP * Q, DOWN = 0.16, DELAY = TJ + FLY + DOWN;
    const arc = (s) => { const u = 1 - s, p = mix(J[0], J[1], s); p[2] += 4 * 1.15 * s * u; return p; };
    // where a frame's offset is, a seconds after the frame left its phone (null before it branches)
    const carried = (who, a) => {
      if (a < TJ || a > DELAY) return null;
      if (a <= TJ + FLY) { const s = (a - TJ) / FLY; return arc(who ? 1 - s : s); }
      const r = 1 - who; return mix(J[r], LINK[r][0], (a - TJ - FLY) / DOWN);
    };
    let g, t, fit, frames, src, dec, heard;
    function reset() {
      t = 0; frames = []; heard = [[], []]; dec = [0, 0];
      src = [0, 1].map(() => ({ next: Math.random() * 0.5, end: 1 + Math.random() }));
    }
    reset();
    function advance(dt) {
      t += dt;
      // bursty sources: frames 80 to 280 ms apart within a burst, then a quiet gap
      src.forEach((s, who) => {
        while (s.next <= t) {
          const k = Math.floor(s.next / SYMW);
          frames.push({ who, t0: s.next, k, tone: toneOf(who, k), jit: gauss() * 0.05 });
          let nx = s.next + 0.08 + Math.random() * 0.2;
          if (nx > s.end) { nx = s.end + 0.3 + Math.random() * 1.3; s.end = nx + 0.4 + Math.random() * 1.8; }
          s.next = nx;
        }
      });
      // each window is decided once its last frame could have arrived: its tone, or an erasure
      for (const r of [0, 1]) {
        while ((dec[r] + 1) * SYMW + DELAY <= t) {
          const k = dec[r], got = frames.some((f) => f.who !== r && f.k === k);
          heard[r].push(got ? toneOf(1 - r, k) : null); dec[r]++;
          if (heard[r].length > 8) heard[r].shift();
        }
      }
      frames = frames.filter((f) => t - f.t0 < SPAN + 1);
    }
    const inset = (w, h) => {
      const narrow = w < 560, iw = narrow ? w - 36 : Math.min(330, Math.round(w * (w < 820 ? 0.5 : 0.34))), ih = narrow ? 96 : 108;
      return { x: Math.round((w - iw) / 2), y: narrow ? 30 : 14, w: iw, h: ih };
    };
    function fitCam(w, h) {
      const box = inset(w, h), top = box.y + box.h + 34, bottom = w < 820 ? 54 : 22, side = 14;
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      const pts = [], compact = w < 820;
      // narrow screens frame the devices and let the networks' areas run off the sides
      if (compact) { for (const x of [-4.3, 4.3]) for (const y of ZY) pts.push([x, y, 0]); }
      else for (const [x0, x1] of ZONES) for (const x of [x0, x1]) for (const y of ZY) pts.push([x, y, 0]);
      for (const q of GW) pts.push([q[0], q[1], q[2] + 1.0]);
      pts.push(arc(0.5));
      for (const yaw of [YAW - SWAY, YAW + SWAY]) {
        const { project } = camera({ yaw, pitch: PITCH, dist: DIST, target: TGT, f: 1, cx: 0, cy: 0 });
        for (const q of pts) { const [u, v] = project(...q); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      }
      const f = Math.min((w - 2 * side) / (u1 - u0), (h - top - bottom) / (v1 - v0));
      fit = { f, cx: w / 2 - (f * (u0 + u1)) / 2, cy: top + (h - top - bottom) / 2 - (f * (v0 + v1)) / 2 };
    }
    function draw() {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      if (!fit) fitCam(w, h);
      const { project, pos } = camera({ yaw: YAW + SWAY * Math.sin((t / 30) * Math.PI * 2), pitch: PITCH, dist: DIST, target: TGT, ...fit });
      const narrow = w < 560, compact = w < 820, pad = 18;
      const fog = (d) => 1 - 0.45 * Math.min(1, Math.max(0, (d - (DIST - 4)) / 9));
      const P = (q) => project(q[0], q[1], q[2]);
      // the floor, and the two networks' areas on it
      for (let x = -7; x <= 7; x++) { const d = project(x, 2.3, 0)[2]; ctx.strokeStyle = rgba(FG, 0.045 * fog(d)); path3(ctx, project, [[x, -0.6, 0], [x, 5.2, 0]]); ctx.stroke(); }
      for (let y = 0; y <= 5.5; y++) { const d = project(0, y, 0)[2]; ctx.strokeStyle = rgba(FG, 0.045 * fog(d)); path3(ctx, project, [[-7, y, 0], [7, y, 0]]); ctx.stroke(); }
      ZONES.forEach(([x0, x1], i) => {
        path3(ctx, project, [[x0, ZY[0], 0], [x1, ZY[0], 0], [x1, ZY[1], 0], [x0, ZY[1], 0]]); ctx.closePath();
        ctx.fillStyle = rgba(FG, 0.03); ctx.fill();
        ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(FG, 0.22); ctx.stroke(); ctx.setLineDash([]);
        // the name in the outer back corner, clear of the devices (on phones, under the zone's front edge)
        const [lx, ly] = compact ? project(NODE[i][0], ZY[0] - 0.2, 0) : project(i ? x1 - 0.25 : x0 + 0.25, ZY[1] - 0.35, 0);
        ctx.font = `500 11px ${MONO}`; ctx.fillStyle = rgba(FG, 0.85); ctx.textAlign = compact ? "center" : i ? "right" : "left"; ctx.fillText(`NETWORK ${NAME[i]}`, lx, ly + (compact ? 22 : 0)); ctx.textAlign = "left";
      });
      // drop lines from each device to the floor
      for (const q of [...NODE, ...GW]) {
        const z0 = NODE.includes(q) ? q[2] - PH.h / 2 : q[2];
        const [fx, fy, fd] = project(q[0], q[1], 0), [tx2, ty2] = project(q[0], q[1], z0);
        ctx.strokeStyle = rgba(FG, 0.2 * fog(fd)); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx2, ty2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = rgba(FG, 0.35 * fog(fd)); ctx.beginPath(); ctx.ellipse(fx, fy, 3, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      }
      // a pulse around the phone as each frame goes out
      for (const f of frames) {
        const a = (t - f.t0) / 0.4; if (a < 0 || a > 1) continue;
        const [cx2, cy2, cd] = P(NODE[f.who]), R = (0.25 + 0.6 * a) * (fit.f / cd);
        ctx.strokeStyle = rgba(FG, 0.35 * (1 - a)); ctx.beginPath(); ctx.arc(cx2, cy2, R, 0, Math.PI * 2); ctx.stroke();
      }
      // the primary links, phone to gateway, with frames riding them
      for (const who of [0, 1]) {
        const [a, b] = LINK[who], pa = P(a), pb = P(b), ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
        ctx.strokeStyle = rgba(FG, 0.45); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0] - 4 * Math.cos(ang), pb[1] - 4 * Math.sin(ang)); ctx.stroke(); ctx.lineWidth = 1;
        ctx.fillStyle = rgba(FG, 0.45); ctx.beginPath(); ctx.moveTo(pb[0], pb[1]); ctx.lineTo(pb[0] - 7 * Math.cos(ang - 0.42), pb[1] - 7 * Math.sin(ang - 0.42)); ctx.lineTo(pb[0] - 7 * Math.cos(ang + 0.42), pb[1] - 7 * Math.sin(ang + 0.42)); ctx.fill();
      }
      // the UnderTone channel between the two links, a junction where it leaves each one (with a
      // ring as a frame's offset branches off), and a comet for every frame read across it
      {
        const pts = []; for (let i = 0; i <= 48; i++) pts.push(P(arc(i / 48)));
        ctx.strokeStyle = rgba(SIG, 0.55); ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      }
      for (const f of frames) {
        const a = (t - f.t0 - TJ) / 0.35; if (a < 0 || a > 1) continue;
        const [x, y] = P(J[f.who]);
        ctx.strokeStyle = rgba(SIG, 0.7 * (1 - a)); ctx.beginPath(); ctx.arc(x, y, 3 + 7 * a, 0, Math.PI * 2); ctx.stroke();
      }
      for (const w of [0, 1]) { const [x, y] = P(J[w]); ctx.fillStyle = rgba(SIG, 0.95); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
      for (const f of frames) {
        for (let k = 4; k >= 0; k--) {
          const q = carried(f.who, t - f.t0 - k * 0.016); if (!q) continue;
          const [x, y] = P(q);
          ctx.fillStyle = rgba(SIG, (k ? 0.5 - k * 0.09 : 1)); ctx.beginPath(); ctx.arc(x, y, k ? 2 : 3, 0, Math.PI * 2); ctx.fill();
        }
      }
      // the devices, far ones first
      const age = (who, lo, hi) => frames.some((f) => f.who === who && t - f.t0 >= lo && t - f.t0 < hi);
      const things = [];
      GW.forEach((q, who) => things.push({ d: P(q)[2], draw: () => {
        const b = { x: q[0], y: q[1], z: q[2], ...RT };
        const C = solid(ctx, project, pos, b, rgba(FG, 0.7 * fog(P(q)[2])), rgba(FG, 0.05));
        // antennas from the back corners, splayed a little
        for (const sx of [-1, 1]) {
          const base = P([q[0] + sx * 0.38, q[1] + 0.2, q[2] + RT.h]), tip = P([q[0] + sx * 0.5, q[1] + 0.26, q[2] + RT.h + 0.55]);
          ctx.strokeStyle = rgba(FG, 0.7); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke(); ctx.lineCap = "butt"; ctx.lineWidth = 1;
        }
        // status lights on the front face; one lights as a frame arrives
        const on = age(who, HOP, HOP + 0.18);
        for (let i = 0; i < 3; i++) {
          const [lx, ly] = P([q[0] - 0.3 + i * 0.16, q[1] - RT.d / 2, q[2] + RT.h / 2]);
          ctx.fillStyle = i === 0 && on ? rgba(FG, 1) : rgba(FG, 0.4); ctx.beginPath(); ctx.arc(lx, ly, i === 0 && on ? 2.4 : 1.6, 0, Math.PI * 2); ctx.fill();
        }
        const [gx, gy] = P([q[0], q[1], q[2] + RT.h + 0.75]);
        label(ctx, `GATEWAY ${NAME[who]}`, gx, gy - 4, rgba(FG, 0.85), "center");
      } }));
      NODE.forEach((q, who) => things.push({ d: P(q)[2], draw: () => {
        const b = { x: q[0], y: q[1], z: q[2] - PH.h / 2, ...PH };
        solid(ctx, project, pos, b, rgba(FG, 0.8), null);
        // the screen: it lights as the phone sends, and turns orange as it reads the other network
        const m = 0.05, sc = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => P([q[0] + sx * (PH.w / 2 - m), q[1] - PH.d / 2, q[2] + sz * (PH.h / 2 - m * 1.6)]));
        let rx = 0, tx = 0;
        for (const f of frames) {
          const a = t - f.t0;
          if (f.who !== who && a >= DELAY) rx = Math.max(rx, Math.exp(-(a - DELAY) / 0.09));
          if (f.who === who && a >= 0) tx = Math.max(tx, Math.exp(-a / 0.07));
        }
        ctx.beginPath(); sc.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.fillStyle = rgba(FG, 0.05 + 0.16 * tx); ctx.fill();
        if (rx > 0.02) { ctx.fillStyle = rgba(SIG, 0.42 * rx); ctx.fill(); }
        ctx.strokeStyle = rgba(FG, 0.3); ctx.stroke();
      } }));
      things.sort((a, b) => b.d - a.d).forEach((o) => o.draw());
      // frames on their way to the gateway
      for (const f of frames) {
        const a = (t - f.t0) / HOP; if (a < 0 || a > 1) continue;
        const [p0, p1] = LINK[f.who], [x, y] = P([p0[0] + (p1[0] - p0[0]) * a, p0[1] + (p1[1] - p0[1]) * a, p0[2] + (p1[2] - p0[2]) * a]);
        ctx.fillStyle = rgba(FG, 0.95); ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      // names and what each phone has read from the other network
      ctx.font = `400 9.5px ${MONO}`;
      NODE.forEach((q, who) => {
        const side = who ? 1 : -1, al = who ? "left" : "right";
        const [nx, ny] = compact ? P([q[0], q[1] - 0.75, 0]) : P([q[0] + side * (PH.w / 2 + 0.12), q[1], q[2] + 0.12]);
        label(ctx, `NODE ${NAME[who]}`, nx, ny, rgba(FG, 0.9), compact ? "center" : al);
        const got = heard[who].slice(narrow ? -4 : -6), parts = got.map((v) => (v === null ? "–" : String(v)));
        const head = `FROM ${NAME[1 - who]} `, cw = ctx.measureText("0").width, gap = cw * 1.6;
        const total = ctx.measureText(head).width + parts.length * gap;
        let x0 = compact ? nx - total / 2 : who ? nx : nx - total;
        label(ctx, head, x0, ny + 14);
        x0 += ctx.measureText(head).width;
        parts.forEach((v, i) => { label(ctx, v, x0 + i * gap, ny + 14, i === parts.length - 1 ? rgba(SIGT, 0.95) : rgba(FG, 0.75)); });
        // the link's name on its outer side, clear of the FLE channel
        const [a, b] = LINK[who], mid = P([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
        if (!narrow) label(ctx, "PRIMARY LINK", mid[0] + side * 12, mid[1] + 3, null, al);
      });
      // the channel's name under the arc, in the clear space between the two links
      const [fx, fy] = P([0, J[0][1], J[0][2] + 0.05]);
      label(ctx, "UNDERTONE CHANNEL", fx, fy, rgba(SIGT, 0.95), "center");
      // the inset: node A's frames, each on its window's tone, as node B reads them
      const box = inset(w, h), apex = P(arc(0.5));
      ctx.strokeStyle = rgba(FG, 0.16);
      ctx.beginPath(); ctx.moveTo(box.x + 24, box.y + box.h); ctx.lineTo(apex[0] - 3, apex[1] - 6); ctx.moveTo(box.x + box.w - 24, box.y + box.h); ctx.lineTo(apex[0] + 3, apex[1] - 6); ctx.stroke();
      ctx.fillStyle = `rgb(${PANEL})`; ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = rgba(FG, 0.16); ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
      label(ctx, "CARRIER FREQUENCY OFFSET · NODE A", box.x + box.w / 2, box.y + 16, rgba(FG, 0.85), "center");
      const px0 = box.x + 22, px1 = box.x + box.w - 16, py0 = box.y + 26, py1 = box.y + box.h - 22, mid = (py0 + py1) / 2, step = (py1 - py0 - 8) / TONES;
      const X = (tt) => px0 + 4 + ((tt - (t - SPAN)) / SPAN) * (px1 - px0 - 8);
      const Y = (tone, jit = 0) => mid - (tone - (TONES - 1) / 2 + jit) * step;
      ctx.strokeStyle = rgba(FG, 0.2); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(px0, mid); ctx.lineTo(px1, mid); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.beginPath(); ctx.rect(px0 + 1, py0 - 2, px1 - px0 - 2, py1 - py0 + 4); ctx.clip();
      const wins = new Map(); for (const f of frames) if (f.who === 0 && f.t0 <= t) wins.set(f.k, f.tone);
      for (const [k, tone] of wins) { ctx.strokeStyle = rgba(SIG, 0.3); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(k * SYMW), Y(tone)); ctx.lineTo(X(Math.min(t, (k + 1) * SYMW)), Y(tone)); ctx.stroke(); }
      ctx.lineWidth = 1;
      for (const f of frames) if (f.who === 0 && f.t0 <= t) { ctx.fillStyle = rgba(SIG, 0.95); ctx.fillRect(Math.round(X(f.t0)) - 1, Math.round(Y(f.tone, f.jit)) - 3, 3, 6); }
      ctx.restore();
      for (let k = Math.ceil((t - SPAN) / SYMW); k * SYMW <= t; k++) { const x = X(k * SYMW); if (x > px0 + 2) { ctx.strokeStyle = rgba(FG, 0.18); ctx.beginPath(); ctx.moveTo(x, py1 - 3); ctx.lineTo(x, py1); ctx.stroke(); } }
      ctx.strokeStyle = rgba(FG, 0.45); ctx.fillStyle = rgba(FG, 0.45);
      ctx.beginPath(); ctx.moveTo(px0, py1); ctx.lineTo(px0, py0 - 4); ctx.moveTo(px0, py1); ctx.lineTo(px1, py1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px0, py0 - 8); ctx.lineTo(px0 - 3, py0 - 2); ctx.lineTo(px0 + 3, py0 - 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px1 + 4, py1); ctx.lineTo(px1 - 2, py1 - 3); ctx.lineTo(px1 - 2, py1 + 3); ctx.fill();
      label(ctx, "TIME", (px0 + px1) / 2, py1 + 14, null, "center");
      label(ctx, narrow ? "SIMULATED" : "SIMULATED · SLOWED", pad, pad + 4);
    }
    return {
      resize() { g = setup(cv); fit = null; draw(); },
      tick(dt) { advance(Math.min(dt, 0.05)); draw(); },
      enter() { if (t < 1) for (let i = 0; i < 240; i++) advance(1 / 30); },
      still() { reset(); for (let i = 0; i < 260; i++) advance(1 / 30); draw(); },
    };
  }

  // ================= SARLink: one pass for both panels =================
  // The globe and the spectrogram under it run on this clock, so the station hears the pulses
  // while the beam the globe shows is near it. Lengths are in Earth radii.
  const PASS = (() => {
    const RO = 1.45, LOOK = (18 * Math.PI) / 180, BEAM = (3.2 * Math.PI) / 180, PERIOD = 13, SPAN = 0.95;
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
    const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    // the station, at the top of the globe; the camera stands behind it, looking over the horizon
    const st = [0, 0, 1];
    // ground track: passes LOOK beyond the station (seen from the camera), left to right, so the
    // satellite crosses the sky above it
    const along = norm(add([1, 0, 0], st, -st[0]));
    const side = norm(crs(st, along));
    const g0 = norm(add(mul(st, Math.cos(LOOK)), side, Math.sin(LOOK)));
    const e1 = g0, e2 = norm(add(along, g0, -dot(along, g0))), n = crs(e1, e2);
    const sgn = dot(add(mul(e1, Math.cos(LOOK)), n, Math.sin(LOOK)), st) > dot(add(mul(e1, Math.cos(LOOK)), n, -Math.sin(LOOK)), st) ? 1 : -1;
    const sub = (tau) => add(mul(e1, Math.cos(tau)), e2, Math.sin(tau));
    const foot = (tau) => norm(add(mul(sub(tau), Math.cos(LOOK)), n, sgn * Math.sin(LOOK)));
    const tauAt = (tt) => (((((tt % PERIOD) + PERIOD) % PERIOD) / PERIOD) * 2 - 1) * SPAN;
    // the footprint's distance from the station; the station hears the sidelobes before and after
    const off = (tt) => Math.acos(Math.min(1, dot(foot(tauAt(tt)), st)));
    const hear = (tt) => Math.exp(-((off(tt) / (1.6 * BEAM)) ** 2));
    const clock = sharedClock(PERIOD * 0.25);
    return { RO, LOOK, BEAM, PERIOD, SPAN, norm, dot, crs, add, mul, st, side, e1, e2, n, sub, foot, tauAt, off, hear, clock, step: clock.step, start: clock.start };
  })();

  // ================= SARLink =================
  function SAR(cv) {
    const COLS = 260, ROWS = 72, DROWS = 40;
    const PRI = 9, PULSE = 4;           // columns
    const DCM_ROW = 14;
    const RATE = 70;                    // columns a second
    let g, spec, dcm, col, acc, img, dimg, off, doff, pulses, hits, lastHit, cfarHist;
    function reset() {
      spec = new Float32Array(COLS * ROWS); dcm = new Float32Array(COLS * DROWS);
      col = 0; acc = 0; pulses = 0; hits = []; lastHit = -999; cfarHist = [];
    }
    reset();
    // the newest column is now; older ones were heard earlier in the pass
    const fill = (n) => { for (let i = 0; i < n; i++) addColumn(PASS.hear(PASS.clock.t - (n - 1 - i) / RATE)); };
    function addColumn(e) {
      // shift left by one column
      spec.copyWithin(0, 1); dcm.copyWithin(0, 1);
      const inPulse = col % PRI;
      const on = inPulse < PULSE && e > 0.02;
      for (let r = 0; r < ROWS; r++) {
        let v = 0.06 + Math.abs(gauss()) * 0.07;
        if (on) {
          // linear FM: frequency climbs across the pulse
          const fr = 8 + ((inPulse + Math.random() * 0.6) / PULSE) * (ROWS - 18);
          v += e * 0.9 * Math.exp(-(((r - fr) / 2.2) ** 2));
        }
        spec[r * COLS + COLS - 1] = v;
      }
      let peak = 0;
      for (let r = 0; r < DROWS; r++) {
        let v = 0.05 + Math.abs(gauss()) * 0.06;
        if (on) v += (0.32 + 0.75 * e) * Math.exp(-(((r - DCM_ROW) / 1.1) ** 2));
        dcm[r * COLS + COLS - 1] = v;
        if (Math.abs(r - DCM_ROW) < 2) peak = Math.max(peak, v);
      }
      // cell-averaging CFAR on the DCM column at the chirp-rate bin
      let noise = 0, nn = 0;
      for (let r = 0; r < DROWS; r++) if (Math.abs(r - DCM_ROW) > 4) { noise += dcm[r * COLS + COLS - 1]; nn++; }
      noise /= nn;
      const hit = peak > noise * 3.2;
      if (hit && col - lastHit >= PULSE) { pulses++; hits.push(COLS - 1); lastHit = col; }
      for (let i = 0; i < hits.length; i++) hits[i]--;
      hits = hits.filter((x) => x > 0);
      col++;
    }
    function paint(buf, rows, imgData, gain) {
      const d = imgData.data;
      const p0 = PANEL.split(",").map(Number), p1 = FG.split(",").map(Number);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = Math.min(1, buf[r * COLS + c] * gain);
          const i = ((rows - 1 - r) * COLS + c) * 4;
          // from the panel colour to the ink colour, so it reads in either theme
          d[i] = p0[0] + v * (p1[0] - p0[0]); d[i + 1] = p0[1] + v * (p1[1] - p0[1]); d[i + 2] = p0[2] + v * (p1[2] - p0[2]); d[i + 3] = 255;
        }
      }
    }
    function draw() {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      if (!img) {
        off = document.createElement("canvas"); off.width = COLS; off.height = ROWS;
        doff = document.createElement("canvas"); doff.width = COLS; doff.height = DROWS;
        img = off.getContext("2d").createImageData(COLS, ROWS);
        dimg = doff.getContext("2d").createImageData(COLS, DROWS);
      }
      paint(spec, ROWS, img, 1.05); off.getContext("2d").putImageData(img, 0, 0);
      paint(dcm, DROWS, dimg, 0.9); doff.getContext("2d").putImageData(dimg, 0, 0);
      const pad = 18, x0 = pad, x1 = w - pad;
      const sh = (h - pad * 2 - 70) * 0.6, dh = (h - pad * 2 - 70) * 0.4;
      const sy = pad + 14, dy = sy + sh + 34;
      ctx.imageSmoothingEnabled = true;
      label(ctx, "SPECTROGRAM · X-BAND IF", x0, pad + 4);
      const loud = PASS.hear(PASS.clock.t) > 0.05;
      label(ctx, loud ? "RECEIVING PULSES" : "LISTENING", x1, pad + 4, loud ? rgba(SIGT, 0.95) : null, "right");
      ctx.drawImage(off, x0, sy, x1 - x0, sh);
      frameBox(ctx, x0, sy, x1 - x0, sh);
      label(ctx, "DELAYED-CONJUGATE PRODUCT · CFAR", x0, dy - 8);
      ctx.drawImage(doff, x0, dy, x1 - x0, dh);
      frameBox(ctx, x0, dy, x1 - x0, dh);
      // detections
      const cw = (x1 - x0) / COLS;
      const ry = dy + dh * (1 - (DCM_ROW + 0.5) / DROWS);
      ctx.strokeStyle = rgba(SIG, 0.95);
      ctx.lineWidth = 1.2;
      for (const c of hits) {
        const x = x0 + c * cw;
        ctx.strokeRect(x - 2, ry - 7, PULSE * cw + 4, 14);
      }
      ctx.lineWidth = 1;
      label(ctx, `${pulses.toLocaleString("en-US")} pulses shown · slowed down`, x0, h - pad + 2);
    }
    return {
      resize() { g = setup(cv); draw(); },
      tick(dt) { dt = Math.min(dt, 0.05); PASS.step(dt); acc += dt * RATE; const n = Math.floor(acc); acc -= n; fill(n); draw(); },
      enter() { if (col < COLS) { PASS.start(); fill(COLS); } },
      still() { reset(); PASS.clock.t = PASS.PERIOD / 2; fill(COLS); draw(); },
    };
  }


  // ================= FLE: the transmitted spectrum over time =================
  // A waterfall in depth: each ridge is the spectrum at one moment, newest in front. FLE moves the
  // whole band up a little for a 1 and down for a 0 (the same message the 16-QAM panel decodes);
  // the orange trace follows the band's centre back through time. Shift exaggerated to be seen.
  function Waterfall(cv) {
    const MSG = "TWO STREAMS, ONE CARRIER. ";
    const bits = [];
    for (const ch of MSG) for (let i = 7; i >= 0; i--) bits.push((ch.charCodeAt(0) >> i) & 1);
    const F = 150, M = 46, ROW_S = 1 / 15, SYM = 7, SHIFT = 0.13, HALF = 0.42, ROLL = 0.12;
    const WX = 1.7, DY = 0.085, HZ = 0.55, PITCH = 0.5, YAW = -0.18, SWAY = 0.05, DIST = 7.2;
    let g, t, acc, rows, n, fit;
    function reset() { t = 0; acc = 0; rows = []; n = 0; }
    reset();
    function row() {
      const b = bits[Math.floor(n / SYM) % bits.length], c = b ? SHIFT : -SHIFT;
      const raw = new Float32Array(F);
      for (let j = 0; j < F; j++) {
        const f = (j / (F - 1)) * 2 - 1, x = Math.abs(f - c);
        // a raised-cosine band over a noise floor
        const shape = x < HALF - ROLL ? 1 : x < HALF + ROLL ? 0.5 * (1 + Math.cos((Math.PI * (x - HALF + ROLL)) / (2 * ROLL))) : 0;
        raw[j] = 0.05 + Math.abs(gauss()) * 0.035 + shape * (0.82 + gauss() * 0.06);
      }
      const v = new Float32Array(F);
      for (let j = 0; j < F; j++) v[j] = (raw[Math.max(0, j - 1)] + 2 * raw[j] + raw[Math.min(F - 1, j + 1)]) / 4;
      rows.unshift({ v, c, bit: b, first: n % SYM === 0, idx: Math.floor(n / SYM) });
      if (rows.length > M + 1) rows.pop();
      n++;
    }
    // the transmitter sits left of the waterfall and the two receivers right of it (below it on phones)
    const layout = (w) => w < 560
      ? { narrow: true, L: 18, Rm: 18, top: 92, bottom: 96 }
      : { narrow: false, L: 182, Rm: 250, top: 30, bottom: 30 };
    function fitCam(w, h) {
      const { L, Rm, top, bottom } = layout(w);
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (const yaw of [YAW - SWAY, YAW + SWAY]) {
        const { project } = camera({ yaw, pitch: PITCH, dist: DIST, target: [0, (M * DY) / 2, 0.3], f: 1, cx: 0, cy: 0 });
        for (const x of [-WX * 1.12, WX * 1.12]) for (const y of [0, M * DY]) for (const z of [0, HZ * 1.1]) {
          const [u, vv] = project(x, y, z); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, vv); v1 = Math.max(v1, vv);
        }
      }
      const f = Math.min((w - L - Rm) / (u1 - u0), (h - top - bottom) / (v1 - v0));
      fit = { f, cx: L + (w - L - Rm) / 2 - (f * (u0 + u1)) / 2, cy: top + (h - top - bottom) / 2 - (f * (v0 + v1)) / 2 };
    }
    function block(ctx, x, y, bw, bh, title, sig) {
      ctx.fillStyle = `rgb(${PANEL})`; ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = sig ? rgba(SIG, 0.9) : rgba(FG, 0.32); ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(bw) - 1, Math.round(bh) - 1);
      label(ctx, title, x + 10, y + 16, sig ? rgba(SIGT, 0.95) : rgba(FG, 0.92));
    }
    // a flow arrow with packets riding it (positions 0..1 along it)
    function flow(ctx, a, b, color, dashed, dots) {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; if (dashed) ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0] - 5 * Math.cos(ang), b[1] - 5 * Math.sin(ang)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - 7 * Math.cos(ang - 0.42), b[1] - 7 * Math.sin(ang - 0.42)); ctx.lineTo(b[0] - 7 * Math.cos(ang + 0.42), b[1] - 7 * Math.sin(ang + 0.42)); ctx.fill();
      for (const u of dots) { const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.lineWidth = 1;
    }
    function draw() {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      if (!fit) fitCam(w, h);
      const { project } = camera({ yaw: YAW + SWAY * Math.sin((t / 22) * Math.PI * 2), pitch: PITCH, dist: DIST, target: [0, (M * DY) / 2, 0.3], ...fit });
      const pad = 18, frac = acc / ROW_S;
      const X = (j) => ((j / (F - 1)) * 2 - 1) * WX;
      // the nominal carrier, dashed along the floor
      ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba(FG, 0.2);
      path3(ctx, project, [[0, 0, 0], [0, (M + 1) * DY, 0]]); ctx.stroke(); ctx.setLineDash([]);
      // back to front, each ridge filled with the panel so it hides the ones behind it
      const trace = [];
      const centres = [];
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i], y = (i + frac) * DY, k = 1 - Math.min(1, (i + frac) / M);
        const pts = []; for (let j = 0; j < F; j++) pts.push([X(j), y, r.v[j] * HZ]);
        ctx.beginPath();
        pts.forEach((p, j) => { const [sx, sy] = project(p[0], p[1], p[2]); j ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
        const [ex, ey] = project(WX, y, 0), [bx, by] = project(-WX, y, 0);
        ctx.lineTo(ex, ey); ctx.lineTo(bx, by); ctx.closePath();
        ctx.fillStyle = `rgb(${PANEL})`; ctx.fill();
        ctx.strokeStyle = rgba(FG, 0.12 + 0.6 * k * k); ctx.lineWidth = i === 0 ? 1.4 : 1;
        ctx.beginPath(); pts.forEach((p, j) => { const [sx, sy] = project(p[0], p[1], p[2]); j ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.stroke();
        ctx.lineWidth = 1;
        // the band's centre, just above the band, kept for the trace drawn over everything
        trace.push([project(r.c * WX, y, 1.08 * HZ), k]);
        if (r.first) centres.push({ r, y, k });
      }
      ctx.lineWidth = 1.5;
      for (let q = 1; q < trace.length; q++) {
        const [a0] = trace[q - 1], [a1, k] = trace[q];
        ctx.strokeStyle = rgba(SIG, 0.95 * Math.min(1, k * 1.8)); ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
      }
      ctx.lineWidth = 1;
      // each secondary bit, written at the right edge where its symbol starts
      for (const { r, y, k } of centres) {
        const [lx, ly] = project(WX * 1.06, y, 0);
        ctx.font = `400 ${Math.round(9 + 3 * k)}px ${MONO}`; ctx.fillStyle = rgba(SIGT, 0.35 + 0.6 * k); ctx.fillText(String(r.bit), lx, ly);
      }
      const [fx, fy] = project(0, 0, 0);
      label(ctx, "fc", fx - 5, fy + 14);
      const [ax, ay] = project(-WX, 0, 0), [tx, ty] = project(-WX * 1.04, M * DY * 0.55, 0);
      label(ctx, "FREQUENCY →", ax + (w < 560 ? 14 : 0), ay + 14);
      if (w >= 560) label(ctx, "TIME", tx - 30, ty);
      const lay = layout(w);
      label(ctx, lay.narrow ? "SIMULATED" : "TRANSMITTED SPECTRUM · SIMULATED", lay.narrow ? w - pad : pad, pad + 4, null, lay.narrow ? "right" : "left");
      // the transmitter and the two receivers hearing the newest ridge: placed from the camera at
      // rest, so they hold still while the scene sways, and sized to their longest text
      const rest = camera({ yaw: YAW, pitch: PITCH, dist: DIST, target: [0, (M * DY) / 2, 0.3], ...fit }).project;
      const through = ((n - 1) % SYM + frac) / SYM;                // how far through the current bit
      const bitsDone = Math.floor((n - 1) / SYM);                  // bits the secondary receiver has decided
      const chars = Math.floor(bitsDone / 8), part = bitsDone - chars * 8, keep = lay.narrow ? 11 : 17;
      let text = ""; for (let i = Math.max(0, chars - keep); i < chars; i++) text += MSG[i % MSG.length];
      let partial = ""; for (let i = 0; i < part; i++) partial += bits[(chars * 8 + i) % bits.length];
      const count = Math.floor(t * 960).toLocaleString("en-US");
      const dots = (k, off) => Array.from({ length: k }, (_, i) => (t * 0.9 + i / k + off) % 1);
      ctx.font = `400 9.5px ${MONO}`;
      const size = (lines) => ({ w: Math.ceil(Math.max(...lines.map((s) => ctx.measureText(s).width))) + 20, h: 10 + 15 * lines.length });
      const txT = ["TX", "DATA + FLE SHIFTS"];
      const prT = lay.narrow ? ["PRIMARY RX", "000,000 SYMBOLS", "0 ERRORS"] : ["PRIMARY RX", "000,000 SYMBOLS · 0 ERRORS"];
      const srT = ["SECONDARY RX", "“" + "0".repeat(keep) + "”", "BITS 0000000"];
      const txb = size(txT), prx = size(prT), srx = size(srT);
      const rw = Math.max(prx.w, srx.w); prx.w = srx.w = rw;
      const fl = rest(-WX, 0, 0), fr = rest(WX, 0, 0);
      if (lay.narrow) {
        const y = h - pad - Math.max(prx.h, srx.h);
        Object.assign(txb, { x: pad, y: 34 });
        Object.assign(prx, { x: pad, y }); Object.assign(srx, { x: w - pad - rw, y });
        flow(ctx, [txb.x + 12, txb.y + txb.h], [fl[0] + 2, fl[1] - 16], rgba(FG, 0.55), false, dots(2, 0));
        flow(ctx, [fl[0] + 4, fl[1] + 6], [Math.max(prx.x + 14, fl[0] + 4), prx.y], rgba(FG, 0.55), false, dots(2, 0.3));
        flow(ctx, [fr[0] - 4, fr[1] + 6], [Math.min(srx.x + srx.w - 14, fr[0] - 4), srx.y], rgba(SIG, 0.85), true, [through]);
      } else {
        const inL = rest(-WX * 1.06, 0, 0.18), outR = rest(WX * 1.2, 0, 0.1);
        Object.assign(txb, { x: pad, y: Math.round(inL[1] - txb.h / 2) });
        const y0 = Math.min(Math.round(outR[1] - prx.h - 6), h - pad - prx.h - srx.h - 12);
        Object.assign(prx, { x: w - pad - rw, y: y0 }); Object.assign(srx, { x: w - pad - rw, y: y0 + prx.h + 12 });
        flow(ctx, [txb.x + txb.w + 2, txb.y + txb.h / 2], [inL[0] - 6, inL[1]], rgba(FG, 0.55), false, dots(3, 0));
        flow(ctx, [outR[0], outR[1]], [prx.x - 4, prx.y + prx.h / 2], rgba(FG, 0.55), false, dots(3, 0.4));
        flow(ctx, [outR[0], outR[1]], [srx.x - 4, srx.y + srx.h / 2], rgba(SIG, 0.85), true, [through]);
      }
      block(ctx, txb.x, txb.y, txb.w, txb.h, txT[0]);
      label(ctx, txT[1], txb.x + 10, txb.y + 31);
      block(ctx, prx.x, prx.y, prx.w, prx.h, "PRIMARY RX");
      if (lay.narrow) { label(ctx, `${count} SYMBOLS`, prx.x + 10, prx.y + 31); label(ctx, "0 ERRORS", prx.x + 10, prx.y + 46); }
      else label(ctx, `${count} SYMBOLS · 0 ERRORS`, prx.x + 10, prx.y + 31);
      block(ctx, srx.x, srx.y, srx.w, srx.h, "SECONDARY RX", true);
      label(ctx, `“${text}”`, srx.x + 10, srx.y + 31, rgba(FG, 0.92));
      label(ctx, "BITS ", srx.x + 10, srx.y + 46);
      ctx.font = `400 9.5px ${MONO}`;
      const bx0 = srx.x + 10 + ctx.measureText("BITS ").width, cw = ctx.measureText("0").width;
      for (let i = 0; i < partial.length; i++) label(ctx, partial[i], bx0 + i * cw, srx.y + 46, i === partial.length - 1 ? rgba(SIGT, 0.95) : rgba(FG, 0.75));
    }
    return {
      resize() { g = setup(cv); fit = null; draw(); },
      tick(dt) {
        dt = Math.min(dt, 0.05); t += dt; acc += dt;
        while (acc >= ROW_S) { acc -= ROW_S; row(); }
        draw();
      },
      // join partway into the message, so the secondary receiver has already read some of it
      enter() { if (!rows.length) { n = 9 * 8 * SYM - (M + 1); for (let i = 0; i < M + 1; i++) row(); } },
      still() { reset(); t = 48; n = 11 * 8 * SYM + 3 * SYM - (M + 1); for (let i = 0; i < M + 1; i++) row(); draw(); },
    };
  }

  // ================= SARLink: a pass seen from orbit =================
  // A radar satellite on a low orbit images a strip of ground beside its track. When the strip
  // sweeps over the station, the station hears the pulses and counts them (87 to 127 per
  // detection in our captures, about 500 µs apart). Lengths are in Earth radii; the orbit is drawn
  // higher than a real one (about 1.1) so it reads.
  function SarPass(cv) {
    const { RO, LOOK, BEAM, PERIOD, SPAN, norm, dot, crs, add, mul, st, e2, n, sub, foot, tauAt } = PASS;
    const PITCH = 0.6, YAW = 0, SWAY = 0.06, DIST = 1.1, TGT = [0, 0.15, 1];
    let g, t, fit, pulses, detections, target, inBeam, rings, beamDots, lastDot;
    function reset() { t = PASS.clock.t; pulses = 0; detections = 0; target = 87 + Math.floor(Math.random() * 41); inBeam = false; rings = []; beamDots = []; lastDot = 0; }
    reset();
    function cam() {
      return camera({ yaw: YAW + SWAY * Math.sin((t / 26) * Math.PI * 2), pitch: PITCH, dist: DIST, target: TGT, ...fit });
    }
    // the top of the pass high in the frame, the station low, both clear of the readouts
    function fitCam(w, h) {
      const u = camera({ yaw: YAW, pitch: PITCH, dist: DIST, target: TGT, f: 1, cx: 0, cy: 0 }).project;
      const a = u(...mul(sub(0), RO))[1], b = u(...st)[1];
      const f = Math.min(w * 0.75, (0.6 * h) / (b - a));
      fit = { f, cx: w * 0.5, cy: h * 0.46 - (f * (a + b)) / 2 };
    }
    // the graticule's pole, tipped away from the station
    const tilt = (p) => { const c = Math.cos(0.9), s = Math.sin(0.9), q = [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]], c2 = Math.cos(0.35), s2 = Math.sin(0.35); return [c2 * q[0] - s2 * q[1], s2 * q[0] + c2 * q[1], q[2]]; };
    function advance(dt) {
      t = PASS.clock.t;
      const tau = tauAt(t), f = foot(tau);
      const was = inBeam;
      inBeam = Math.acos(Math.min(1, dot(f, st))) < BEAM;
      if (inBeam) {
        // the pulses arrive at the radar's rate; the count fills to this detection's total
        const cross = (2 * BEAM) / ((2 * SPAN) / PERIOD) / Math.cos(LOOK);
        pulses = Math.min(target, pulses + (target / cross) * dt);
        if (Math.random() < dt * 9) rings.push({ born: t });
      }
      if (was && !inBeam) { detections++; }
      if (tauAt(t) < tauAt(t - dt)) { pulses = 0; target = 87 + Math.floor(Math.random() * 41); }   // a new pass
      // radar pulses travelling down the beam, drawn at a readable cadence
      if (t - lastDot > 0.16) { lastDot = t; beamDots.push({ born: t }); }
      beamDots = beamDots.filter((d) => t - d.born < 0.5);
      rings = rings.filter((r) => t - r.born < 1.1);
    }
    function draw() {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      if (!fit) fitCam(w, h);
      const { project, pos } = cam();
      const C = pos, CC = dot(C, C);
      const seen = (p) => dot(p, add(C, p, -1)) > 0;                 // on the hemisphere facing the camera
      const facing = (p) => Math.max(0, Math.min(1, dot(p, add(C, p, -1)) / (CC - 1) * 3));
      // behind the globe, for points off its surface (the orbit, the satellite)
      const hidden = (p) => {
        const d = add(p, C, -1), a = dot(d, d), b = 2 * dot(C, d), c = CC - 1, disc = b * b - 4 * a * c;
        if (disc < 0) return false;
        const s1 = (-b - Math.sqrt(disc)) / (2 * a);
        return s1 > 0 && s1 < 1;
      };
      const pad = 18, tau = tauAt(t);
      // the limb
      const c0 = mul(C, 1 / CC), rl = Math.sqrt(1 - 1 / CC), u = norm(crs(C, [0, 0, 1])), v = norm(crs(u, C));
      const limb = []; for (let i = 0; i <= 160; i++) { const a = (i / 160) * Math.PI * 2; limb.push(add(add(c0, u, rl * Math.cos(a)), v, rl * Math.sin(a))); }
      ctx.beginPath(); limb.forEach((p, i) => { const [x, y] = project(...p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
      ctx.fillStyle = `rgb(${PANEL})`; ctx.fill();
      ctx.strokeStyle = rgba(FG, 0.28); ctx.lineWidth = 1; ctx.stroke();
      // graticule, every 10°, thinning toward the limb
      const seg = (pts) => {
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          if (!seen(a) || !seen(b)) continue;
          const k = Math.min(facing(a), facing(b));
          if (k < 0.02) continue;
          ctx.strokeStyle = rgba(FG, 0.1 * k);
          const [x0, y0] = project(...a), [x1, y1] = project(...b);
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
      };
      for (let lat = -80; lat <= 80; lat += 10) { const p = []; const r = Math.cos((lat * Math.PI) / 180), z = Math.sin((lat * Math.PI) / 180); for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; p.push(tilt([r * Math.cos(a), r * Math.sin(a), z])); } seg(p); }
      for (let lon = 0; lon < 180; lon += 10) { const p = []; const a = (lon * Math.PI) / 180; for (let i = 0; i <= 96; i++) { const b = (i / 96) * Math.PI * 2; p.push(tilt([Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)])); } seg(p); }
      // the ground track, dashed on the surface
      ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba(FG, 0.22);
      { const p = []; for (let i = 0; i <= 80; i++) p.push(sub(-SPAN * 1.4 + (i / 80) * SPAN * 2.8)); ctx.beginPath(); let on = false; p.forEach((q) => { if (!seen(q)) { on = false; return; } const [x, y] = project(...q); on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; }); ctx.stroke(); }
      // the orbit, dashed, with the part behind the globe left out
      ctx.strokeStyle = rgba(MUTE, 0.45);
      { ctx.beginPath(); let on = false; for (let i = 0; i <= 240; i++) { const q = mul(sub((i / 240) * Math.PI * 2), RO); if (hidden(q)) { on = false; continue; } const [x, y] = project(...q); on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } ctx.stroke(); }
      ctx.setLineDash([]);
      // the imaged strip so far, and the footprint
      const fp = foot(tau), sat = mul(sub(tau), RO);
      const b1 = norm(add(e2, fp, -dot(e2, fp))), b2 = norm(crs(fp, b1));
      const fpPts = []; for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; fpPts.push(norm(add(add(fp, b1, Math.tan(BEAM) * Math.cos(a)), b2, Math.tan(BEAM) * 1.3 * Math.sin(a)))); }
      {
        const edge = (tt, k) => { const f = foot(tt), c1 = norm(add(e2, f, -dot(e2, f))), c2 = crs(f, c1); return norm(add(f, c2, k * Math.tan(BEAM) * 1.3)); };
        const p = []; for (let i = 0; i <= 50; i++) p.push(edge(-SPAN + (i / 50) * (tau + SPAN), 1));
        for (let i = 50; i >= 0; i--) p.push(edge(-SPAN + (i / 50) * (tau + SPAN), -1));
        ctx.beginPath(); p.forEach((q, i) => { const [x, y] = project(...q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
        ctx.fillStyle = rgba(FG, 0.06); ctx.fill();
      }
      const satVisible = !hidden(sat);
      if (satVisible) {
        // the beam: from the radar to the footprint's outline, as the eye sees it
        const [sx, sy] = project(...sat), ang = (q) => { const [x, y] = project(...q); return Math.atan2(y - sy, x - sx); };
        let lo = fpPts[0], hi = fpPts[0];
        for (const q of fpPts) { if (ang(q) < ang(lo)) lo = q; if (ang(q) > ang(hi)) hi = q; }
        const [ax, ay] = project(...lo), [bx, by] = project(...hi);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ax, ay); ctx.lineTo(bx, by); ctx.closePath();
        ctx.fillStyle = rgba(FG, 0.045); ctx.fill();
        ctx.strokeStyle = rgba(FG, 0.18); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ax, ay); ctx.moveTo(sx, sy); ctx.lineTo(bx, by); ctx.stroke();
        // pulses on their way down
        for (const d of beamDots) {
          const k = (t - d.born) / 0.5, q = add(sat, add(fp, sat, -1), k), [x, y] = project(...q);
          ctx.strokeStyle = rgba(FG, 0.5 * (1 - k)); ctx.beginPath(); ctx.arc(x, y, 2 + 5 * k, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.beginPath(); fpPts.forEach((q, i) => { const [x, y] = project(...q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
      ctx.fillStyle = rgba(FG, 0.06); ctx.fill(); ctx.strokeStyle = rgba(FG, 0.4); ctx.stroke();
      // the station; while the strip is over it, it hears the pulses
      const [qx, qy] = project(...st);
      for (const r of rings) {
        const k = (t - r.born) / 1.1, rr = 4 + k * 26;
        ctx.strokeStyle = rgba(SIG, 0.9 * (1 - k)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(qx, qy, rr, rr * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.lineWidth = 1;
      const top = project(...mul(st, 1.035));
      ctx.strokeStyle = rgba(inBeam ? SIG : FG, 0.95); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(top[0], top[1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(top[0], top[1], 4.5, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke();
      ctx.fillStyle = rgba(inBeam ? SIG : FG, 1); ctx.beginPath(); ctx.arc(qx, qy, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1;
      label(ctx, "SARLink", qx + 12, qy + 16, inBeam ? rgba(SIGT, 0.95) : rgba(FG, 0.85));
      // the satellite: its radar panel along the track, a solar wing across it
      if (satVisible) {
        const [sx, sy] = project(...sat), k = Math.max(0.6, Math.min(1.4, (fit.f / DIST) / 260));
        const pa = project(...add(sat, e2, 0.035)), pb = project(...add(sat, e2, -0.035));
        const wa = project(...add(sat, n, 0.022)), wb = project(...add(sat, n, -0.022));
        ctx.strokeStyle = rgba(FG, 0.95); ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
        ctx.lineWidth = 1.5 * k; ctx.strokeStyle = rgba(MUTE, 0.9); ctx.beginPath(); ctx.moveTo(wa[0], wa[1]); ctx.lineTo(wb[0], wb[1]); ctx.stroke();
        ctx.fillStyle = rgba(FG, 1); ctx.fillRect(sx - 3, sy - 3, 6, 6);
        ctx.lineWidth = 1;
        const right = sx < w - 150;
        label(ctx, "SAR SATELLITE", sx + (right ? 14 : -14), sy - 10, null, right ? "left" : "right");
      }
      // readouts
      const narrow = w < 560;
      label(ctx, narrow ? "NOT TO SCALE" : "SIMULATED PASS · NOT TO SCALE", pad, pad + 4);
      label(ctx, inBeam ? "BEAM ON STATION" : satVisible ? "SATELLITE PASSING" : "WAITING FOR PASS", w - pad, pad + 4, inBeam ? rgba(SIGT, 0.95) : null, "right");
      ctx.font = `400 13px ${MONO}`; ctx.textAlign = "right";
      ctx.fillStyle = rgba(SIGT, pulses > 0 ? 0.95 : 0.4); ctx.fillText(String(Math.round(pulses)), w - pad, h - pad - 14);
      ctx.textAlign = "left";
      label(ctx, "PULSES THIS DETECTION · PRI ≈ 500 µs", w - pad, h - pad + 2, null, "right");
      label(ctx, `${detections} ${detections === 1 ? "DETECTION" : "DETECTIONS"}`, pad, h - pad + (narrow ? -14 : 2));
    }
    return {
      resize() { g = setup(cv); fit = null; draw(); },
      tick(dt) { dt = Math.min(dt, 0.05); PASS.step(dt); advance(dt); draw(); },
      enter() { PASS.start(); t = PASS.clock.t; },
      still() { reset(); PASS.clock.t = PERIOD / 2 - 0.6; for (let i = 0; i < 36; i++) { PASS.clock.t += 1 / 60; advance(1 / 60); } rings = [{ born: t - 0.25 }, { born: t - 0.6 }]; draw(); },
    };
  }

  // ================= SpectralSeal =================
  // SHA-256, small and synchronous, so the demo can run a real one-way hash chain.
  const sha256 = (() => {
    const primes = []; for (let n = 2; primes.length < 64; n++) if (primes.every((q) => n % q)) primes.push(n);
    const frac = (x) => (x - Math.floor(x)) * 4294967296 >>> 0;
    const K = primes.map((q) => frac(Math.cbrt(q))), H0 = primes.slice(0, 8).map((q) => frac(Math.sqrt(q)));
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    return (msg) => {
      const len = msg.length, total = ((len + 9 + 63) >> 6) << 6, m = new Uint8Array(total);
      m.set(msg); m[len] = 0x80;
      const bits = len * 8; m[total - 4] = bits >>> 24; m[total - 3] = bits >>> 16; m[total - 2] = bits >>> 8; m[total - 1] = bits;
      const h = H0.slice(), w = new Uint32Array(64);
      for (let o = 0; o < total; o += 64) {
        for (let i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
        for (let i = 16; i < 64; i++) {
          const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [A, B, C, D, E, F, G, Hh] = h;
        for (let i = 0; i < 64; i++) {
          const t1 = (Hh + (rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25)) + ((E & F) ^ (~E & G)) + K[i] + w[i]) >>> 0;
          const t2 = ((rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22)) + ((A & B) ^ (A & C) ^ (B & C))) >>> 0;
          Hh = G; G = F; F = E; E = (D + t1) >>> 0; D = C; C = B; B = A; A = (t1 + t2) >>> 0;
        }
        h[0] = (h[0] + A) >>> 0; h[1] = (h[1] + B) >>> 0; h[2] = (h[2] + C) >>> 0; h[3] = (h[3] + D) >>> 0;
        h[4] = (h[4] + E) >>> 0; h[5] = (h[5] + F) >>> 0; h[6] = (h[6] + G) >>> 0; h[7] = (h[7] + Hh) >>> 0;
      }
      const out = new Uint8Array(32);
      h.forEach((v, i) => { out[4 * i] = v >>> 24; out[4 * i + 1] = v >>> 16; out[4 * i + 2] = v >>> 8; out[4 * i + 3] = v; });
      return out;
    };
  })();
  const H64 = (v) => sha256(v).slice(0, 8);                 // SHA-256 truncated to 64 bits, as in SpectralSeal
  const hex64 = (v) => [...v].map((x) => x.toString(16).padStart(2, "0")).join("");
  const same = (a, b) => a.every((x, i) => x === b[i]);

  // Each beacon carries the next value back down the access point's one-way hash chain. The
  // phone verifies every beacon as it arrives, on its own: hashed once, a real value gives
  // exactly the value from the beacon before it (the first one hashes onto the published
  // anchor). The phone never needs to know a value in advance, and an impostor without the
  // secret can't make one that adds up.
  function Seal(cv) {
    // One SpectralSeal beacon at a time, as a phone receives it: an 8-tone sync word, then
    // 40 tones carrying a 64-bit value with its CRC-8 and Reed–Solomon parity (8 tones,
    // 50 ms each, 2.5 s in all). The phone decodes the value, hashes it once, and checks
    // that it adds up to the last value it verified.
    const L = 600, SLOTS = 50, SYNC = [2, 6, 0, 4, 7, 1, 5, 3];
    const STREAM = 3.2, TYPE = [3.35, 3.8], HASH = [4.0, 4.7], VERDICT = 5.0, SHIFT = [6.9, 7.5], CYCLE = 7.9;
    // GF(256) for the Reed–Solomon parity: two parity bytes per three data bytes
    const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
    for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
    const rs = (row) => { const r = [0, 0]; for (const d of row) { const f = d ^ r[0]; r[0] = r[1] ^ gmul(f, 3); r[1] = gmul(f, 2); } return r; };
    const crc8 = (bytes) => { let c = 0; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; } return c; };
    function tones(v) {
      const data = [...v, crc8(v)], rows = [0, 1, 2].map((r) => data.slice(r * 3, r * 3 + 3)).map((row) => [...row, ...rs(row)]);
      const air = []; for (let c = 0; c < 5; c++) for (let r = 0; r < 3; r++) air.push(rows[r][c]);   // interleaved column by column
      const bits = []; for (const b of air) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
      const out = SYNC.slice(); for (let i = 0; i < 120; i += 3) out.push((bits[i] << 2) | (bits[i + 1] << 1) | bits[i + 2]);
      return out.map((k) => k + gauss() * 0.07);
    }
    const rand8 = () => Uint8Array.from({ length: 8 }, () => (Math.random() * 256) | 0);
    let g, t, chain, idx, lastOk, cur, n, stats;
    function beacon() {
      if (idx < 1) fresh();
      const v = chain[idx--], f = rand8();
      cur = {
        real: { v, hv: H64(v), sym: tones(v) },
        fake: { v: f, hv: H64(f), sym: tones(f) },
      };
      cur.real.ok = same(cur.real.hv, lastOk); cur.fake.ok = same(cur.fake.hv, lastOk);
      cur.against = lastOk; cur.counted = false; cur.shifted = false; n++;
    }
    function fresh() { chain = [rand8()]; for (let i = 1; i <= L; i++) chain.push(H64(chain[i - 1])); idx = L - 2; lastOk = chain[L - 1]; }
    function reset() { fresh(); t = 0; n = 0; stats = { real: 0, realOk: 0, fake: 0, fakeOk: 0 }; beacon(); }
    reset();
    function advance(dt) {
      t += dt;
      if (!cur.counted && t >= VERDICT) {
        cur.counted = true;
        stats.real++; stats.fake++; if (cur.real.ok) stats.realOk++; if (cur.fake.ok) stats.fakeOk++;
      }
      if (!cur.shifted && t >= SHIFT[0]) { cur.shifted = true; if (cur.real.ok) lastOk = cur.real.v; }
      if (t >= CYCLE) { t -= CYCLE; beacon(); }
    }

    const OKC = () => (INK > 1 ? "26,127,55" : "63,185,80");
    const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
    const grp = (s) => s.slice(0, 4) + " " + s.slice(4, 8) + " " + s.slice(8, 12) + " " + s.slice(12);
    const HEXD = "0123456789abcdef";
    function hexRow(ctx, s, x, y, color, size) {
      // draw a grouped hex string one character at a time; color may be a function of the digit index
      ctx.font = `500 ${size}px ${MONO}`;
      ctx.textAlign = "left";
      const cw = ctx.measureText("0").width;
      let di = 0, xx = x;
      for (const ch of s) {
        if (ch !== " ") { ctx.fillStyle = typeof color === "function" ? color(di) : color; ctx.fillText(ch, xx, y); di++; }
        xx += cw;
      }
      return cw;
    }

    function plot(ctx, lane, x, y, w, h, real, fade) {
      const th = h / 8, sw = w / SLOTS, Y = (k) => y + h - (k + 0.5) * th;
      ctx.strokeStyle = rgba(FG, 0.07); ctx.lineWidth = 1;
      for (let k = 0; k < 8; k++) { ctx.beginPath(); ctx.moveTo(x, Math.round(Y(k)) + 0.5); ctx.lineTo(x + w, Math.round(Y(k)) + 0.5); ctx.stroke(); }
      const shown = Math.min(SLOTS, (t / STREAM) * SLOTS);
      ctx.globalAlpha = fade;
      lane.sym.forEach((k, i) => {
        if (i + 0.4 > shown) return;
        const a = Math.min(1, (shown - i) / 1.4);
        ctx.fillStyle = i < 8 ? rgba(FG, 0.85 * a) : rgba(SIG, a);
        ctx.beginPath(); ctx.roundRect(x + i * sw + 1, Y(k) - 1.6, Math.max(1.5, sw - 2), 3.2, 1.6); ctx.fill();
      });
      if (shown > 48) {   // the gap: back to the carrier's own offset, read as the baseline
        ctx.strokeStyle = rgba(MUTE, 0.6); ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(x + 48 * sw + 1, Y(3.5)); ctx.lineTo(x + Math.min(SLOTS, shown) * sw - 1, Y(3.5)); ctx.stroke(); ctx.setLineDash([]);
      }
      if (t < STREAM) { ctx.fillStyle = rgba(SIG, 0.5); ctx.fillRect(x + shown * sw, y - 3, 1, h + 6); }
      ctx.globalAlpha = 1;
      // what the packet is made of
      const by = y + h + 9;
      const seg = (i0, i1, text) => {
        const xa = x + i0 * sw + 1, xb = x + i1 * sw - 1;
        ctx.strokeStyle = rgba(MUTE, 0.5);
        ctx.beginPath(); ctx.moveTo(xa, by - 3); ctx.lineTo(xa, by); ctx.lineTo(xb, by); ctx.lineTo(xb, by - 3); ctx.stroke();
        if (text) label(ctx, text, (xa + xb) / 2, by + 12, rgba(MUTE, 0.85), "center");
      };
      seg(0, 8, "SYNC");
      seg(8, 48, w < 360 ? "VALUE · CRC · PARITY" : "64-BIT VALUE · CRC · PARITY");
      seg(48, 50, "");
      if (w >= 360) label(ctx, "GAP", x + 49 * sw, by + 12, rgba(MUTE, 0.85), "center");
    }

    function check(ctx, lane, real, x, y, w, narrow) {
      const size = narrow ? 10.5 : 11.5, lh = narrow ? 19 : 22, lw = narrow ? 98 : 112;
      const ok = OKC();
      const typed = Math.round(16 * ease((t - TYPE[0]) / (TYPE[1] - TYPE[0])));
      const after = t >= SHIFT[0], sh = ease((t - SHIFT[0]) / (SHIFT[1] - SHIFT[0]));
      // received
      label(ctx, "RECEIVED", x, y, rgba(MUTE, 0.85));
      if (t >= TYPE[0]) {
        const s = hex64(lane.v);
        const vis = s.slice(0, typed).padEnd(16, " ");
        const yy = real && after ? y + (2 * lh) * sh : y;
        ctx.globalAlpha = real ? 1 : after ? 1 - sh : 1;
        hexRow(ctx, grp(vis), x + lw, yy, rgba(FG, 0.95), size);
        ctx.globalAlpha = 1;
      }
      // hashed once
      label(ctx, "HASHED ONCE", x, y + lh, rgba(MUTE, 0.85));
      const hs = hex64(lane.hv), ag = hex64(cur.against);
      if (t >= HASH[0] && !(after && sh >= 1)) {
        const k = (t - HASH[0]) / (HASH[1] - HASH[0]);
        let s = "";
        for (let i = 0; i < 16; i++) s += k >= 1 || i < k * 16 - 1 ? hs[i] : HEXD[(Math.random() * 16) | 0];
        const judged = t >= VERDICT - 0.3;
        const col = (i) => !judged ? rgba(FG, k >= 1 ? 0.95 : 0.55) : hs[i] === ag[i] ? rgba(ok, 1) : rgba(SIGT, 1);
        ctx.globalAlpha = after ? 1 - sh : 1;
        hexRow(ctx, grp(s), x + lw, y + lh, col, size);
        ctx.globalAlpha = 1;
      }
      // last verified
      label(ctx, "LAST VERIFIED", x, y + 2 * lh, rgba(MUTE, 0.85));
      const judged = t >= VERDICT - 0.3;
      const lcol = (i) => (judged && !after ? (hs[i] === ag[i] ? rgba(ok, 1) : rgba(FG, 0.95)) : rgba(FG, 0.95));
      if (!after) hexRow(ctx, grp(ag), x + lw, y + 2 * lh, lcol, size);
      else {
        // the phone's last verified value moves on: to the beacon it just verified
        ctx.globalAlpha = 1 - sh; hexRow(ctx, grp(ag), x + lw, y + 2 * lh + 6 * sh, rgba(FG, 0.95), size);
        if (!real) { ctx.globalAlpha = sh; hexRow(ctx, grp(hex64(lastOk)), x + lw, y + 2 * lh, rgba(FG, 0.95), size); }
        ctx.globalAlpha = 1;
      }
      // the verdict
      if (t >= VERDICT && !(after && sh >= 1)) {
        const a = ease((t - VERDICT) / 0.35) * (after ? 1 - sh : 1), vy = y + 3 * lh + 8;
        ctx.globalAlpha = a;
        if (lane.ok) {
          ctx.strokeStyle = rgba(ok, 1); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x + 1, vy - 4); ctx.lineTo(x + 4.5, vy - 0.5); ctx.lineTo(x + 11, vy - 8); ctx.stroke(); ctx.lineWidth = 1;
          ctx.font = `600 ${narrow ? 10 : 10.5}px ${MONO}`; ctx.fillStyle = rgba(ok, 1); ctx.fillText(narrow ? "ADDS UP · VERIFIED" : "ADDS UP · VERIFIED", x + 18, vy);
        } else {
          ctx.strokeStyle = rgba(SIGT, 1); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + 2, vy - 8); ctx.lineTo(x + 10, vy); ctx.moveTo(x + 10, vy - 8); ctx.lineTo(x + 2, vy); ctx.stroke(); ctx.lineWidth = 1;
          ctx.font = `600 ${narrow ? 10 : 10.5}px ${MONO}`; ctx.fillStyle = rgba(SIGT, 1); ctx.fillText("DOESN'T ADD UP · REJECTED", x + 18, vy);
        }
        ctx.globalAlpha = 1;
      }
    }

    function draw() {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      const narrow = w < 640 || h > w * 0.75, pad = 18, x0 = pad, x1 = w - pad;
      label(ctx, narrow ? "EACH BEACON CHECKED ON ARRIVAL" : "A PHONE CHECKS EACH BEACON AS IT ARRIVES", x0, pad + 4, rgba(FG, 0.85));
      if (!narrow) label(ctx, `BEACON ${n} · 2.5 S ON THE AIR, SHOWN SLOWER`, x1, pad + 4, null, "right");
      const lanes = [
        { lane: cur.real, real: true, title: narrow ? "REAL ACCESS POINT" : "CAMPUS WI-FI · REAL ACCESS POINT", n: stats.realOk, tot: stats.real },
        { lane: cur.fake, real: false, title: narrow ? "IMPOSTOR" : "CAMPUS WI-FI · IMPOSTOR, SAME NAME AND PASSWORD", n: stats.fakeOk, tot: stats.fake },
      ];
      const top = pad + 26, laneH = (h - top - pad / 2) / 2;
      const fade = t < SHIFT[0] ? 1 : 1 - ease((t - SHIFT[0]) / (SHIFT[1] - SHIFT[0]));
      lanes.forEach((r, i) => {
        const y = top + i * laneH;
        if (i) { ctx.strokeStyle = rgba(FG, 0.07); ctx.beginPath(); ctx.moveTo(x0, Math.round(y - 10) + 0.5); ctx.lineTo(x1, Math.round(y - 10) + 0.5); ctx.stroke(); }
        label(ctx, r.title, x0, y + 8, rgba(FG, 0.8));
        label(ctx, `${r.n} / ${r.tot} VERIFIED`, x1, y + 8, r.real ? rgba(FG, 0.9) : rgba(MUTE, 0.9), "right");
        if (narrow) {
          const ph = Math.min(84, laneH * 0.36);
          plot(ctx, r.lane, x0, y + 20, x1 - x0, ph, r.real, fade);
          check(ctx, r.lane, r.real, x0, y + 20 + ph + 44, x1 - x0, true);
        } else {
          const pw = (x1 - x0) * 0.56, ph = Math.min(104, laneH - 62);
          plot(ctx, r.lane, x0, y + 22, pw, ph, r.real, fade);
          check(ctx, r.lane, r.real, x0 + pw + 40, y + 40, x1 - x0 - pw - 40, false);
        }
      });
    }
    return {
      resize() { g = setup(cv); draw(); },
      tick(dt) { advance(Math.min(dt, 0.05)); draw(); },
      enter() { if (stats.real === 0 && t < 0.2) t = 0; },
      still() { reset(); t = VERDICT + 0.8; cur.counted = true; stats = { real: 1, realOk: 1, fake: 1, fakeOk: 0 }; draw(); },
    };
  }


  // ================= Underwater: one band, both directions =================
  // The two-node scene and the hydrophone panel under it share this clock and these symbols.
  const UW = (() => {
    const M = 32, TSYM = 0.9;
    const hash = (k, salt) => { let x = Math.imul(k ^ salt, 0x9e3779b1); x ^= x >>> 15; x = Math.imul(x, 0x85ebca77); x ^= x >>> 13; return (x >>> 0) % M; };
    const sym = (k) => ({ k, t0: k * TSYM, up: hash(k, 0x51ed27), down: hash(k, 0x2c1b3f) });
    return { M, TSYM, sym, clock: sharedClock(5), STILL: 6.2 };
  })();

  // Node A sends up-chirps while node B sends down-chirps, in the same band at the same
  // time. Each wave's crests leave at the chirp's instantaneous frequency, so they bunch up as it
  // rises and jump where the cyclic shift wraps it round: the jump is the symbol. Node B's
  // waves reach A just as the hydrophone panel below starts that symbol.
  function UWNodes(cv) {
    const { M, TSYM, sym } = UW;
    const A = [-3.2, 0.4, 1.5], B = [3.2, 2.4, 2.0];   // x across, y into the view, z above the seabed
    const SURF = 4.3, D = 2 * TSYM;                      // the surface; travel time between the nodes
    const LEN = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]), C = LEN / D;
    const FLO = 9, FHI = 21;                             // crests a second at the band's bottom and top
    const PITCH = 0.16, YAW = 0, SWAY = 0.05, DIST = 12, TGT = [0, 1.5, 2.1];
    const BOX = { x: [-5.6, 5.6], y: [-0.6, 4.6] };
    // emission times of one chirp's crests within its symbol: where its phase completes a cycle
    const cache = new Map();
    function crests(q, slope) {
      const key = q * 2 + (slope > 0 ? 1 : 0);
      if (cache.has(key)) return cache.get(key);
      const out = [], N = 600;
      let ph = 0, next = 1;
      for (let i = 0; i < N; i++) {
        let f = (q / M + (slope * (i + 0.5)) / N) % 1; if (f < 0) f += 1;
        ph += ((FLO + (FHI - FLO) * f) * TSYM) / N;
        while (ph >= next) { out.push(((i + 1) / N) * TSYM); next++; }
      }
      cache.set(key, out);
      return out;
    }
    const snow = Array.from({ length: 70 }, () => [BOX.x[0] + Math.random() * (BOX.x[1] - BOX.x[0]), BOX.y[0] + Math.random() * (BOX.y[1] - BOX.y[0]), Math.random() * SURF, Math.random()]);
    let g, t, fit;
    function fitCam(w, h) {
      const top = 34, bottom = 34, pad = 16, xs = w < 560 ? [-4.1, 4.1] : BOX.x;   // phones: frame just the nodes
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (const yaw of [YAW - SWAY, YAW + SWAY]) {
        const { project } = camera({ yaw, pitch: PITCH, dist: DIST, target: TGT, f: 1, cx: 0, cy: 0 });
        for (const x of xs) for (const y of BOX.y) for (const z of [0, SURF]) {
          const [u, v] = project(x, y, z); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
        }
      }
      const f = Math.min((w - 2 * pad) / (u1 - u0), (h - top - bottom) / (v1 - v0));
      fit = { f, cx: w / 2 - (f * (u0 + u1)) / 2, cy: top + (h - top - bottom) / 2 - (f * (v0 + v1)) / 2 };
    }
    function draw() {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      if (!fit) fitCam(w, h);
      const { project } = camera({ yaw: YAW + SWAY * Math.sin((t / 28) * Math.PI * 2), pitch: PITCH, dist: DIST, target: TGT, ...fit });
      const pad = 18, narrow = w < 560;
      const fog = (d) => 1 - 0.6 * Math.min(1, Math.max(0, (d - (DIST - 3)) / 7));
      // the seabed, a metre grid fading into the distance, and the surface moving above
      for (let x = Math.ceil(BOX.x[0]); x <= BOX.x[1]; x++) { const d = project(x, (BOX.y[0] + BOX.y[1]) / 2, 0)[2]; ctx.strokeStyle = rgba(FG, 0.08 * fog(d)); path3(ctx, project, [[x, BOX.y[0], 0], [x, BOX.y[1], 0]]); ctx.stroke(); }
      for (let y = Math.ceil(BOX.y[0]); y <= BOX.y[1]; y++) { const d = project(0, y, 0)[2]; ctx.strokeStyle = rgba(FG, 0.08 * fog(d)); path3(ctx, project, [[BOX.x[0], y, 0], [BOX.x[1], y, 0]]); ctx.stroke(); }
      for (let y = BOX.y[0]; y <= BOX.y[1] + 0.01; y += (BOX.y[1] - BOX.y[0]) / 4) {
        const pts = []; for (let i = 0; i <= 60; i++) { const x = BOX.x[0] + (i / 60) * (BOX.x[1] - BOX.x[0]); pts.push([x, y, SURF + 0.06 * Math.sin(x * 1.3 + y * 0.7 + t * 1.1)]); }
        ctx.strokeStyle = rgba(FG, 0.12 * fog(project(0, y, SURF)[2])); path3(ctx, project, pts); ctx.stroke();
      }
      // drifting particles, for depth
      for (const p of snow) {
        const z = (((p[2] - t * 0.05 * (0.5 + p[3])) % SURF) + SURF) % SURF, [x, y, d] = project(p[0], p[1], z);
        ctx.fillStyle = rgba(FG, 0.22 * fog(d)); ctx.fillRect(x, y, 1.2, 1.2);
      }
      // the moorings and the two nodes
      const PA = project(...A), PB = project(...B);
      for (const [N, P] of [[A, PA], [B, PB]]) {
        const [ax, ay, ad] = project(N[0], N[1], 0);
        ctx.strokeStyle = rgba(FG, 0.3 * fog(ad)); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(P[0], P[1]); ctx.stroke(); ctx.setLineDash([]);
        const s = fit.f / ad;
        ctx.fillStyle = rgba(FG, 0.4 * fog(ad)); ctx.fillRect(ax - 0.22 * s, ay - 0.1 * s, 0.44 * s, 0.1 * s);
      }
      // the waves: each symbol's crests, out from the node that sent it, toward the other
      const toB = Math.atan2(PB[1] - PA[1], PB[0] - PA[0]);
      const wave = (P, dir, t0s, slope, value, color, lw) => {
        const k = P[2], ang = dir, spread = 0.4;
        for (const t0 of t0s) {
          const q = sym(Math.round((t0.base) / TSYM));
          const list = crests(value(q), slope);
          for (let i = 0; i < list.length; i++) {
            const r = C * (t - t0.at - list[i]);
            if (r <= 0.05 || r > LEN * 1.06) continue;
            const R = (r * fit.f) / k, a = Math.min(1, (LEN * 1.06 - r) / (LEN * 0.12)) * (0.45 + 0.55 * Math.pow(1 - r / (LEN * 1.06), 0.5)) * (0.6 + 0.4 * fog(k));
            const lead = i === 0 ? 1.6 : 1;
            for (let s = -2; s <= 2; s++) {
              const a0 = ang + (s - 0.5) * (spread / 5), a1 = a0 + spread / 5, wgt = [0.12, 0.5, 1, 0.5, 0.12][s + 2];
              ctx.strokeStyle = rgba(color, a * wgt); ctx.lineWidth = lw * lead;
              ctx.beginPath(); ctx.arc(P[0], P[1], R, a0, a1); ctx.stroke();
            }
          }
        }
        ctx.lineWidth = 1;
      };
      const kNow = Math.floor(t / TSYM), aSyms = [], bSyms = [];
      for (let k = kNow - 3; k <= kNow; k++) aSyms.push({ base: k * TSYM, at: k * TSYM });          // A sends symbol k at k·TSYM
      for (let k = kNow - 1; k <= kNow + 2; k++) bSyms.push({ base: k * TSYM, at: k * TSYM - D });  // so B's symbol k reaches A at k·TSYM
      wave(PA, toB, aSyms, 1, (q) => q.up, MUTE, 1.6);
      wave(PB, toB + Math.PI, bSyms, -1, (q) => q.down, SIG, 1.5);
      // the pods, drawn over the waves; a ring while each one is hearing the other
      for (const [P, name, col] of [[PA, "A", FG], [PB, "B", SIG]]) {
        const s = fit.f / P[2], rw = 0.2 * s, rh = 0.5 * s;
        ctx.fillStyle = `rgb(${PANEL})`; ctx.strokeStyle = rgba(FG, 0.85 * fog(P[2])); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.roundRect(P[0] - rw, P[1] - rh / 2, rw * 2, rh, rw); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
        ctx.fillStyle = rgba(col, 0.95); ctx.beginPath(); ctx.arc(P[0], P[1], Math.max(2, rw * 0.45), 0, Math.PI * 2); ctx.fill();
      }
      const ph = ((t % TSYM) / TSYM);
      for (const [P, col] of [[PA, SIG], [PB, FG]]) {
        const s = fit.f / P[2], rr = 0.35 * s + ph * 0.5 * s;
        ctx.strokeStyle = rgba(col, 0.5 * (1 - ph)); ctx.beginPath(); ctx.arc(P[0], P[1], rr, 0, Math.PI * 2); ctx.stroke();
      }
      // what each node is sending and hearing right now
      const two = (v) => String(v).padStart(2, "0");
      const aSend = sym(kNow).up, aHear = sym(kNow).down, bSend = sym(Math.floor((t + D) / TSYM)).down, bHear = sym(Math.floor((t - D) / TSYM)).up;
      const sA = fit.f / PA[2], sB = fit.f / PB[2];
      label(ctx, narrow ? "NODE A" : "NODE A · UP-CHIRPS", PA[0] - 0.2 * sA, PA[1] + 0.25 * sA + 18, rgba(FG, 0.9));
      label(ctx, `SENDS ${two(aSend)} · HEARS `, PA[0] - 0.2 * sA, PA[1] + 0.25 * sA + 31);
      ctx.font = `400 9.5px ${MONO}`; const wA = ctx.measureText(`SENDS ${two(aSend)} · HEARS `).width;
      label(ctx, two(aHear), PA[0] - 0.2 * sA + wA, PA[1] + 0.25 * sA + 31, rgba(SIGT, 0.95));
      label(ctx, narrow ? "NODE B" : "NODE B · DOWN-CHIRPS", PB[0] + 0.2 * sB, PB[1] - 0.25 * sB - 22, rgba(SIGT, 0.95), "right");
      label(ctx, `SENDS ${two(bSend)} · HEARS ${two(bHear)}`, PB[0] + 0.2 * sB, PB[1] - 0.25 * sB - 9, null, "right");
      label(ctx, narrow ? "ONE BAND · BOTH AT ONCE" : "20–30 kHz · ONE BAND · BOTH DIRECTIONS AT ONCE", pad, pad + 4);
      if (!narrow) label(ctx, "SIMULATED · SLOWED", w - pad, pad + 4, null, "right");
    }
    return {
      resize() { g = setup(cv); fit = null; t = UW.clock.t; draw(); },
      tick(dt) { dt = Math.min(dt, 0.05); UW.clock.step(dt); t = UW.clock.t; draw(); },
      enter() { UW.clock.start(); t = UW.clock.t; },
      still() { UW.clock.t = UW.STILL; t = UW.STILL; draw(); },
    };
  }

  // ================= Underwater: orthogonal chirps =================
  function Chirp(cv) {
    const { M, TSYM, sym } = UW, SPAN = 4.5;
    let g, t, syms, cur, bars;
    // the symbols in view, from the shared clock: node B's down-chirp for symbol k reaches
    // this node at k·TSYM, alongside this node's own up-chirp
    function sync() {
      t = UW.clock.t;
      const k = Math.floor(t / TSYM);
      cur = sym(k); syms = [];
      for (let j = Math.floor((t - SPAN) / TSYM) - 1; j < k; j++) syms.push(sym(j));
    }
    function reset() { bars = new Float32Array(M); sync(); }
    reset();
    function advance(dt) {
      sync();
      // the FFT of the dechirped symbol builds up as the symbol is integrated
      const k = Math.min(1, (t - cur.t0) / TSYM);
      for (let b = 0; b < M; b++) {
        const spread = 0.16 + Math.abs(gauss()) * 0.05;          // own up-chirp after a down-chirp dechirp
        const goal = spread + (b === cur.down ? 0.82 * k : 0) + Math.abs(gauss()) * 0.02;
        bars[b] += (goal - bars[b]) * Math.min(1, dt * 12);
      }
    }
    function drawChirp(ctx, X, Y, q, slope, end) {
      // one cyclically shifted chirp: frequency wraps from the top of the band to the bottom
      const steps = 40;
      let prev = null;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const tau = (i / steps) * end;
        let f = (q / M + slope * tau / TSYM) % 1; if (f < 0) f += 1;
        const pt = [X(tau), Y(f)];
        if (prev && Math.abs(pt[1] - prev[1]) > 20) ctx.moveTo(pt[0], pt[1]); else if (prev) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]);
        prev = pt;
      }
      ctx.stroke();
    }
    function draw() {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      const pad = 18, x0 = pad + 34, x1 = w - pad;
      const sh = (h - pad * 2 - 84) * 0.56, bh = (h - pad * 2 - 84) * 0.44;
      const sy = pad + 18, by = sy + sh + 46;
      label(ctx, "HYDROPHONE · 20–30 kHz", pad, pad + 4);
      label(ctx, "NODE A ↑   NODE B ↓", x1, pad + 4, null, "right");
      frameBox(ctx, x0, sy, x1 - x0, sh);
      label(ctx, "30", pad, sy + 10); label(ctx, "20", pad, sy + sh - 2);
      const tStart = t - SPAN;
      const Xt = (tt) => x0 + ((tt - tStart) / SPAN) * (x1 - x0);
      ctx.save(); ctx.beginPath(); ctx.rect(x0 + 1, sy + 1, x1 - x0 - 2, sh - 2); ctx.clip();
      for (const q of syms.concat(cur)) {
        const end = Math.min(TSYM, t - q.t0);
        if (end <= 0) continue;
        const X = (tau) => Xt(q.t0 + tau), Y = (f) => sy + sh - 6 - f * (sh - 12);
        ctx.strokeStyle = rgba(MUTE, 0.55); ctx.lineWidth = 4;   // own transmission: loud
        drawChirp(ctx, X, Y, q.up, 1, end);
        ctx.strokeStyle = rgba(SIG, 0.95); ctx.lineWidth = 1.4;   // node B: quiet
        drawChirp(ctx, X, Y, q.down, -1, end);
        ctx.strokeStyle = rgba(FG, 0.06); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Xt(q.t0), sy); ctx.lineTo(Xt(q.t0), sy + sh); ctx.stroke();
      }
      ctx.restore();
      label(ctx, "DECHIRPED WITH THE DOWN-CHIRP REFERENCE · FFT", pad, by - 8);
      frameBox(ctx, x0, by, x1 - x0, bh);
      const bw = (x1 - x0 - 8) / M;
      for (let b = 0; b < M; b++) {
        const v = Math.min(1, bars[b]);
        const hh = v * (bh - 10);
        ctx.fillStyle = b === cur.down ? rgba(SIG, 0.95) : rgba(MUTE, 0.45);
        ctx.fillRect(x0 + 4 + b * bw + 1, by + bh - 4 - hh, Math.max(1, bw - 2), hh);
      }
      const narrow = w < 560, last = syms.slice(narrow ? -5 : -8).map((q) => String(q.down).padStart(2, "0")).join(" ");
      label(ctx, `NODE B SYMBOLS ${last}`, pad, h - pad + 2);
      if (!narrow) label(ctx, "NODE A SPREAD ACROSS ALL BINS", x1, h - pad + 2, null, "right");
    }
    return {
      resize() { g = setup(cv); draw(); },
      tick(dt) { dt = Math.min(dt, 0.05); UW.clock.step(dt); advance(dt); draw(); },
      enter() { UW.clock.start(); sync(); },
      still() { reset(); UW.clock.t = UW.STILL - 0.5; for (let i = 0; i < 30; i++) { UW.clock.t += 1 / 60; advance(1 / 60); } draw(); },
    };
  }

  // ================= NICU: weighted multilateration =================
  function Loc(cv) {
    const RW = 12, RH = 8.5;
    // anchors along both long walls; staff stop at sinks and bedsides between them
    const anchors = [{ x: 1.6, y: 1.0 }, { x: 6.0, y: 2.4 }, { x: 10.4, y: 1.0 }, { x: 11.4, y: 4.25 }, { x: 10.4, y: 7.5 }, { x: 6.0, y: 6.1 }, { x: 1.6, y: 7.5 }, { x: 0.6, y: 4.25 }];
    const stops = [{ x: 3.8, y: 1.7 }, { x: 8.2, y: 1.7 }, { x: 9.9, y: 4.25 }, { x: 8.2, y: 6.8 }, { x: 3.8, y: 6.8 }, { x: 2.1, y: 4.25 }];
    let g, t, tag, goal, pause, sm, bias, est, trailW, trailU, errW, errU, acc, primed;
    let heading = 0, stride = 0, gait = 0;          // the wearer's facing, walk phase, and how much they are walking
    function reset() {
      t = 0; tag = { ...stops[0] }; goal = stops[1]; pause = 0; heading = 0; stride = 0; gait = 0; sm = null; bias = anchors.map(() => 0);
      est = { w: { x: 6, y: 4 }, u: { x: 6, y: 4 } }; trailW = []; trailU = []; errW = []; errU = []; acc = 0; primed = false;
    }
    reset();
    const weight = (d) => (d <= 2.5 ? 1 : d <= 5 ? 0.1 : d <= 7 ? 0.01 : 0);
    // Gauss–Newton, started from the previous fix (a tracker), or the anchors' centroid at first
    function solve(d, wts, from) {
      let x = from ? from.x : anchors.reduce((a, b) => a + b.x, 0) / anchors.length;
      let y = from ? from.y : anchors.reduce((a, b) => a + b.y, 0) / anchors.length;
      for (let it = 0; it < 15; it++) {
        let A11 = 1e-4, A12 = 0, A22 = 1e-4, b1 = 0, b2 = 0;
        anchors.forEach((a, i) => {
          const dx = x - a.x, dy = y - a.y, r = Math.hypot(dx, dy) || 1e-6, res = r - d[i];
          const jx = dx / r, jy = dy / r, wi = wts[i];
          A11 += wi * jx * jx; A12 += wi * jx * jy; A22 += wi * jy * jy; b1 += wi * jx * res; b2 += wi * jy * res;
        });
        const det = A11 * A22 - A12 * A12;
        x -= (A22 * b1 - A12 * b2) / det; y -= (A11 * b2 - A12 * b1) / det;
        x = Math.min(RW - 0.3, Math.max(0.3, x)); y = Math.min(RH - 0.3, Math.max(0.3, y));
      }
      return { x, y };
    }
    function advance(dt) {
      t += dt;
      // the badge walks between beds and the sink, pausing at each
      const walking = pause <= 0;
      if (pause > 0) pause -= dt;
      else {
        const dx = goal.x - tag.x, dy = goal.y - tag.y, dd = Math.hypot(dx, dy), v = 0.9 * dt;
        if (dd < v) { tag = { ...goal }; pause = 0.8 + Math.random() * 1.6; goal = stops[(stops.indexOf(goal) + 1) % stops.length]; }
        else { tag.x += (dx / dd) * v; tag.y += (dy / dd) * v; }
        // turn toward the way they're going, and step: one full stride per 1.3 m
        let dh = Math.atan2(dy, dx) - heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        heading += dh * Math.min(1, dt * 7);
        stride += (Math.min(v, dd) / 1.3) * Math.PI * 2;
      }
      gait += ((walking ? 1 : 0) - gait) * Math.min(1, dt * 5);
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      // ranges from signal strength: close anchors read cleanly; far ones are noisy and read
      // long, because bodies and equipment in the way weaken the signal (non-line-of-sight)
      const meas = anchors.map((a, i) => {
        const d = Math.hypot(tag.x - a.x, tag.y - a.y), far = Math.max(0, d - 2.5);
        if (Math.random() < 0.02) bias[i] = 0.15 + Math.random() * 0.45;
        bias[i] *= 0.97;
        const nlos = d < 4 ? 0.05 * far : 0.075 + 0.16 * (d - 4) + bias[i];
        return d * Math.exp((0.02 + 0.03 * far) * gauss()) * (1 + nlos);
      });
      sm = sm ? sm.map((v, i) => 0.45 * meas[i] + 0.55 * v) : meas;
      const wts = sm.map((d) => Math.max(weight(d), 1e-3));
      est.w = solve(sm, wts, primed ? est.w : null);
      est.u = solve(sm, anchors.map(() => 1), primed ? est.u : null);
      primed = true;
      trailW.push({ ...est.w }); trailU.push({ ...est.u });
      if (trailW.length > 24) { trailW.shift(); trailU.shift(); }
      errW.push(Math.hypot(est.w.x - tag.x, est.w.y - tag.y)); errU.push(Math.hypot(est.u.x - tag.x, est.u.y - tag.y));
      if (errW.length > 200) { errW.shift(); errU.shift(); }
    }
    // the room in depth: floor grid, the two far walls, equipment standing in the way, anchors up
    // near the ceiling with their spot on the floor, and every range and fix drawn on the floor
    const WALL = 2.6, ANCH_Z = 2.3, PITCH = 0.52, YAW = 0.42, SWAY = 0.06, DIST = 30, TGT = [RW / 2, RH / 2, 0.7];
    const kit = [
      { x: 3.8, y: 0.5, w: 1.1, d: 0.62, h: 0.95 }, { x: 8.2, y: 0.5, w: 1.1, d: 0.62, h: 0.95 },
      { x: 3.8, y: 8.0, w: 1.1, d: 0.62, h: 0.95 }, { x: 8.2, y: 8.0, w: 1.1, d: 0.62, h: 0.95 },
      { x: 0.32, y: 3.2, w: 0.5, d: 0.9, h: 0.9 },
    ];
    let fit = null;
    function fitCam(w, h) {
      const top = 36, bottom = 34, pad = 14;
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (const yaw of [YAW - SWAY, YAW, YAW + SWAY]) {
        const { project } = camera({ yaw, pitch: PITCH, dist: DIST, target: TGT, f: 1, cx: 0, cy: 0 });
        // the floor, and the two far walls (the near ones are cut away)
        for (const x of [0, RW]) for (const y of [0, RH]) for (const z of [0, WALL]) {
          if (z && x === RW && y === 0) continue;
          const [u, v] = project(x, y, z); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
        }
      }
      const f = Math.min((w - 2 * pad) / (u1 - u0), (h - top - bottom) / (v1 - v0));
      fit = { f, cx: w / 2 - (f * (u0 + u1)) / 2, cy: top + (h - top - bottom) / 2 - (f * (v0 + v1)) / 2 };
    }
    function draw() {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      if (!fit) fitCam(w, h);
      const pad = 18;
      const { project, pos } = camera({ yaw: YAW + SWAY * Math.sin((t / 24) * Math.PI * 2), pitch: PITCH, dist: DIST, target: TGT, ...fit });
      const near = DIST - 9, far = DIST + 9;
      const fog = (d) => 1 - 0.55 * Math.min(1, Math.max(0, (d - near) / (far - near)));
      const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
      const ring = (cx, cy, r, z = 0, n = 48) => { const pts = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]); } return pts; };
      if (w >= 560) label(ctx, "ROOM 8.5 × 12 m · 8 ANCHORS", pad, pad + 4);
      label(ctx, `MEAN ERROR · WEIGHTED ${mean(errW).toFixed(1)} m · EQUAL ${mean(errU).toFixed(1)} m`, w - pad, pad + 4, rgba(FG, 0.9), "right");

      // floor grid, a metre apart, thinning with distance
      ctx.lineWidth = 1;
      for (let x = 1; x < RW; x++) { const [, , d] = project(x, RH / 2, 0); ctx.strokeStyle = rgba(FG, 0.06 * fog(d)); path3(ctx, project, [[x, 0, 0], [x, RH, 0]]); ctx.stroke(); }
      for (let y = 1; y < RH; y++) { const [, , d] = project(RW / 2, y, 0); ctx.strokeStyle = rgba(FG, 0.06 * fog(d)); path3(ctx, project, [[0, y, 0], [RW, y, 0]]); ctx.stroke(); }
      // the far walls, cut away at the front so the room reads like a section
      for (const wall of [[[0, RH, 0], [RW, RH, 0], [RW, RH, WALL], [0, RH, WALL]], [[0, 0, 0], [0, RH, 0], [0, RH, WALL], [0, 0, WALL]]]) {
        path3(ctx, project, wall); ctx.closePath(); ctx.fillStyle = rgba(FG, 0.025); ctx.fill();
        ctx.strokeStyle = rgba(FG, 0.14); path3(ctx, project, [wall[0], wall[3], wall[2], wall[1]]); ctx.stroke();
      }
      ctx.strokeStyle = rgba(FG, 0.26); path3(ctx, project, [[0, 0, 0], [RW, 0, 0], [RW, RH, 0], [0, RH, 0]]); ctx.closePath(); ctx.stroke();

      // ranges read from signal strength, on the floor: solid where the anchor is trusted
      ctx.save(); path3(ctx, project, [[0, 0, 0], [RW, 0, 0], [RW, RH, 0], [0, RH, 0]]); ctx.closePath(); ctx.clip();
      if (sm) anchors.forEach((a, i) => {
        const wt = weight(sm[i]);
        ctx.strokeStyle = rgba(FG, wt >= 1 ? 0.38 : wt >= 0.1 ? 0.17 : 0.075);
        ctx.setLineDash(wt >= 1 ? [] : [3, 4]);
        path3(ctx, project, ring(a.x, a.y, sm[i], 0, 72)); ctx.stroke();
      });
      ctx.setLineDash([]);
      // recent fixes as fading dots on the floor: each method's spread at a glance
      const dots = (tr, c, filled) => tr.forEach((p, i) => {
        const [x, y] = project(p.x, p.y, 0), a = ((i + 1) / tr.length) * 0.5;
        ctx.beginPath(); ctx.ellipse(x, y, 2.4, 1.6, 0, 0, Math.PI * 2);
        if (filled) { ctx.fillStyle = rgba(c, a.toFixed(3)); ctx.fill(); } else { ctx.strokeStyle = rgba(c, a.toFixed(3)); ctx.lineWidth = 1; ctx.stroke(); }
      });
      dots(trailU, MUTE, false); dots(trailW, FG, true);
      ctx.restore();

      // standing things, far ones first: equipment, anchors on their drop lines, the badge's wearer
      const things = [];
      for (const b of kit) things.push({ d: project(b.x, b.y, b.h / 2)[2], draw: () => box(b) });
      anchors.forEach((a, i) => things.push({ d: project(a.x, a.y, ANCH_Z)[2], draw: () => anchor(a, i) }));
      things.push({ d: project(tag.x, tag.y, 0.9)[2], draw: person });
      things.sort((p, q) => q.d - p.d).forEach((o) => o.draw());

      function box(b) {
        const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y0 = b.y - b.d / 2, y1 = b.y + b.d / 2;
        const foot = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        // the corner farthest from the camera hides its upright and both floor edges
        let hid = 0, best = -1e9;
        foot.forEach(([x, y], i) => { const dd = Math.hypot(x - pos[0], y - pos[1]); if (dd > best) { best = dd; hid = i; } });
        const P = foot.map(([x, y]) => [project(x, y, 0), project(x, y, b.h)]);
        const hull = [0, 1, 2, 3].flatMap((i) => [P[i][0], P[i][1]]);
        hull.sort((p, q) => p[0] - q[0]);
        const cross = (o, a2, b2) => (a2[0] - o[0]) * (b2[1] - o[1]) - (a2[1] - o[1]) * (b2[0] - o[0]);
        const lo = [], hi = [];
        for (const p2 of hull) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p2) <= 0) lo.pop(); lo.push(p2); }
        for (const p2 of hull.slice().reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], p2) <= 0) hi.pop(); hi.push(p2); }
        const shape = lo.slice(0, -1).concat(hi.slice(0, -1));
        ctx.beginPath(); shape.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.fillStyle = `rgb(${PANEL})`; ctx.fill();
        const fg = fog(project(b.x, b.y, 0)[2]);
        ctx.strokeStyle = rgba(FG, 0.34 * fg); ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          ctx.moveTo(P[i][1][0], P[i][1][1]); ctx.lineTo(P[j][1][0], P[j][1][1]);                       // top
          if (i !== hid) { ctx.moveTo(P[i][0][0], P[i][0][1]); ctx.lineTo(P[i][1][0], P[i][1][1]); }   // uprights
          if (i !== hid && j !== hid) { ctx.moveTo(P[i][0][0], P[i][0][1]); ctx.lineTo(P[j][0][0], P[j][0][1]); } // floor edges
        }
        ctx.stroke();
      }
      function anchor(a, i) {
        const fg = fog(project(a.x, a.y, ANCH_Z)[2]);
        ctx.strokeStyle = rgba(FG, 0.2 * fg); ctx.setLineDash([2, 3]);
        path3(ctx, project, [[a.x, a.y, 0], [a.x, a.y, ANCH_Z]]); ctx.stroke(); ctx.setLineDash([]);
        const [fx, fy] = project(a.x, a.y, 0);
        ctx.fillStyle = rgba(FG, 0.45 * fg); ctx.beginPath(); ctx.ellipse(fx, fy, 2.2, 1.4, 0, 0, Math.PI * 2); ctx.fill();
        const [x, y, dd] = project(a.x, a.y, ANCH_Z), s = Math.max(4, (fit.f * 0.24) / dd);   // a 24 cm box
        ctx.fillStyle = rgba(FG, 0.92 * fg); ctx.fillRect(x - s / 2, y - s / 2, s, s);
        label(ctx, "A" + (i + 1), x + s / 2 + 4, y - 3, rgba(MUTE, 0.8 * fg));
      }
      function person() {
        // the badge's wearer, walking: jointed legs and arms swinging in opposition, the far side
        // drawn first and fainter, a shadow underfoot and the badge (orange) on the chest
        const [bx, by] = project(tag.x, tag.y, 0);
        ctx.fillStyle = rgba(FG, 0.07); ctx.beginPath(); ctx.ellipse(bx, by, (fit.f * 0.3) / project(tag.x, tag.y, 0)[2], (fit.f * 0.13) / project(tag.x, tag.y, 0)[2], 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(FG, 0.85); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(bx - 7, by); ctx.lineTo(bx + 7, by); ctx.moveTo(bx, by - 4.5); ctx.lineTo(bx, by + 4.5); ctx.stroke();
        const F = [Math.cos(heading), Math.sin(heading)], S = [-F[1], F[0]];
        const at = (o, fw, sd, z) => [o[0] + F[0] * fw + S[0] * sd, o[1] + F[1] * fw + S[1] * sd, z];
        const base = [tag.x, tag.y], hipZ = 0.92 + 0.025 * gait * Math.cos(2 * stride);
        const P3 = (q) => project(q[0], q[1], q[2]);
        const limbs = [];
        for (const side of [1, -1]) {
          const ph = stride + (side > 0 ? 0 : Math.PI);
          const a = 0.42 * gait * Math.sin(ph), k = 0.08 + 0.6 * gait * Math.max(0, Math.cos(ph));
          const hip = at(base, 0, 0.1 * side, hipZ);
          const knee = at(base, 0.45 * Math.sin(a), 0.1 * side, hipZ - 0.45 * Math.cos(a));
          const ank = at(base, 0.45 * Math.sin(a) + 0.45 * Math.sin(a - k), 0.1 * side, Math.max(0.06, hipZ - 0.45 * Math.cos(a) - 0.45 * Math.cos(a - k)));
          const toe = at([ank[0], ank[1]], 0.13, 0, Math.max(0.02, ank[2] - 0.05));
          const sh = -0.36 * gait * Math.sin(ph), el = 0.22 + 0.25 * gait * Math.max(0, -Math.sin(ph));
          const shoulder = at(base, 0, 0.19 * side, hipZ + 0.5);
          const elbow = at(base, 0.29 * Math.sin(sh), 0.21 * side, hipZ + 0.5 - 0.29 * Math.cos(sh));
          const hand = at(base, 0.29 * Math.sin(sh) + 0.27 * Math.sin(sh + el), 0.22 * side, hipZ + 0.5 - 0.29 * Math.cos(sh) - 0.27 * Math.cos(sh + el));
          const d = P3(hip)[2];
          limbs.push({ d, pts: [hip, knee, ank, toe], w: 0.12 }, { d: d - 0.001, pts: [shoulder, elbow, hand], w: 0.085 });
        }
        const near = Math.min(...limbs.map((l) => l.d));
        const stroke = (pts, wm, alpha) => {
          const q = pts.map(P3), lw = Math.max(1.5, (fit.f * wm) / q[0][2]);
          ctx.strokeStyle = rgba(FG, alpha); ctx.lineWidth = lw; ctx.beginPath();
          q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        };
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        limbs.filter((l) => l.d > near + 0.01).forEach((l) => stroke(l.pts, l.w, 0.45));
        const pelvis = at(base, 0, 0, hipZ), chest = at(base, 0.02, 0, hipZ + 0.48);
        stroke([pelvis, chest], 0.3, 0.85);
        limbs.filter((l) => l.d <= near + 0.01).forEach((l) => stroke(l.pts, l.w, 0.85));
        ctx.lineCap = "butt"; ctx.lineJoin = "miter"; ctx.lineWidth = 1;
        const [hx, hy, hd] = P3(at(base, 0.03, 0, hipZ + 0.74)), r = Math.max(3, (fit.f * 0.115) / hd);
        ctx.fillStyle = rgba(FG, 0.88); ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
        const [cx2, cy2] = P3(at(base, 0.16, 0.06, hipZ + 0.38));
        ctx.fillStyle = rgba(SIG, 1); ctx.beginPath(); ctx.arc(cx2, cy2, Math.max(1.8, (fit.f * 0.045) / hd), 0, Math.PI * 2); ctx.fill();
      }

      // the two fixes, on the floor
      let [x, y] = project(est.u.x, est.u.y, 0);
      ctx.strokeStyle = rgba(MUTE, 0.9); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y, 7, 4.6, 0, 0, Math.PI * 2); ctx.stroke();
      [x, y] = project(est.w.x, est.w.y, 0);
      ctx.fillStyle = rgba(FG, 1); ctx.beginPath(); ctx.ellipse(x, y, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1;

      const ly = h - 12;
      ctx.fillStyle = rgba(FG, 1); ctx.beginPath(); ctx.arc(pad + 5, ly - 3, 4, 0, Math.PI * 2); ctx.fill();
      label(ctx, "WEIGHTED", pad + 14, ly);
      ctx.strokeStyle = rgba(MUTE, 0.9); ctx.beginPath(); ctx.arc(pad + 98, ly - 3, 5, 0, Math.PI * 2); ctx.stroke();
      label(ctx, "EQUAL WEIGHTS", pad + 108, ly);
      ctx.strokeStyle = rgba(FG, 0.85); ctx.beginPath(); ctx.moveTo(pad + 214, ly - 3); ctx.lineTo(pad + 224, ly - 3); ctx.moveTo(pad + 219, ly - 8); ctx.lineTo(pad + 219, ly + 2); ctx.stroke();
      label(ctx, "TRUE POSITION", pad + 230, ly);
    }
    return {
      resize() { g = setup(cv); fit = null; draw(); },
      tick(dt) { advance(Math.min(dt, 0.05)); draw(); },
      enter() { if (t < 1) for (let i = 0; i < 600; i++) advance(1 / 60); },
      still() { reset(); for (let i = 0; i < 900; i++) advance(1 / 60); draw(); },
    };
  }

  // ================= runner =================
  const kinds = { fle: FLE, undertone: UnderTone, seal: Seal, sar: SAR, chirp: Chirp, uwnodes: UWNodes, nets: Nets, loc: Loc, sarpass: SarPass, waterfall: Waterfall };
  const live = new Set();
  const all = [];
  for (const cv of document.querySelectorAll("canvas[data-inst]")) {
    const make = kinds[cv.dataset.inst];
    if (!make) continue;
    const inst = make(cv);
    inst.cv = cv;
    all.push(inst);
  }
  if (!all.length) return;

  let raf = 0, last = 0;
  function loop(t) {
    raf = 0;
    frameNo++;
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    for (const inst of live) inst.tick(dt);
    if (live.size && !document.hidden) raf = requestAnimationFrame(loop);
  }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const inst = all.find((i) => i.cv === en.target);
      if (!inst) continue;
      if (en.isIntersecting) {
        if (reduce.matches) { inst.still(); continue; }
        if (!live.has(inst)) { inst.enter(); live.add(inst); }
      } else live.delete(inst);
    }
    if (live.size && !raf) { last = 0; raf = requestAnimationFrame(loop); }
  }, { rootMargin: "80px 0px" });
  const start = () => {
    for (const inst of all) { inst.resize(); if (reduce.matches) inst.still(); io.observe(inst.cv); }
  };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(start);
  let rt = 0;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => all.forEach((i) => i.resize()), 120); });
  // a theme change repaints only what is on screen; the rest repaint as they come into view
  if (window.siteTheme) window.siteTheme.on(() => { readPalette(); for (const i of all) if (live.has(i)) i.tick(0); else if (reduce.matches) i.resize(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && live.size && !raf) { last = 0; raf = requestAnimationFrame(loop); } });
})();
