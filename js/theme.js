// Light and dark themes. With no stored choice the site follows the system setting; the
// toggle stores the visitor's choice. Canvas drawings take their colours from here
// (siteTheme.palette) and redraw when the theme changes (siteTheme.on).
(() => {
  "use strict";
  const root = document.documentElement;
  const sys = matchMedia("(prefers-color-scheme: light)");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const subs = new Set();
  const GROUND = { dark: "#06080c", light: "#f6f7f9" };

  const current = () => root.getAttribute("data-theme") || (sys.matches ? "light" : "dark");
  const triplet = (cs, name, fallback) => (cs.getPropertyValue(name).trim() || fallback).split(/[\s,/]+/).filter(Boolean).slice(0, 3).join(",");
  function palette() {
    const cs = getComputedStyle(root);
    return {
      theme: current(),
      fg: triplet(cs, "--fg-rgb", "233 238 245"),
      mute: triplet(cs, "--mute-rgb", "169 179 193"),
      sig: triplet(cs, "--sig-rgb", "255 106 61"),
      sigText: triplet(cs, "--sig-fg-rgb", "255 106 61"),
      panel: triplet(cs, "--panel-rgb", "10 14 20"),
      ground: triplet(cs, "--ground-rgb", "6 8 12"),
    };
  }
  function notify() {
    const p = palette();
    for (const fn of subs) { try { fn(p); } catch (e) { console.error(e); } }
  }
  function syncUI() {
    const t = current(), next = t === "dark" ? "light" : "dark";
    for (const b of document.querySelectorAll("[data-theme-toggle]")) {
      b.setAttribute("aria-label", `Switch to ${next} theme`);
      b.title = `Switch to ${next} theme`;
    }
    // the browser chrome follows a stored choice; otherwise each meta keeps its own media query
    const forced = root.getAttribute("data-theme");
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
      const own = (m.getAttribute("media") || "").includes("light") ? "light" : "dark";
      m.setAttribute("content", GROUND[forced || own]);
    }
  }
  function set(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch (e) { /* private mode: the choice lasts this page */ }
    syncUI();
    notify();
  }
  function toggle(btn) {
    const next = current() === "dark" ? "light" : "dark";
    if (!document.startViewTransition || reduce.matches || !btn) { set(next); return; }
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add("theme-vt");
    const vt = document.startViewTransition(() => set(next));
    vt.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 620, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(() => {});
    vt.finished.finally(() => root.classList.remove("theme-vt"));
  }

  window.siteTheme = {
    current,
    palette,
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
  };

  const init = () => {
    for (const b of document.querySelectorAll("[data-theme-toggle]")) b.addEventListener("click", () => toggle(b));
    syncUI();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  sys.addEventListener("change", () => { if (!root.hasAttribute("data-theme")) { syncUI(); notify(); } });
  // another tab changed the theme
  addEventListener("storage", (e) => {
    if (e.key === "theme" && (e.newValue === "light" || e.newValue === "dark") && e.newValue !== root.getAttribute("data-theme")) {
      root.setAttribute("data-theme", e.newValue); syncUI(); notify();
    }
  });
})();
