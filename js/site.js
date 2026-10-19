(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- header: transparent over the mesh, solid once you scroll ----------
  const bar = $("#bar"), hero = $(".hero");
  if (bar) {
    const onScroll = () => bar.classList.toggle("is-solid", !hero || scrollY > 24);
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
  }

  // ---------- the one load moment ----------
  if (hero) {
    $$("[data-reveal]", hero).forEach((el, i) => el.style.setProperty("--rd", 120 + i * 110 + "ms"));
    const go = () => requestAnimationFrame(() => hero.classList.add("is-on"));
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(go);
    setTimeout(go, 1200);
  }

  // ---------- section headings sweep on once ----------
  const heads = $$(".sec-head[data-reveal]");
  if (heads.length && !reduce.matches && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -12% 0px" });
    heads.forEach((h) => io.observe(h));
  } else heads.forEach((h) => h.classList.add("is-in"));

  // ---------- research rail: where you are on the page ----------
  const rail = $$(".rail a");
  if (rail.length) {
    const byId = new Map(rail.map((a) => [a.getAttribute("href").slice(1), a]));
    let on = null;
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        const a = byId.get(e.target.id);
        if (!a || a === on) continue;
        on && on.classList.remove("is-on");
        a.classList.add("is-on");
        on = a;
        const list = a.closest(".rail");
        if (list && list.scrollWidth > list.clientWidth) list.scrollTo({ left: a.parentElement.offsetLeft - list.clientWidth / 2 + a.offsetWidth / 2, behavior: "smooth" });
      }
    }, { rootMargin: "-30% 0px -60% 0px" });
    [...byId.keys()].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  // ---------- SpectralSeal phone: check the two networks once, when it comes into view ----------
  const phone = $("#wifi-phone");
  if (phone) {
    if (reduce.matches || !("IntersectionObserver" in window)) phone.classList.add("is-done");
    else {
      const io = new IntersectionObserver((es) => {
        if (es[0].isIntersecting) { phone.classList.add("is-on"); io.disconnect(); }
      }, { threshold: 0.45 });
      io.observe(phone);
    }
  }

  // ---------- BibTeX ----------
  const BIB = {
    undertone: `@inproceedings{montierth2026undertone,
  title     = {{WiP}: {UnderTone}: Frequency Lock Encoding on {COTS} {Wi-Fi} Hardware},
  author    = {Montierth, Joshua and Lundrigan, Philip},
  booktitle = {Proceedings of the 32nd Annual International Conference on Mobile Computing and Networking (MobiCom)},
  year      = {2026}
}`,
    fle: `@inproceedings{montierth2026fle,
  title     = {Frequency Lock Encoding},
  author    = {Montierth, Joshua and Rice, Michael and Lundrigan, Philip},
  booktitle = {IEEE Military Communications Conference (MILCOM)},
  year      = {2026}
}`,
    chirps: `@inproceedings{schiel2024chirps,
  title     = {Using Orthogonal Chirps Underwater for In-Band, Full-Duplex Communication with Minimal Self-Interference Cancellation},
  author    = {Schiel, Bryson and Montierth, Joshua and Blattner, Eli and Dobbs, Corey E. and Nielsen, Tracianne B. and Lundrigan, Philip},
  booktitle = {Proceedings of the 18th ACM International Conference on Underwater Networks \\& Systems (WUWNet)},
  year      = {2024},
  doi       = {10.1145/3699432.3699464}
}`,
    thesis: `@mastersthesis{montierth2027fle,
  title  = {Frequency Lock Encoding},
  author = {Montierth, Joshua},
  school = {Brigham Young University},
  type   = {M.S. thesis},
  year   = {2027}
}`,
  };
  const status = $("#bib-status");
  for (const btn of $$("[data-bib]")) {
    btn.addEventListener("click", async () => {
      const text = BIB[btn.dataset.bib];
      const label = btn.textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied";
        if (status) status.textContent = "BibTeX copied to the clipboard.";
      } catch {
        // no clipboard: show the entry under the paper, ready to select
        const host = btn.closest(".paper, .pub");
        const pre = document.createElement("pre");
        pre.textContent = text; pre.className = "bib-pre";
        if (host) { host.querySelector(".bib-pre")?.remove(); host.append(pre); }
        else if (status) status.replaceChildren(pre);
        if (status) status.textContent = "BibTeX shown below the paper.";
        btn.textContent = "Shown below";
      }
      setTimeout(() => { btn.textContent = label; }, 1800);
    });
  }

  // ---------- Mood Music sample: the words, Gemma's read of them, and the music, in sync ----------
  const md = $("#mood-demo");
  if (md) moodDemo(md);
  function moodDemo(root) {
    const { duration, scenes } = JSON.parse($(".md-data", root).textContent);
    const audio = $("audio", root), play = $(".md-play", root), ring = $(".md-ring-fill", root);
    const text = $(".md-text", root), by = $(".md-by", root), tags = $(".md-tags", root), clock = $(".md-time span", root);
    const bars = $$(".md-bars i", root), chips = $$(".md-scenes button", root), fills = $$(".md-scenes b", root);
    const cv = $(".md-viz", root), g = cv.getContext("2d");
    const RATE = 3.6; // words a second, a brisk speaking pace
    let level = new Float32Array(0);
    let started = false, moodK = -1, textK = -1, words = [], lit = -2, ac = null, an = null, freq = null, raf = 0;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const at = (t, key) => scenes.reduce((k, s, i) => (t >= s[key] ? i : k), 0);

    function showText(k) {
      textK = k; lit = -2; text.textContent = ""; by.textContent = scenes[k].by || "";
      words = scenes[k].text.split(" ").map((w, i) => {
        const el = document.createElement("span");
        el.textContent = (i ? " " : "") + w;
        text.append(el);
        return el;
      });
    }
    function showMood(k) {
      moodK = k;
      scenes[k].mood.forEach((v, i) => { bars[i].style.width = `${Math.round(v * 100)}%`; });
      tags.textContent = "";
      scenes[k].tags.forEach((tag, i) => {
        const li = document.createElement("li");
        li.textContent = tag;
        li.style.animationDelay = `${i * 70}ms`;
        tags.append(li);
      });
      chips.forEach((c, i) => c.classList.toggle("is-on", i === k));
    }
    function update() {
      const t = audio.currentTime || 0;
      const j = at(t, "type"), k = at(t, "at");
      if (j !== textK) showText(j);
      // before playing, the first excerpt sits there whole; while playing, words light at speaking pace
      const n = !started || reduce.matches ? words.length - 1 : Math.floor((t - scenes[j].type) * RATE);
      if (n !== lit) {
        words.forEach((w, i) => { w.classList.toggle("is-in", i <= n); w.classList.toggle("is-now", started && i === n && n < words.length - 1); });
        lit = n;
      }
      if (k !== moodK) showMood(k);
      fills.forEach((f, i) => {
        const a = scenes[i].at, b = i + 1 < scenes.length ? scenes[i + 1].at : duration;
        f.style.width = `${Math.max(0, Math.min(1, (t - a) / (b - a))) * 100}%`;
      });
      ring.style.strokeDashoffset = String(1 - Math.min(1, t / duration));
      clock.textContent = fmt(t);
    }

    // a level meter from the music itself
    function graph() {
      if (ac || reduce.matches) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ac = new AC();
        an = ac.createAnalyser();
        an.fftSize = 2048;
        an.smoothingTimeConstant = 0.8;
        ac.createMediaElementSource(audio).connect(an);
        an.connect(ac.destination);
        freq = new Uint8Array(an.frequencyBinCount);
      } catch (e) { an = null; }
    }
    function draw() {
      const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
      if (!w) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const p = window.siteTheme ? window.siteTheme.palette() : { fg: "233,238,245" };
      const live = an && !audio.paused;
      if (live) an.getByteFrequencyData(freq);
      const pad = w < 600 ? 18 : 26, gap = 3;
      const N = Math.max(24, Math.floor((w - 2 * pad + gap) / 7));
      if (level.length !== N) level = new Float32Array(N);
      const bw = (w - 2 * pad - gap * (N - 1)) / N;
      const ny = ac ? ac.sampleRate / 2 : 24000;
      for (let i = 0; i < N; i++) {
        let v = 0;
        if (live) {
          // log-spaced bands from 45 Hz to 9 kHz, tilted up so the highs show
          const b0 = Math.floor((45 * Math.pow(200, i / N)) / ny * freq.length);
          const b1 = Math.max(b0 + 1, Math.floor((45 * Math.pow(200, (i + 1) / N)) / ny * freq.length));
          let sum = 0;
          for (let b = b0; b < b1; b++) sum += freq[b];
          v = Math.min(1, Math.pow(sum / (b1 - b0) / 255, 1.5) * (1 + 0.9 * i / N));
        }
        level[i] += (v - level[i]) * (v > level[i] ? 0.55 : 0.1);
        const bh = Math.max(2, level[i] * (h - 6));
        g.fillStyle = `rgba(${p.fg},${(0.2 + 0.7 * level[i]).toFixed(3)})`;
        const x = pad + i * (bw + gap), y = (h - bh) / 2;
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, bw, bh, Math.min(bw, bh) / 2); else g.rect(x, y, bw, bh);
        g.fill();
      }
    }
    function loop() {
      update(); draw();
      raf = !audio.paused || level.some((v) => v > 0.004) ? requestAnimationFrame(loop) : 0;
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    const go = (t) => {
      started = true;
      graph();
      if (ac && ac.state === "suspended") ac.resume();
      if (t != null) audio.currentTime = t;
      if (audio.paused) audio.play().catch(() => {});
      kick();
    };

    play.addEventListener("click", () => {
      if (!audio.paused) { audio.pause(); return; }
      go(audio.ended || audio.currentTime >= duration - 0.1 ? 0 : null);
    });
    chips.forEach((c, i) => c.addEventListener("click", () => go(Math.max(0, scenes[i].type - 0.3))));
    audio.addEventListener("play", () => { play.classList.add("is-on"); play.setAttribute("aria-label", "Pause the Mood Music sample"); kick(); });
    audio.addEventListener("pause", () => { play.classList.remove("is-on"); play.setAttribute("aria-label", "Play the Mood Music sample"); kick(); });
    audio.addEventListener("seeked", kick);
    audio.addEventListener("ended", () => { started = false; audio.currentTime = 0; kick(); });
    if (window.siteTheme) window.siteTheme.on(draw);
    addEventListener("resize", () => draw(), { passive: true });
    update(); draw();
  }

  // ---------- ABCD ray tracer: two thin lenses on an optical rail ----------
  // From the project itself: glowing rays with a dot where each meets an element, a ruled
  // rail, and the matrix product written out, term by term, under the drawing.
  const rtc = $(".rt-cv");
  if (rtc) rayTracer(rtc, $(".rt-mx"));
  function rayTracer(cv, mxEl) {
    const g = cv.getContext("2d");
    const RAIL = 520, OBJ = { z: 26, y: 13 }, AP = 25, YMAX = 36, N = 9;   // mm
    const lenses = [{ z: 180, f: 55 }, { z: 320, f: 40 }];
    const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]];
    const gap = (d) => [1, d, 0, 1], thin = (f) => [1, 0, -1 / f, 1];
    const MONO = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "monospace";
    let sel = 0, over = -1, hl = null, drag = null, w = 0, h = 0, sx = 1, sy = 1, ox = 0, oy = 0, narrow = false;
    let t = null, P = null, cool = "140,202,255", running = false, visible = false, raf = 0;
    const X = (z) => ox + z * sx, Y = (y) => oy - y * sy;

    // ---- optics: a fan of rays from the object's tip, and the system matrix ----
    function trace() {
      const [L1, L2] = lenses, d1 = L1.z - OBJ.z, d2 = L2.z - L1.z;
      const S = mul(thin(L2.f), mul(gap(d2), mul(thin(L1.f), gap(d1))));   // object plane to just past lens 2
      let d3 = Math.abs(S[3]) < 1e-9 ? Infinity : -S[1] / S[3];            // the distance that makes B zero
      const kind = !isFinite(d3) || Math.abs(d3) > 4000 ? "inf" : d3 > 0 ? "real" : "virtual";
      if (kind === "inf") d3 = Infinity;
      const M = kind === "inf" ? S : mul(gap(d3), S);
      const rays = [];
      for (let k = 0; k < N; k++) {
        const y1 = AP * 0.86 * (1 - (2 * k) / (N - 1));                    // where it meets lens 1, top to bottom
        let th = (y1 - OBJ.y) / d1;
        const pts = [[OBJ.z, OBJ.y], [L1.z, y1]];
        th -= y1 / L1.f;
        const y2 = y1 + th * d2;
        pts.push([L2.z, y2]);
        const blocked = Math.abs(y2) > AP;
        let th2 = th;
        if (!blocked) { th2 = th - y2 / L2.f; pts.push([RAIL + 40, y2 + th2 * (RAIL + 40 - L2.z)]); }
        rays.push({ pts, blocked, y2, th2 });
      }
      return { d1, d2, d3, kind, M, zi: L2.z + d3, mag: M[0], rays };
    }

    // ---- the matrix product under the drawing ----
    const TERMS = [["M"], ["T", 3], ["L", 2], ["T", 2], ["L", 1], ["T", 1]];
    const cells = {}, caps = {}, terms = {};
    if (mxEl) {
      const eq = document.createElement("div");
      eq.className = "rt-eq";
      const lhs = document.createElement("span");
      lhs.className = "rt-lhs";
      lhs.innerHTML = "<i>M</i>&thinsp;=";
      eq.append(lhs);
      TERMS.forEach(([kind, n], i) => {
        const k = kind + (n || ""), el = document.createElement("div");
        el.className = "rt-term" + (k === "M" ? " rt-sys" : "");
        el.dataset.k = k;
        el.innerHTML = '<span class="mx2"><b></b><b></b><b></b><b></b></span>' +
          '<span class="rt-sym">' + (kind === "M" ? "at the image" : kind === "T" ? `<i>T</i>(<i>d</i><sub>${n}</sub>)` : `<i>L</i>(<i>f</i><sub>${n}</sub>)`) + "</span>" +
          '<span class="rt-val"></span>';
        cells[k] = [...el.querySelectorAll("b")];
        caps[k] = el.querySelector(".rt-val");
        terms[k] = el;
        el.addEventListener("mouseenter", () => { hl = k; paint(); });
        el.addEventListener("mouseleave", () => { hl = null; paint(); });
        eq.append(el);
        if (i === 0) { const op = document.createElement("span"); op.className = "rt-op"; op.textContent = "="; eq.append(op); }
      });
      mxEl.append(eq);
    }
    const minus = (s) => s.replace("-", "−");
    const num = (v, kind) => {
      if (Math.abs(v) < 5e-10) return "0";
      if (Math.abs(v - 1) < 5e-10 && kind !== "M") return "1";
      const a = Math.abs(v);
      if (kind === "C" || a < 0.1) return minus(v.toPrecision(3));
      return minus(v.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2));
    };
    const mm = (v) => (isFinite(v) ? minus(String(Math.round(v))) + " mm" : "∞");
    const put = (k, m, cap) => {
      if (!cells[k]) return;
      const kinds = ["A", "B", "C", "D"];
      m.forEach((v, i) => {
        const s = isFinite(v) ? num(v, k === "M" ? "M" : kinds[i]) : "∞";
        if (cells[k][i].textContent !== s) cells[k][i].textContent = s;
      });
      if (caps[k].textContent !== cap) caps[k].textContent = cap;
    };
    function updateMatrices() {
      const [L1, L2] = lenses;
      put("T1", gap(t.d1), `d₁ = ${mm(t.d1)}`);
      put("L1", thin(L1.f), `f₁ = ${Math.round(L1.f)} mm`);
      put("T2", gap(t.d2), `d₂ = ${mm(t.d2)}`);
      put("L2", thin(L2.f), `f₂ = ${Math.round(L2.f)} mm`);
      put("T3", t.kind === "inf" ? [1, Infinity, 0, 1] : gap(t.d3), `d₃ = ${mm(t.d3)}`);
      put("M", t.M, t.kind === "real" ? `image ×${num(t.mag, "M")}` : t.kind === "virtual" ? `virtual image ×${num(t.mag, "M")}` : "image at infinity");
      if (cells.M) cells.M[1].classList.toggle("is-zero", t.kind !== "inf");
      if (terms.T3) terms.T3.classList.toggle("is-off", t.kind === "inf");
    }
    function markTerms() {
      if (!mxEl) return;
      const live = drag ? drag.i : over >= 0 ? over : document.activeElement === cv ? sel : -1;
      for (const k in terms) {
        const n = +k.slice(1);
        const on = hl === k || (live >= 0 && (k === "L" + (live + 1) || k === "T" + (live + 1) || k === "T" + (live + 2)));
        terms[k].classList.toggle("is-hot", on);
      }
    }

    // ---- drawing ----
    function layout() {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      w = r.width; h = r.height;
      if (!w) return false;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      narrow = w < 560;
      const padX = narrow ? 14 : 22, padTop = 44, padBot = 46;
      sx = (w - 2 * padX) / RAIL; sy = (h - padTop - padBot) / 2 / YMAX; ox = padX; oy = padTop + (h - padTop - padBot) / 2;
      return true;
    }
    function theme() {
      P = window.siteTheme ? window.siteTheme.palette() : { theme: "dark", fg: "233,238,245", mute: "169,179,193", sig: "255,106,61", sigText: "255,106,61" };
      cool = P.theme === "light" ? "10,97,192" : "140,202,255";
    }
    const mix = (a, b, u) => { const x = a.split(",").map(Number), y = b.split(",").map(Number); return x.map((v, i) => Math.round(v + (y[i] - v) * u)).join(","); };
    const rayRGB = (k) => { const u = k / (N - 1); return u < 0.5 ? mix(cool, P.fg, u * 2) : mix(P.fg, P.sig, (u - 0.5) * 2); };
    function along(pts, s0, s1) {   // the part of a polyline (in px) between two arc lengths
      const out = []; let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay);
        if (acc + L >= s0 && acc <= s1) {
          const a = Math.max(0, (s0 - acc) / L), b = Math.min(1, (s1 - acc) / L);
          if (!out.length) out.push([ax + (bx - ax) * a, ay + (by - ay) * a]);
          out.push([ax + (bx - ax) * b, ay + (by - ay) * b]);
        }
        acc += L;
        if (acc > s1) break;
      }
      return out;
    }
    const line = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
    const label = (s, x, y, col, align = "center", size = 10.5) => { g.font = `${size}px ${MONO}`; g.textAlign = align; g.fillStyle = col; g.fillText(s, x, y); };
    // a label on a patch of the panel, so the rays crossing behind it don't cut through the letters
    const tag = (s, x, y, col, align = "center") => {
      g.font = `10.5px ${MONO}`;
      const tw = g.measureText(s).width, x0 = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
      g.fillStyle = `rgba(${P.panel},0.88)`; g.beginPath(); g.roundRect(x0 - 5, y - 11, tw + 10, 16, 2); g.fill();
      label(s, x, y, col, align);
    };
    // a symbol with a subscript, like d₁, drawn in two sizes so it doesn't depend on the font having ₁
    const symbol = (s, n, rest, x, y, col, align = "center") => {
      g.font = `10.5px ${MONO}`; const a = g.measureText(s).width;
      g.font = `8px ${MONO}`; const b = g.measureText(n).width;
      g.font = `10.5px ${MONO}`; const c = g.measureText(rest).width;
      let x0 = align === "center" ? x - (a + b + c) / 2 : align === "right" ? x - (a + b + c) : x;
      g.textAlign = "left"; g.fillStyle = col;
      g.fillText(s, x0, y); g.font = `8px ${MONO}`; g.fillText(n, x0 + a, y + 3); g.font = `10.5px ${MONO}`; g.fillText(rest, x0 + a + b, y);
      return a + b + c;
    };

    function draw(now) {
      if (!w && !layout()) return;
      const fg = (a) => `rgba(${P.fg},${a})`, mute = (a) => `rgba(${P.mute},${a})`, sig = (a) => `rgba(${P.sig},${a})`, sigT = (a) => `rgba(${P.sigText},${a})`;
      const light = P.theme === "light", live = drag ? drag.i : over >= 0 ? over : document.activeElement === cv ? sel : -1;
      g.clearRect(0, 0, w, h);
      g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip();
      g.lineCap = "round"; g.lineJoin = "round";
      const yi = t.mag * OBJ.y, onCanvas = t.kind !== "inf" && t.zi > OBJ.z && t.zi < RAIL + 30 && Math.abs(yi) < YMAX * 1.25;

      // the image glows where the rays meet
      if (onCanvas && t.kind === "real") {
        const gx = X(t.zi), gy = Y(yi), rg = g.createRadialGradient(gx, gy, 0, gx, gy, 110);
        rg.addColorStop(0, sig(light ? 0.1 : 0.16)); rg.addColorStop(1, sig(0));
        g.fillStyle = rg; g.fillRect(gx - 110, gy - 110, 220, 220);
      }

      // the rail: the optical axis, ruled every 10 mm
      g.strokeStyle = mute(0.4); g.lineWidth = 1;
      line([[X(0), Y(0)], [X(RAIL), Y(0)]]);
      for (let z = 0; z <= RAIL; z += 10) {
        const big = z % 50 === 0, x = X(z);
        g.strokeStyle = mute(big ? 0.42 : 0.2);
        line([[x, Y(0) - (big ? 4 : 2)], [x, Y(0) + (big ? 4 : 2)]]);
      }

      // focal points of the lens in hand
      if (live >= 0) {
        const L = lenses[live];
        [L.z - L.f, L.z + L.f].forEach((z) => {
          if (z < 0 || z > RAIL) return;
          g.strokeStyle = sig(0.9); g.lineWidth = 1.4;
          line([[X(z), Y(0) - 6], [X(z), Y(0) + 6]]);
          symbol("F", String(live + 1), "", X(z), Y(0) + 18, sigT(0.95));
        });
      }

      // rays: a soft glow under a bright core, and a dot wherever one meets a lens
      const px = t.rays.map((r) => r.pts.map(([z, y]) => [X(z), Y(y)]));
      t.rays.forEach((r, k) => {
        if (r.blocked) { g.strokeStyle = fg(0.13); g.lineWidth = 1; line(px[k]); return; }
        const c = rayRGB(k);
        g.strokeStyle = `rgba(${c},${light ? 0.1 : 0.13})`; g.lineWidth = 5; line(px[k]);
        g.strokeStyle = `rgba(${c},${light ? 0.85 : 0.8})`; g.lineWidth = 1.25; line(px[k]);
      });
      // a virtual image: trace the outgoing rays back to where they appear to come from
      if (t.kind === "virtual" && onCanvas) {
        g.setLineDash([3, 4]); g.lineWidth = 1;
        t.rays.forEach((r, k) => { if (!r.blocked) { g.strokeStyle = `rgba(${rayRGB(k)},0.45)`; line([[X(lenses[1].z), Y(r.y2)], [X(t.zi), Y(r.y2 + r.th2 * (t.zi - lenses[1].z))]]); } });
        g.setLineDash([]);
      }
      // light moving along each ray
      if (now != null) {
        const SPEED = 0.16, TAIL = 34;
        px.forEach((pts, k) => {
          if (t.rays[k].blocked) return;
          let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          const period = len + 260, s = ((now * SPEED + k * 97) % period);
          const c = rayRGB(k);
          [[TAIL, 0.18], [TAIL * 0.6, 0.45], [TAIL * 0.28, 1]].forEach(([back, a]) => {
            const seg = along(pts, s - back, s);
            if (seg.length > 1) { g.strokeStyle = `rgba(${c},${a})`; g.lineWidth = 1.9; line(seg); }
          });
        });
      }
      t.rays.forEach((r, k) => {
        g.fillStyle = r.blocked ? fg(0.25) : `rgba(${rayRGB(k)},1)`;
        px[k].slice(1, r.blocked ? 3 : 3).forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 2.1, 0, Math.PI * 2); g.fill(); });
      });

      // object and image arrows
      const arrow = (z, y, col, dashed) => {
        const x = X(z), y0 = Y(0), y1 = Y(y), s = y >= 0 ? 1 : -1;
        g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2;
        if (dashed) g.setLineDash([3, 3]);
        line([[x, y0], [x, y1 + s * 6]]);
        g.setLineDash([]);
        g.beginPath(); g.moveTo(x, y1); g.lineTo(x - 4.5, y1 + s * 8); g.lineTo(x + 4.5, y1 + s * 8); g.closePath(); g.fill();
      };
      arrow(OBJ.z, OBJ.y, fg(0.95));
      tag("OBJECT", X(OBJ.z), Y(OBJ.y) - 12, mute(0.95), "left");
      if (onCanvas) {
        arrow(t.zi, yi, sig(1), t.kind === "virtual");
        const up = yi >= 0, tx = Math.min(w - 8, Math.max(8, X(t.zi)));
        tag((t.kind === "virtual" ? "VIRTUAL IMAGE " : "IMAGE ") + "×" + num(t.mag, "M"), tx, up ? Y(yi) - 12 : Y(yi) + 20, sigT(1), X(t.zi) > w - 70 ? "right" : X(t.zi) < 90 ? "left" : "center");
      } else {
        tag(t.kind === "inf" ? "IMAGE AT INFINITY" : "IMAGE OFF THE RAIL", w - 10, 18, mute(0.95), "right");
      }

      // lenses: a lens whose bulge follows its power, a glint down the middle, and a handle on top
      lenses.forEach((L, i) => {
        const hot = i === live || hl === "L" + (i + 1), x = X(L.z), top = Y(AP), bot = Y(-AP), mid = Y(0);
        const bulge = Math.max(2.5, Math.min(13, 380 / L.f));
        g.beginPath();
        g.moveTo(x, top); g.quadraticCurveTo(x + bulge * 2, mid, x, bot); g.quadraticCurveTo(x - bulge * 2, mid, x, top); g.closePath();
        g.fillStyle = hot ? sig(light ? 0.14 : 0.16) : `rgba(${cool},${light ? 0.1 : 0.12})`; g.fill();
        g.strokeStyle = hot ? sig(1) : fg(light ? 0.6 : 0.55); g.lineWidth = hot ? 1.6 : 1.1; g.stroke();
        const glint = g.createLinearGradient(0, top, 0, bot);
        const gc = hot ? P.sig : cool;
        glint.addColorStop(0, `rgba(${gc},0)`); glint.addColorStop(0.5, `rgba(${gc},${light ? 0.55 : 0.7})`); glint.addColorStop(1, `rgba(${gc},0)`);
        g.strokeStyle = glint; g.lineWidth = 2; line([[x, top + 2], [x, bot - 2]]);
        g.fillStyle = hot ? sig(1) : fg(0.45);
        g.beginPath(); g.roundRect(x - 8, top - 9, 16, 4, 2); g.fill();
        // labels sit over their lens, or step aside to the outer side when the lenses are close
        const col = hot ? sigT(1) : mute(0.95), close = X(lenses[1].z) - X(lenses[0].z) < (narrow ? 70 : 150);
        const align = close ? (i ? "left" : "right") : "center", lx = close ? x + (i ? -4 : 4) : Math.min(w - 40, Math.max(40, x));
        if (narrow) symbol("f", String(i + 1), ` ${Math.round(L.f)}`, lx, top - 16, col, align);
        else symbol("L", String(i + 1), `  f ${Math.round(L.f)} mm`, lx, top - 16, col, align);
      });

      // the free-space gaps, labelled like the matrices below
      const spans = [[OBJ.z, lenses[0].z, 1], [lenses[0].z, lenses[1].z, 2]];
      if (t.kind !== "inf") spans.push([lenses[1].z, Math.max(OBJ.z, Math.min(RAIL + 30, t.zi)), 3]);
      const sy0 = h - 16;
      spans.forEach(([a, b, n]) => {
        const xa = X(Math.min(a, b)), xb = X(Math.max(a, b)), hot = hl === "T" + n || (live >= 0 && (n === live + 1 || n === live + 2));
        const col = hot ? fg(0.9) : mute(0.6);
        g.strokeStyle = col; g.lineWidth = 1;
        if (n === 3 && t.kind === "virtual") g.setLineDash([3, 3]);
        line([[xa + 1, sy0], [xb - 1, sy0]]);
        g.setLineDash([]);
        line([[xa, sy0 - 4], [xa, sy0 + 4]]); line([[xb, sy0 - 4], [xb, sy0 + 4]]);
        const d = n === 1 ? t.d1 : n === 2 ? t.d2 : t.d3, text = narrow || xb - xa < 96 ? "" : ` = ${mm(d)}`;
        g.font = `10.5px ${MONO}`;
        const wide = g.measureText("d" + text).width + 14;
        if (xb - xa > wide) {
          g.fillStyle = `rgba(${P.panel},1)`; g.fillRect((xa + xb) / 2 - wide / 2, sy0 - 8, wide, 14);
          symbol("d", String(n), text, (xa + xb) / 2, sy0 + 3.5, hot ? fg(1) : mute(0.95));
        }
      });
      g.restore();
    }

    function paint() { markTerms(); if (!running) draw(reduce.matches ? null : performance.now()); }
    function update() { t = trace(); updateMatrices(); paint(); }
    function frame(now) {
      if (!running) return;
      draw(now);
      raf = requestAnimationFrame(frame);
    }
    const start = () => { if (running || reduce.matches || !visible || document.hidden) return; running = true; raf = requestAnimationFrame(frame); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    // ---- input: drag a lens sideways to move it, up or down to change its focal length ----
    const clampZ = (i, z) => i === 0 ? Math.max(OBJ.z + 30, Math.min(lenses[1].z - 20, z)) : Math.max(lenses[0].z + 20, Math.min(RAIL - 16, z));
    const clampF = (f) => Math.max(20, Math.min(300, f));
    const hit = (cx, cy) => {
      const r = cv.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
      let best = -1, bd = narrow ? 22 : 16;
      lenses.forEach((L, i) => { const dx = Math.abs(X(L.z) - x); if (dx < bd && y > Y(AP) - 30 && y < Y(-AP) + 10) { bd = dx; best = i; } });
      return best;
    };
    cv.addEventListener("pointermove", (e) => {
      if (drag) {
        const L = lenses[drag.i];
        L.z = clampZ(drag.i, drag.z + (e.clientX - drag.x) / sx);
        L.f = clampF(drag.f * Math.exp((e.clientY - drag.y) / 110));
        update(); return;
      }
      const o = hit(e.clientX, e.clientY);
      if (o !== over) { over = o; cv.classList.toggle("is-over", o >= 0); paint(); }
    });
    cv.addEventListener("pointerdown", (e) => {
      const i = hit(e.clientX, e.clientY);
      if (i < 0) return;
      e.preventDefault();
      sel = i; drag = { i, x: e.clientX, y: e.clientY, z: lenses[i].z, f: lenses[i].f };
      cv.setPointerCapture(e.pointerId); cv.classList.add("is-drag"); paint();
    });
    // on a touch screen, only a touch that lands on a lens holds the page still
    cv.addEventListener("touchstart", (e) => { const p = e.touches[0]; if (p && hit(p.clientX, p.clientY) >= 0) e.preventDefault(); }, { passive: false });
    cv.addEventListener("touchmove", (e) => { if (drag) e.preventDefault(); }, { passive: false });
    const end = () => { if (!drag) return; drag = null; over = -1; cv.classList.remove("is-drag"); paint(); };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("pointerleave", () => { if (!drag && over >= 0) { over = -1; cv.classList.remove("is-over"); paint(); } });
    cv.addEventListener("keydown", (e) => {
      const L = lenses[sel], k = e.key, big = e.shiftKey ? 4 : 1;
      if (k === "ArrowLeft" || k === "ArrowRight") L.z = clampZ(sel, L.z + (k === "ArrowLeft" ? -5 : 5) * big);
      else if (k === "ArrowUp" || k === "ArrowDown") L.f = clampF(L.f * Math.pow(k === "ArrowUp" ? 0.94 : 1 / 0.94, big));
      else if (k === " ") sel = 1 - sel;
      else return;
      e.preventDefault(); update();
    });
    cv.addEventListener("focus", paint);
    cv.addEventListener("blur", paint);
    addEventListener("resize", () => { if (layout()) paint(); }, { passive: true });
    if (window.siteTheme) window.siteTheme.on(() => { theme(); paint(); });
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); else stop(); }).observe(cv);
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    theme(); layout(); update();
  }

  // ---------- click a photo or a clip to see it large ----------
  // The picture grows out of its place on the page and shrinks back into it when closed.
  const zoomFigs = $$(".r-main figure").filter((f) => !f.matches(".diagram, .inst, .mood-demo, .avo-fig, .wifi-phone") && $("img", f));
  if (zoomFigs.length && window.HTMLDialogElement) {
    const lb = document.createElement("dialog");
    lb.className = "lb";
    lb.setAttribute("aria-label", "Enlarged view");
    lb.innerHTML = '<button class="lb-x" type="button" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button><figure class="lb-fig"><figcaption class="lb-cap"></figcaption></figure>';
    document.body.append(lb);
    const fig = $(".lb-fig", lb), cap = $(".lb-cap", lb), root = document.documentElement;
    const ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9.2 6.8M2.5 13.5l4.3-4.3"/></svg>';
    const shown = (els) => els.find((e) => e.getClientRects().length) || els[0];
    let from = null, media = null, nat = [16, 10], busy = false;

    zoomFigs.forEach((f) => {
      const clip = f.classList.contains("shot--clip");
      let area = $(".clip-media", f) || $(".dev", f);
      if (!area) {
        const imgs = $$(":scope > img", f);
        if (!imgs.length) return;
        area = document.createElement("div");
        area.className = "zoom-area";
        imgs[0].before(area);
        area.append(...imgs);
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "zoom-btn";
      b.setAttribute("aria-label", clip ? "Enlarge video" : "Enlarge image");
      b.innerHTML = ICON;
      area.append(b);
      b.addEventListener("click", () => open(f, area, clip));
    });

    function fit() {
      if (!media) return;
      const capH = cap.hidden ? 0 : Math.min(140, cap.offsetHeight + 16);
      const maxW = Math.min(innerWidth - (innerWidth < 600 ? 24 : 96), 1680), maxH = innerHeight - (innerWidth < 600 ? 88 : 120) - capH;
      const k = Math.min(maxW / nat[0], maxH / nat[1]);
      media.style.width = Math.round(nat[0] * k) + "px";
      media.style.height = Math.round(nat[1] * k) + "px";
    }
    function flip(a, m, out) {
      const r0 = a.getBoundingClientRect(), r1 = m.getBoundingClientRect();
      if (!r0.width || !r1.width) return Promise.resolve();
      const s = Math.min(r0.width / r1.width, r0.height / r1.height);
      const dx = r0.left + r0.width / 2 - (r1.left + r1.width / 2), dy = r0.top + r0.height / 2 - (r1.top + r1.height / 2);
      const small = { transform: `translate(${dx}px, ${dy}px) scale(${s})` }, big = { transform: "none" };
      return m.animate(out ? [big, small] : [small, big], { duration: out ? 300 : 420, easing: out ? "cubic-bezier(0.5, 0, 0.75, 0)" : "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" }).finished;
    }
    function open(f, area, clip) {
      if (busy || lb.open) return;
      const still = shown($$("img", area));
      nat = [still.naturalWidth || +still.getAttribute("width") || 16, still.naturalHeight || +still.getAttribute("height") || 10];
      if (clip) {
        const tv = shown($$("video", area));
        media = document.createElement("video");
        media.muted = true; media.loop = true; media.playsInline = true;
        media.setAttribute("muted", ""); media.setAttribute("playsinline", "");
        media.poster = still.currentSrc || still.src;
        media.src = tv.currentSrc || tv.src;
        media.setAttribute("aria-label", still.alt);
        if (tv.currentTime) media.addEventListener("loadedmetadata", () => { media && (media.currentTime = tv.currentTime); }, { once: true });
        if (!reduce.matches) media.play().catch(() => {});
      } else {
        media = document.createElement("img");
        media.src = still.currentSrc || still.src;
        media.alt = still.alt;
      }
      media.className = "lb-media";
      fig.prepend(media);
      const fc = $("figcaption", f), row = f.closest(".vrow");
      cap.innerHTML = fc ? fc.innerHTML : row ? `<b>${$("h4", row).textContent}</b>` : "";
      $$(".inst-h", cap).forEach((e) => e.remove());
      cap.hidden = !cap.textContent.trim();
      from = area;
      root.classList.add("lb-open");
      lb.showModal();
      fit();
      if (reduce.matches) return;
      flip(area, media, false).catch(() => {});
      cap.animate({ opacity: [0, 1] }, { duration: 260, delay: 160, easing: "ease-out", fill: "backwards" });
      try { lb.animate({ opacity: [0, 1] }, { duration: 300, easing: "ease-out", pseudoElement: "::backdrop" }); } catch (e) { /* older browsers skip the fade */ }
    }
    async function close() {
      if (busy || !lb.open) return;
      busy = true;
      if (!reduce.matches && media) {
        const r = from.getBoundingClientRect(), inView = r.bottom > 0 && r.top < innerHeight;
        cap.animate({ opacity: [1, 0] }, { duration: 140, fill: "forwards" });
        try { lb.animate({ opacity: [1, 0] }, { duration: 300, easing: "ease-in", pseudoElement: "::backdrop", fill: "forwards" }); } catch (e) { /* no backdrop fade */ }
        const done = inView ? flip(from, media, true) : media.animate({ opacity: [1, 0], transform: ["none", "scale(0.96)"] }, { duration: 200, fill: "forwards" }).finished;
        await done.catch(() => {});
      }
      lb.close();
    }
    lb.addEventListener("close", () => {
      if (media) { if (media.pause) media.pause(); media.remove(); media = null; }
      cap.getAnimations().forEach((a) => a.cancel());
      lb.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      cap.innerHTML = "";
      root.classList.remove("lb-open");
      busy = false;
    });
    lb.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    lb.addEventListener("click", (e) => { if (!cap.contains(e.target)) close(); });
    addEventListener("resize", fit, { passive: true });
  }

  // ---------- live clips: each one plays while it's on screen ----------
  // The still shows first and stays put with reduced motion; a clip with a light and a dark
  // version plays whichever one the theme shows.
  const clipShots = $$(".shot--clip");
  if (clipShots.length) {
    const shown = (fig) => $$("video", fig).find((v) => v.getClientRects().length) || null;
    const load = (v) => { if (v && v.preload !== "auto") { v.preload = "auto"; v.load(); } };
    clipShots.forEach((fig) => {
      fig._on = () => {
        if (reduce.matches) return;
        $$("video", fig).forEach((v) => { if (v !== shown(fig)) v.pause(); });
        const v = shown(fig);
        if (!v) return;
        load(v);
        const go = v.play();
        (go && go.then ? go : Promise.resolve()).then(() => fig.classList.add("is-playing")).catch(() => {});
      };
      fig._off = () => { fig.classList.remove("is-playing"); $$("video", fig).forEach((v) => v.pause()); };
    });
    if ("IntersectionObserver" in window) {
      const near = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { load(shown(e.target)); near.unobserve(e.target); } }), { rootMargin: "600px 0px" });
      const seen = new IntersectionObserver((es) => es.forEach((e) => {
        e.target._in = e.isIntersecting && e.intersectionRatio >= 0.5;
        e.target._in ? e.target._on() : e.target._off();
      }), { threshold: [0, 0.5] });
      clipShots.forEach((fig) => { near.observe(fig); seen.observe(fig); });
    } else clipShots.forEach((fig) => fig._on());
    document.addEventListener("visibilitychange", () => clipShots.forEach((fig) => (document.hidden ? fig._off() : fig._in && fig._on())));
    if (window.siteTheme) window.siteTheme.on(() => clipShots.forEach((fig) => { if (fig._in) fig._on(); }));
  }

  // ---------- Avogadro: a hydrogen atom's electron cloud behind the search box ----------
  // Ported from the project's own cloud.js. Every dot is one sample of |ψ|², so dense
  // regions glow and the nodes stay dark; the two colours are the wavefunction's two signs.
  const avo = $(".avo");
  if (avo) avogadro(avo);
  function avogadro(root) {
    const cv = $(".avo-cv", root), ctx = cv.getContext("2d"), field = $(".avo-q", root);
    const exp = Math.exp;
    // radial part R(r) in Bohr radii (unnormalized) and the real angular part on the unit sphere
    const ORBITALS = [
      { n: 1, R: (r) => exp(-r), Y: () => 1 }, // 1s
      { n: 2, R: (r) => r * exp(-r / 2), Y: (x, y, z) => z }, // 2p z
      { n: 3, R: (r) => r * r * exp(-r / 3), Y: (x, y, z) => 3 * z * z - 1 }, // 3d z²
      { n: 3, R: (r) => (27 - 18 * r + 2 * r * r) * exp(-r / 3), Y: () => 1 }, // 3s
      { n: 3, R: (r) => r * r * exp(-r / 3), Y: (x, y) => x * x - y * y }, // 3d x²−y²
      { n: 4, R: (r) => r * r * r * exp(-r / 4), Y: (x, y, z) => x * y * z }, // 4f xyz
      { n: 3, R: (r) => r * (6 - r) * exp(-r / 3), Y: (x) => x }, // 3p x
      { n: 4, R: (r) => r * r * r * exp(-r / 4), Y: (x, y, z) => z * (5 * z * z - 3) }, // 4f z³
    ];
    const FRAME_MS = 1000 / 30, PERSP = 3.6, SHARP = 1.7;
    let W = 0, H = 0, count = 0, atom = null, photons = [], running = false, visible = false, lastFrame = 0, lastTick = 0, inks, alphas, blend;
    const rand = (a, b) => a + Math.random() * (b - a);
    const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

    function theme() {
      const light = window.siteTheme ? window.siteTheme.current() === "light" : matchMedia("(prefers-color-scheme: light)").matches;
      if (light) { inks = ["20,28,40", "10,97,192"]; alphas = [0.5, 0.36, 0.22]; blend = "source-over"; }
      else { inks = ["226,234,246", "140,202,255"]; alphas = [0.8, 0.55, 0.32]; blend = "lighter"; }
    }
    function prepare(orb) {
      if (orb.cdf) return orb;
      const steps = 900, rmax = 3 * orb.n * (orb.n + 2), rs = new Float64Array(steps + 1), cdf = new Float64Array(steps + 1);
      let acc = 0, k = 0, ymax = 0;
      for (let i = 0; i <= steps; i++) { const r = (i / steps) * rmax; acc += r * r * Math.pow(Math.abs(orb.R(r)), 2 * SHARP); rs[i] = r; cdf[i] = acc; }
      for (let i = 0; i <= steps; i++) cdf[i] /= acc;
      while (cdf[k] < 0.9) k++;
      for (let i = 0; i < 6000; i++) {
        const z = 2 * Math.random() - 1, t = 2 * Math.PI * Math.random(), s = Math.sqrt(1 - z * z);
        ymax = Math.max(ymax, Math.pow(Math.abs(orb.Y(s * Math.cos(t), s * Math.sin(t), z)), 2 * SHARP));
      }
      return Object.assign(orb, { rs, cdf, scale: 1 / rs[k], ymax: ymax * 1.05 });
    }
    function radius(orb) {
      const u = Math.random(), c = orb.cdf;
      let lo = 0, hi = c.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (c[mid] < u) lo = mid + 1; else hi = mid; }
      if (lo === 0) return 0;
      const f = (u - c[lo - 1]) / (c[lo] - c[lo - 1] || 1);
      return orb.rs[lo - 1] + f * (orb.rs[lo] - orb.rs[lo - 1]);
    }
    function sample(index, out) {
      const orb = prepare(ORBITALS[index]);
      for (let i = 0; i < count; i++) {
        let x, y, z, v;
        do {
          z = 2 * Math.random() - 1;
          const t = 2 * Math.PI * Math.random(), s = Math.sqrt(1 - z * z);
          x = s * Math.cos(t); y = s * Math.sin(t); v = orb.Y(x, y, z);
        } while (Math.random() * orb.ymax > Math.pow(Math.abs(v), 2 * SHARP));
        const r = radius(orb), k = r * orb.scale, o = i * 4;
        out[o] = x * k; out[o + 1] = y * k; out[o + 2] = z * k; out[o + 3] = orb.R(r) * v < 0 ? 1 : 0;
      }
    }
    function makeAtom(orbital, now) {
      const a = { orbital, pos: new Float32Array(count * 4), src: new Float32Array(count * 4), dst: new Float32Array(count * 4), pool: new Float32Array(count * 4), poolAt: 0,
        blink: new Float32Array(count), proj: new Float32Array(count * 3), morph: 1, morphStart: 0, morphDur: 1, yaw: rand(0, Math.PI * 2), tilt: rand(0, Math.PI * 2), next: now + rand(6, 9) };
      sample(orbital, a.pos); sample(orbital, a.pool);
      for (let i = 0; i < count; i++) a.blink[i] = Math.random();
      return a;
    }
    function jump(a, orbital, now, dur) {
      a.src.set(a.pos); sample(orbital, a.dst); sample(orbital, a.pool);
      Object.assign(a, { orbital, morph: 0, morphStart: now, morphDur: dur, next: now + dur + rand(7, 10) });
    }
    const nextOrbital = (a) => { let i; do i = (Math.random() * ORBITALS.length) | 0; while (i === a.orbital); return i; };
    function place() {
      const r = root.getBoundingClientRect(), f = field.getBoundingClientRect();
      return { cx: f.left - r.left + f.width / 2, cy: f.top - r.top + f.height / 2, size: Math.min(W, H) * 0.46 };
    }
    function update(a, now, dt) {
      a.yaw += dt * 0.16; a.tilt += dt * 0.05;
      if (a.morph < 1) {
        a.morph = Math.min(1, (now - a.morphStart) / a.morphDur);
        const e = ease(a.morph), twist = Math.sin(Math.PI * e) * 0.9, c = Math.cos(twist), s = Math.sin(twist);
        for (let i = 0; i < count * 4; i += 4) {
          const x = a.src[i] + (a.dst[i] - a.src[i]) * e, y = a.src[i + 1] + (a.dst[i + 1] - a.src[i + 1]) * e;
          a.pos[i] = x * c - y * s; a.pos[i + 1] = x * s + y * c;
          a.pos[i + 2] = a.src[i + 2] + (a.dst[i + 2] - a.src[i + 2]) * e;
          a.pos[i + 3] = e < 0.5 ? a.src[i + 3] : a.dst[i + 3];
        }
      } else {
        // the cloud is never still: a few electrons are "measured" somewhere new each frame
        for (let j = 0, n = Math.ceil(count * 0.02); j < n; j++) {
          const i = ((Math.random() * count) | 0) * 4, p = a.poolAt * 4;
          a.pos[i] = a.pool[p]; a.pos[i + 1] = a.pool[p + 1]; a.pos[i + 2] = a.pool[p + 2]; a.pos[i + 3] = a.pool[p + 3];
          a.poolAt = (a.poolAt + 1) % count;
        }
        // on its own page a search excites the atom; here it jumps every few seconds
        if (now >= a.next) { photons.push({ born: now }); jump(a, nextOrbital(a), now, 1.4); }
      }
    }
    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      if (!atom) return;
      ctx.globalCompositeOperation = blend;
      const { cx, cy, size } = place(), a = atom;
      const pitch = 0.42 + Math.sin(a.tilt) * 0.22, cosY = Math.cos(a.yaw), sinY = Math.sin(a.yaw), cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      const P = a.proj, pos = a.pos;
      for (let i = 0, j = 0; i < count; i++, j += 4) {
        const x = pos[j] * cosY - pos[j + 1] * sinY, y = pos[j] * sinY + pos[j + 1] * cosY;
        const z = pos[j + 2] * cosP - y * sinP, depth = pos[j + 2] * sinP + y * cosP, f = PERSP / (PERSP + depth);
        P[i * 3] = cx + x * size * f; P[i * 3 + 1] = cy - z * size * f;
        P[i * 3 + 2] = (depth < -0.3 ? 0 : depth < 0.3 ? 1 : 2) + pos[j + 3] * 3;
      }
      const t = now * 0.9;
      for (let bin = 0; bin < 6; bin++) {
        const near = bin % 3, r = [1.1, 0.85, 0.6][near];
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          if (P[i * 3 + 2] !== bin) continue;
          if ((a.blink[i] + t * (0.6 + a.blink[i] * 0.5)) % 1 < 0.1) continue; // each dot blinks out briefly, so the cloud shimmers
          ctx.rect(P[i * 3] - r, P[i * 3 + 1] - r, r * 2, r * 2);
        }
        ctx.fillStyle = `rgba(${inks[bin < 3 ? 0 : 1]},${alphas[near]})`;
        ctx.fill();
      }
      // photons: the light given off when the atom drops to its new orbital
      photons = photons.filter((p) => now - p.born < 1.4);
      for (const p of photons) {
        const u = (now - p.born) / 1.4;
        ctx.beginPath(); ctx.arc(cx, cy, size * (0.35 + u * 1.6), 0, Math.PI * 2);
        ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${inks[1]},${(0.55 * (1 - u) * (1 - u)).toFixed(3)})`; ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    function frame(ts) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (ts - lastFrame < FRAME_MS) return;
      const now = ts / 1000, dt = Math.min(0.1, lastTick ? now - lastTick : 0);
      lastFrame = ts; lastTick = now;
      update(atom, now, dt); draw(now);
    }
    const start = () => { if (running || reduce.matches || !visible || document.hidden) return; running = true; lastTick = 0; requestAnimationFrame(frame); };
    const stop = () => { running = false; };
    function still() { stop(); if (atom.orbital !== 2) { atom.orbital = 2; sample(2, atom.pos); } Object.assign(atom, { yaw: 0.7, tilt: 0.4, morph: 1 }); draw(0); }
    function resize() {
      const r = root.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!r.width) return;
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const want = Math.round(Math.min(6000, Math.max(2400, 9000 * Math.sqrt((W * H) / (1440 * 900)))));
      if (!atom || Math.abs(want - count) / count > 0.3) { count = want; atom = makeAtom(atom ? atom.orbital : 2, performance.now() / 1000); }
      if (reduce.matches) still(); else draw(performance.now() / 1000);
    }
    theme(); resize();
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); else stop(); }).observe(root);
    else { visible = true; start(); }
    addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    if (window.siteTheme) window.siteTheme.on(() => { theme(); if (!running) draw(performance.now() / 1000); });
  }

  // ---------- talk clips ----------
  const talk = $("#talk"), list = $("#clips");
  if (talk && list) {
    fetch("assets/audio/snippets.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((clips) => { if (Array.isArray(clips) && clips.length) buildClips(clips); })
      .catch(() => {});
  }
  function parseVTT(text) {
    const cues = [];
    const t = (s) => { const p = s.trim().split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
    for (const block of text.replace(/\r/g, "").split(/\n\n+/)) {
      const m = block.match(/([\d:.]+)\s+-->\s+([\d:.]+)[^\n]*\n([\s\S]+)/);
      if (m) cues.push({ a: t(m[1]), b: t(m[2]), text: m[3].replace(/\n/g, " ").trim() });
    }
    return cues;
  }
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const ICON_PLAY = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 1.8v10.4L12 7z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.8h2.8v10.4H3zM8.2 1.8H11v10.4H8.2z" fill="currentColor"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const waves = new Set();
  const ink = () => {
    const p = window.siteTheme ? window.siteTheme.palette() : { fg: "233,238,245", sig: "255,106,61", theme: "dark" };
    return { done: `rgb(${p.sig})`, rest: `rgba(${p.fg},${p.theme === "light" ? 0.28 : 0.32})` };
  };
  if (window.siteTheme) window.siteTheme.on(() => waves.forEach((fn) => fn()));

  function buildClips(clips) {
    const useOpus = !!document.createElement("audio").canPlayType('audio/ogg; codecs="opus"');
    let current = null;
    clips.forEach((c) => {
      const li = document.createElement("li");
      li.className = "clip";
      li.innerHTML = `<button class="clip-play" type="button" aria-label="Play: ${esc(c.title)}">${ICON_PLAY}</button>
        <div><p class="clip-title">${esc(c.title)}<span>${fmtTime(c.duration)}</span></p>
        <canvas class="clip-wave" aria-hidden="true"></canvas>
        <p class="clip-cap is-idle"></p></div>`;
      list.append(li);
      const btn = li.querySelector(".clip-play"), cv = li.querySelector(".clip-wave"), cap = li.querySelector(".clip-cap");
      const t0 = c.transcript || "", m0 = t0.match(/^[\s\S]*?[.?!](?=\s|$)/), first = m0 ? m0[0] : t0;   // the first sentence (no lookbehind, for older Safari)
      const idle = () => { cap.classList.add("is-idle"); cap.textContent = first || ""; };
      idle();
      const audio = new Audio();
      audio.preload = "none";
      audio.src = useOpus && c.files.opus ? c.files.opus : c.files.m4a;
      let cues = [];
      if (c.vtt) fetch(c.vtt).then((r) => r.text()).then((t) => { cues = parseVTT(t); }).catch(() => {});
      const peaks = c.rms || c.peaks || [];
      const draw = () => {
        const dpr = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
        if (!w) return;
        cv.width = w * dpr; cv.height = h * dpr;
        const ctx = cv.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const p = audio.duration ? audio.currentTime / audio.duration : 0;
        const n = peaks.length || 1, bw = w / n, c = ink();
        for (let i = 0; i < n; i++) {
          const v = Math.max(0.08, peaks[i] || 0), bh = v * (h - 2);
          ctx.fillStyle = (i + 0.5) / n <= p ? c.done : c.rest;
          ctx.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 1.5), bh);
        }
      };
      new ResizeObserver(draw).observe(cv);
      waves.add(draw);
      const setPlaying = (on) => {
        btn.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
        btn.setAttribute("aria-label", (on ? "Pause: " : "Play: ") + c.title);
      };
      btn.addEventListener("click", () => {
        if (audio.paused) {
          if (current && current !== audio) current.pause();
          current = audio;
          audio.play();
        } else audio.pause();
      });
      audio.addEventListener("play", () => setPlaying(true));
      audio.addEventListener("pause", () => setPlaying(false));
      audio.addEventListener("ended", () => { setPlaying(false); idle(); draw(); });
      audio.addEventListener("timeupdate", () => {
        const t = audio.currentTime;
        const cue = cues.find((q) => t >= q.a && t < q.b);
        if (cue) { cap.classList.remove("is-idle"); if (cap.textContent !== cue.text) cap.textContent = cue.text; }
        draw();
      });
      cv.addEventListener("click", (e) => {
        const r = cv.getBoundingClientRect();
        const go = () => { audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration; draw(); };
        if (audio.duration) go();
        else { audio.addEventListener("loadedmetadata", go, { once: true }); audio.load(); }
      });
    });
    talk.hidden = false;
  }
})();
