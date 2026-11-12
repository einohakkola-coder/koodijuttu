// Yhteiset UI-apurit molemmille sivuille.

// 4-numeroinen PIN-kenttä: yksi näkymätön input ruutujen päällä
// (toimii mobiilinäppäimistön, liittämisen ja automaattitäytön kanssa).
function Pin(root, { onChange, onComplete } = {}) {
  const input = root.querySelector("input");
  const cells = [...root.querySelectorAll(".cell")];
  let prev = "";

  function render() {
    const v = input.value;
    cells.forEach((c, i) => {
      const ch = v[i] || "";
      if (ch !== (prev[i] || "")) c.innerHTML = ch ? `<span class="d">${ch}</span>` : "";
      c.classList.toggle("active", document.activeElement === input && i === Math.min(v.length, 3) && !(v.length === 4 && i !== 3));
    });
    prev = v;
  }

  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 4);
    root.classList.remove("ok", "err");
    render();
    onChange && onChange(input.value);
    if (input.value.length === 4) onComplete && onComplete(input.value);
  });
  input.addEventListener("focus", render);
  input.addEventListener("blur", render);
  // Kursori aina loppuun
  input.addEventListener("keydown", () => requestAnimationFrame(() => input.setSelectionRange(9, 9)));

  return {
    get value() { return input.value; },
    focus() { input.focus(); },
    clear() { input.value = ""; root.classList.remove("ok", "err"); render(); },
    state(s) { root.classList.remove("ok", "err", "loading"); if (s) root.classList.add(s); },
    shake() { root.classList.remove("shake"); void root.offsetWidth; root.classList.add("shake"); },
    render,
  };
}

// Turvallinen fetch: ei kaadu jos vastaus ei ole JSONia (esim. Vercelin 404-sivu)
async function api(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); }
  catch { throw new Error(r.status === 404 ? "API:a ei löydy (/api/code). Onko api/code.js oikeassa kansiossa?" : "Palvelinvirhe " + r.status); }
  if (!r.ok) throw Object.assign(new Error(j.error || "Virhe"), { status: r.status });
  return j;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Pehmeä siirtymä sivulta toiselle
document.querySelectorAll("nav a").forEach((a) => {
  a.addEventListener("click", (e) => {
    if (a.classList.contains("active")) return e.preventDefault();
    e.preventDefault();
    const nav = a.parentElement;
    nav.dataset.active = [...nav.children].indexOf(a);
    nav.querySelectorAll("a").forEach((x) => x.classList.toggle("active", x === a));
    setTimeout(() => document.body.classList.add("leaving"), 120);
    setTimeout(() => (location.href = a.href), 320);
  });
});
// Takaisin-napilla palatessa poistetaan leaving-tila
const navEl = document.querySelector("nav");
const navHome = navEl && navEl.dataset.active;
window.addEventListener("pageshow", () => {
  document.body.classList.remove("leaving");
  if (!navEl) return;
  navEl.dataset.active = navHome;
  navEl.querySelectorAll("a").forEach((x, i) => x.classList.toggle("active", String(i) === navHome));
});
