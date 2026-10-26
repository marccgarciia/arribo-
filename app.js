import cfg from "./config.js";
import { ara, contextDia, expedicionsAvui, resumDia, aHHMM } from "./js/dia.js";
import { calculaAnada, calculaTornada, trensPrevistos } from "./js/connexions.js";

const $ = s => document.querySelector(s);
const json = async url => (await fetch(url, { cache: "no-cache" })).json();
const ambTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

const estat = { sentit: ara().min < 12 * 60 ? "anada" : "tornada", dades: null, metro: {}, alertes: [] };

async function carregaEstatiques() {
  const [autocars, cal, avisos, horaris] = await Promise.all([
    json("data/autocars.json"), json("data/calendari.json"),
    json("data/avisos.json").catch(() => []), json("data/metro-horaris.json").catch(() => null),
  ]);
  estat.dades = { autocars, cal, avisos, horaris };
}

/** Metro d'una estació: temps real via Worker (≤ timeout) o, si falla, horari previst. */
async function carregaMetro(estacio, ctx) {
  const { horaris } = estat.dades;
  if (cfg.workerUrl) {
    try {
      const r = await ambTimeout(fetch(`${cfg.workerUrl}/metro?estacio=${estacio}`), cfg.timeoutApiMs);
      if (!r.ok) throw new Error(r.status);
      const { trens } = await r.json();
      const reals = trens.map(t => ({ min: ara(new Date(t.ts)).min })).filter(t => t.min >= ctx.min - 1).sort((a, b) => a.min - b.min);
      if (reals.length) return { tempsReal: true, trens: reals };   // si TMB no dona trens, cau a l'horari previst
    } catch { /* cau a l'horari previst */ }
  }
  return { tempsReal: false, trens: trensPrevistos(horaris, estacio, ctx.dia, ctx.min, ctx.dow) };
}

async function carregaAlertes() {
  const manuals = estat.dades.avisos.filter(a => !a.fins || a.fins >= ara().iso).map(a => a.text);
  let tmb = [];
  if (cfg.workerUrl) {
    try {
      const r = await ambTimeout(fetch(`${cfg.workerUrl}/alertes`), cfg.timeoutApiMs);
      tmb = (await r.json()).alertes.map(a => a.text);
    } catch { /* sense alertes de TMB */ }
  }
  estat.alertes = [...manuals, ...tmb];
}

const compte = min => { const d = Math.round(min); return d <= 0 ? "ara" : d < 60 ? `en ${d} min` : `en ${Math.floor(d / 60)} h ${d % 60} min`; };
const badgeBus = b => `<span class="badge ${b.tipus}">${b.tipus === "expres" ? "Exprés" : "Para als pobles"}</span>`;

function pintaAnada(ctx, tempsMetro) {
  const buses = expedicionsAvui(estat.dades.autocars, "anada", ctx);
  const { trens } = estat.metro.moreres;
  const files = calculaAnada({ trens: trens.slice(0, cfg.opcions), buses, cfg, tempsMetro });
  if (!files.length) return `<p class="buit">No hi ha més metros avui des de Les Moreres.</p>`;
  return files.map(o => `
    <article class="opcio${o.recomanat ? " rec" : ""}">
      <div class="fila"><span class="badge l9">L9 Sud</span><span class="hora">${aHHMM(o.tren.min)}</span>
        <span class="compte">Les Moreres · ${compte(o.tren.min - ctx.min)}</span>${o.recomanat ? `<span class="rec-tag">★ Recomanat</span>` : ""}</div>
      <div class="pas">Arribes a Zona Univ. <b>${aHHMM(o.arrZU)}</b></div>
      ${o.bus ? `
      <div class="pas">${badgeBus(o.bus)} Autocar <b>${o.bus.sortida}</b> (Av. Diagonal) → Igualada <b>${o.bus.arribada}</b>
        ${o.just ? `<br><span class="just">Connexió justa (${o.marge} min de marge)</span>` : `<br><span class="nota">${o.marge} min de marge</span>`}</div>
      ${o.expres ? `<div class="pas">${badgeBus(o.expres)} Exprés següent <b>${o.expres.sortida}</b> → Igualada <b>${o.expres.arribada}</b></div>` : ""}`
      : `<div class="pas">Cap autocar més avui.</div>`}
    </article>`).join("");
}

