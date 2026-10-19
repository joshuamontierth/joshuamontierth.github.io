// Live signal instruments for the research entries. Each one is a small simulation of the
// mechanism, run only while it is on screen.
//   fle:       a QPSK link through a carrier offset that FLE keys between two values;
//              a second-order decision-directed PLL tracks it. The constellation stays
//              locked while the loop's frequency estimate carries the secondary bits.
//   undertone: bursty Wi-Fi frames; each frame's CFO lands on one of four tones.
//              Symbol windows with no frames are erasures.
//   seal:      SpectralSeal beacons from a real access point and an impostor: the tones
//              arrive, the phone decodes a 64-bit value, hashes it once, and checks it.
//   sar:       a spectrogram of linear-FM radar pulses during a pass, and below it the
//              delayed-conjugate product that collapses each chirp to a tone for CFAR.
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
      const sc = side * 0.43;
      for (let i = 0; i < pts.length; i++) {
        const a = 0.1 + 0.8 * (i / pts.length);
        ctx.fillStyle = rgba(FG, a.toFixed(3));
        const x = cx0 + side / 2 + pts[i][0] * sc, y = cy0 + side / 2 - pts[i][1] * sc;
        ctx.fillRect(x - 1, y - 1, 2, 2);
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

  // ================= SARLINK =================
  function SAR(cv) {
    const COLS = 260, ROWS = 72, DROWS = 40;
    const PRI = 9, PULSE = 4;           // columns
    const DCM_ROW = 14;
    let g, spec, dcm, col, img, dimg, off, doff, passT, pulses, hits, lastHit, cfarHist;
    function reset() {
      spec = new Float32Array(COLS * ROWS); dcm = new Float32Array(COLS * DROWS);
      col = 0; passT = 0; pulses = 0; hits = []; lastHit = -999; cfarHist = [];
    }
    reset();
    function envelope() {
      // one pass every 14 s: rises, peaks, falls, then quiet
      const p = (passT % 14) / 14;
      return p < 0.75 ? Math.exp(-(((p - 0.37) / 0.14) ** 2)) : 0;
    }
    function addColumn() {
      // shift left by one column
      spec.copyWithin(0, 1); dcm.copyWithin(0, 1);
      const e = envelope();
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
      label(ctx, envelope() > 0.05 ? "PASS IN PROGRESS" : "WAITING FOR PASS", x1, pad + 4, envelope() > 0.05 ? rgba(SIGT, 0.95) : null, "right");
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
      label(ctx, `${pulses.toLocaleString("en-US")} pulses detected · simulated pass`, x0, h - pad + 2);
    }
    return {
      resize() { g = setup(cv); draw(); },
      tick(dt) { passT += Math.min(dt, 0.05); const n = Math.round(Math.min(dt, 0.05) * 70); for (let i = 0; i < n; i++) addColumn(); draw(); },
      enter() { if (col < COLS) { passT = 3.2; for (let i = 0; i < COLS; i++) addColumn(); } },
      still() { reset(); passT = 4.6; for (let i = 0; i < COLS; i++) addColumn(); draw(); },
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


  // ================= Underwater: orthogonal chirps =================
  function Chirp(cv) {
    const M = 32, TSYM = 0.9, SPAN = 4.5;
    let g, t, syms, cur, bars;
    const newSym = (t0) => ({ t0, up: (Math.random() * M) | 0, down: (Math.random() * M) | 0 });
    function reset() { t = 0; syms = []; cur = newSym(0); bars = new Float32Array(M); }
    reset();
    function advance(dt) {
      t += dt;
      while (t - cur.t0 >= TSYM) { syms.push(cur); cur = newSym(cur.t0 + TSYM); }
      syms = syms.filter((q) => t - q.t0 < SPAN + TSYM);
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
      label(ctx, "OWN TX ↑   FAR NODE ↓", x1, pad + 4, null, "right");
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
        ctx.strokeStyle = rgba(FG, 0.95); ctx.lineWidth = 1.4;    // far node: quiet
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
        ctx.fillStyle = b === cur.down ? rgba(FG, 0.95) : rgba(MUTE, 0.45);
        ctx.fillRect(x0 + 4 + b * bw + 1, by + bh - 4 - hh, Math.max(1, bw - 2), hh);
      }
      const last = syms.slice(-8).map((q) => String(q.down).padStart(2, "0")).join(" ");
      label(ctx, `FAR NODE SYMBOLS ${last}`, pad, h - pad + 2);
      label(ctx, "OWN SIGNAL SPREAD ACROSS ALL BINS", x1, h - pad + 2, null, "right");
    }
    return {
      resize() { g = setup(cv); draw(); },
      tick(dt) { advance(Math.min(dt, 0.05)); draw(); },
      enter() { if (t < 1) for (let i = 0; i < 300; i++) advance(1 / 60); },
      still() { reset(); for (let i = 0; i < 330; i++) advance(1 / 60); draw(); },
    };
  }

  // ================= NICU: weighted multilateration =================
  function Loc(cv) {
    const RW = 12, RH = 8.5;
    // anchors along both long walls; staff stop at sinks and bedsides between them
    const anchors = [{ x: 1.6, y: 1.0 }, { x: 6.0, y: 2.4 }, { x: 10.4, y: 1.0 }, { x: 11.4, y: 4.25 }, { x: 10.4, y: 7.5 }, { x: 6.0, y: 6.1 }, { x: 1.6, y: 7.5 }, { x: 0.6, y: 4.25 }];
    const stops = [{ x: 3.8, y: 1.7 }, { x: 8.2, y: 1.7 }, { x: 9.9, y: 4.25 }, { x: 8.2, y: 6.8 }, { x: 3.8, y: 6.8 }, { x: 2.1, y: 4.25 }];
    let g, t, tag, goal, pause, sm, bias, est, trailW, trailU, errW, errU, acc, primed;
    function reset() {
      t = 0; tag = { ...stops[0] }; goal = stops[1]; pause = 0; sm = null; bias = anchors.map(() => 0);
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
      if (pause > 0) pause -= dt;
      else {
        const dx = goal.x - tag.x, dy = goal.y - tag.y, dd = Math.hypot(dx, dy), v = 0.9 * dt;
        if (dd < v) { tag = { ...goal }; pause = 0.8 + Math.random() * 1.6; goal = stops[(stops.indexOf(goal) + 1) % stops.length]; }
        else { tag.x += (dx / dd) * v; tag.y += (dy / dd) * v; }
      }
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
    function draw() {
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      const pad = 18, top = pad + 22, bottom = 30;
      const sc = Math.min((w - pad * 2) / RW, (h - top - bottom - pad) / RH);
      const ox = (w - RW * sc) / 2, oy = top;
      const P = (p) => [ox + p.x * sc, oy + p.y * sc];
      const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
      label(ctx, "ROOM 8.5 × 12 m · 8 ANCHORS", pad, pad + 4);
      label(ctx, `MEAN ERROR · WEIGHTED ${mean(errW).toFixed(1)} m · EQUAL ${mean(errU).toFixed(1)} m`, w - pad, pad + 4, rgba(FG, 0.9), "right");
      // room and 1 m grid
      ctx.strokeStyle = rgba(FG, 0.04); ctx.lineWidth = 1;
      for (let x = 1; x < RW; x++) { ctx.beginPath(); ctx.moveTo(ox + x * sc, oy); ctx.lineTo(ox + x * sc, oy + RH * sc); ctx.stroke(); }
      for (let y = 1; y < RH; y++) { ctx.beginPath(); ctx.moveTo(ox, oy + y * sc); ctx.lineTo(ox + RW * sc, oy + y * sc); ctx.stroke(); }
      frameBox(ctx, ox, oy, RW * sc, RH * sc);
      // range circles, brighter where the anchor is trusted (clipped to the room)
      ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, RW * sc, RH * sc); ctx.clip();
      if (sm) anchors.forEach((a, i) => {
        const wt = weight(sm[i]);
        const [ax, ay] = P(a);
        ctx.strokeStyle = rgba(FG, wt >= 1 ? 0.35 : wt >= 0.1 ? 0.16 : 0.07);
        ctx.setLineDash(wt >= 1 ? [] : [3, 4]);
        ctx.beginPath(); ctx.arc(ax, ay, sm[i] * sc, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.restore();
      anchors.forEach((a, i) => {
        const [ax, ay] = P(a);
        ctx.fillStyle = rgba(FG, 0.9); ctx.fillRect(ax - 4, ay - 4, 8, 8);
        label(ctx, "A" + (i + 1), ax + 8, ay - 6);
      });
      // trails and estimates
      // recent estimates as fading dots: the spread of each method is visible at a glance
      const trail = (tr, c, filled) => tr.forEach((p, i) => {
        const [x, y] = P(p), a = ((i + 1) / tr.length) * 0.5;
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        if (filled) { ctx.fillStyle = rgba(c, a.toFixed(3)); ctx.fill(); } else { ctx.strokeStyle = rgba(c, a.toFixed(3)); ctx.lineWidth = 1; ctx.stroke(); }
      });
      trail(trailU, MUTE, false); trail(trailW, FG, true);
      let [x, y] = P(est.u);
      ctx.strokeStyle = rgba(MUTE, 0.9); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
      [x, y] = P(est.w);
      ctx.fillStyle = rgba(FG, 1); ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      [x, y] = P(tag);
      ctx.strokeStyle = rgba(FG, 0.85); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke();
      const ly = h - 12;
      ctx.fillStyle = rgba(FG, 1); ctx.beginPath(); ctx.arc(pad + 5, ly - 3, 4, 0, Math.PI * 2); ctx.fill();
      label(ctx, "WEIGHTED", pad + 14, ly);
      ctx.strokeStyle = rgba(MUTE, 0.9); ctx.beginPath(); ctx.arc(pad + 98, ly - 3, 5, 0, Math.PI * 2); ctx.stroke();
      label(ctx, "EQUAL WEIGHTS", pad + 108, ly);
      ctx.strokeStyle = rgba(FG, 0.85); ctx.beginPath(); ctx.moveTo(pad + 214, ly - 3); ctx.lineTo(pad + 224, ly - 3); ctx.moveTo(pad + 219, ly - 8); ctx.lineTo(pad + 219, ly + 2); ctx.stroke();
      label(ctx, "TRUE POSITION", pad + 230, ly);
    }
    return {
      resize() { g = setup(cv); draw(); },
      tick(dt) { advance(Math.min(dt, 0.05)); draw(); },
      enter() { if (t < 1) for (let i = 0; i < 600; i++) advance(1 / 60); },
      still() { reset(); for (let i = 0; i < 900; i++) advance(1 / 60); draw(); },
    };
  }

  // ================= runner =================
  const kinds = { fle: FLE, undertone: UnderTone, seal: Seal, sar: SAR, chirp: Chirp, loc: Loc };
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
  if (window.siteTheme) window.siteTheme.on(() => { readPalette(); all.forEach((i) => i.resize()); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && live.size && !raf) { last = 0; raf = requestAnimationFrame(loop); } });
})();
