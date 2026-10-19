(() => {
  "use strict";
  // reading progress
  const bar = document.getElementById("progress");
  const doc = document.querySelector(".doc");
  const onScroll = () => {
    if (!bar || !doc) return;
    const r = doc.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
    bar.style.width = (p * 100).toFixed(2) + "%";
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // highlight the section being read
  const links = [...document.querySelectorAll(".toc a")];
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const targets = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  let current = null;
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      const a = byId.get(e.target.id);
      if (a && a !== current) {
        current && current.classList.remove("is-on");
        a.classList.add("is-on");
        current = a;
        const toc = document.querySelector(".toc");
        if (toc && getComputedStyle(toc).position === "sticky") {
          const t = a.offsetTop - toc.clientHeight / 2;
          toc.scrollTo({ top: t, behavior: "smooth" });
        }
      }
    }
  }, { rootMargin: "-70px 0px -70% 0px" });
  targets.forEach((t) => io.observe(t));

  // on small screens the contents start closed
  const box = document.querySelector(".toc-box");
  if (box && matchMedia("(max-width: 1000px)").matches) box.open = false;
  links.forEach((a) => a.addEventListener("click", () => { if (box && matchMedia("(max-width: 1000px)").matches) box.open = false; }));

  // cite
  const BIB = `@mastersthesis{montierth2027fle,
  title  = {Frequency Lock Encoding},
  author = {Montierth, Joshua},
  school = {Brigham Young University},
  type   = {M.S. thesis},
  year   = {2027}
}`;
  const btn = document.getElementById("cite-btn"), st = document.getElementById("cite-status");
  if (btn) btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(BIB); st.textContent = "BibTeX copied."; }
    catch { st.textContent = ""; const pre = document.createElement("pre"); pre.className = "bib-pre"; pre.textContent = BIB; btn.parentElement.after(pre); }
  });
})();