function pintaTornada(ctx, tempsMetro) {
  const buses = expedicionsAvui(estat.dades.autocars, "tornada", ctx, { mostrarNomesEstacio: cfg.mostrarNomesEstacio });
  const zu = estat.metro.zonauni;
  const files = calculaTornada({ buses, ara: ctx.min, metroTR: zu.tempsReal ? zu.trens : null,
    metroPrev: trensPrevistos(estat.dades.horaris, "zonauni", ctx.dia, ctx.min, ctx.dow), cfg, tempsMetro });
  if (!files.length) return `<p class="buit">No hi ha més autocars avui des d'Igualada.</p>`;
  return files.map(o => `
    <article class="opcio${o.recomanat ? " rec" : ""}">
      <div class="fila">${badgeBus(o.bus)}<span class="hora">${o.bus.sortida}</span>
        <span class="compte">${o.bus.nomesEstacio ? "Estació d'Autobusos" : "Pg. Verdaguer"} · ${compte(aMin(o.bus.sortida) - ctx.min)}</span>${o.recomanat ? `<span class="rec-tag">★ Recomanat</span>` : ""}</div>
      ${o.bus.nomesEstacio ? `<div class="nota">Surt només de l'Estació d'Autobusos</div>` : ""}
      <div class="pas">Arribes a Zona Univ. <b>${aHHMM(o.arrZU)}</b></div>
      ${o.metros.length ? o.metros.map((m, i) => `<div class="pas"><span class="badge l9">L9 Sud</span> Metro <b>${aHHMM(m.min)}</b> → Les Moreres <b>${aHHMM(m.arribada)}</b>
        ${i === 0 ? (o.just ? `<br><span class="just">Connexió justa (${o.marge} min de marge)</span>` : `<br><span class="nota">${o.marge} min de marge${o.tempsReal ? " · temps real" : " · horari previst"}</span>`) : ""}</div>`).join("")
        : `<div class="pas nota">Sense dades de metro per a aquesta hora.</div>`}
    </article>`).join("");
}
const aMin = h => { const [a, b] = h.split(":"); return +a * 60 + +b; };

async function refresca() {
  if (!estat.dades) return;
  const ctx = contextDia(new Date(), estat.dades.cal);
  const horaris = estat.dades.horaris;
  const tempsMetro = horaris?.tempsMetroMin ?? cfg.tempsMetroMin;
  const [moreres, zonauni] = await Promise.all([carregaMetro("moreres", ctx), carregaMetro("zonauni", ctx)]);
  estat.metro = { moreres, zonauni };
  await carregaAlertes();

  const r = resumDia(ctx);
  $("#resum").textContent = r.text + (r.avisos.length ? " · " + r.avisos.join(" · ") : "");
  const avisos = [...estat.alertes];
  if (!ctx.anyVerificat) avisos.push("El calendari de festius d'aquest any encara no està verificat.");
  $("#avisos").innerHTML = avisos.map(a => `<p class="avis"></p>`).join("");
  document.querySelectorAll("#avisos .avis").forEach((el, i) => { el.textContent = avisos[i]; });

  document.querySelectorAll(".pestanyes button").forEach(b => b.setAttribute("aria-selected", b.dataset.sentit === estat.sentit));
  $("#llista").innerHTML = estat.sentit === "anada" ? pintaAnada(ctx, tempsMetro) : pintaTornada(ctx, tempsMetro);
  const tr = (estat.sentit === "anada" ? moreres : zonauni).tempsReal;
  $("#origen").textContent = tr ? "Metro: temps real TMB" : "Metro: horari previst (sense temps real)";
}

document.querySelectorAll(".pestanyes button").forEach(b => b.addEventListener("click", () => { estat.sentit = b.dataset.sentit; refresca(); }));
let timer;
const engega = () => { clearInterval(timer); timer = setInterval(refresca, cfg.refrescMs); };
document.addEventListener("visibilitychange", () => { if (document.hidden) clearInterval(timer); else { refresca(); engega(); } });

carregaEstatiques().then(() => { refresca(); engega(); })
  .catch(() => { $("#llista").innerHTML = `<p class="buit">No s'han pogut carregar les dades.</p>`; });
