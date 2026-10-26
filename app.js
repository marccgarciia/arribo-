import cfg from "./config.js";
import { ara, contextDia, expedicionsAvui, resumDia, aHHMM, aMinuts } from "./js/dia.js";
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

const aMin = h => { const [x, y] = h.split(":"); return +x * 60 + +y; };
const etiquetaBus = b => `<span class="pill ${b.tipus}">${b.tipus === "expres" ? "Exprés" : "Para als pobles"}</span>`;
const pas = (icona, hora, text, extra = "") => `<li><span class="dot">${icona}</span><div><b>${hora}</b> ${text}${extra}</div></li>`;
const marge = o => o.just ? `<div class="just">Connexió justa · ${o.marge} min de marge</div>` : `<div class="nota">${o.marge} min de marge</div>`;

function pintaAnada(ctx, tempsMetro) {
  const buses = expedicionsAvui(estat.dades.autocars, "anada", ctx);
  const trens = estat.metro.moreres.trens.filter(t => t.min >= ctx.min + cfg.caminarCasaMin);   // temps de caminar fins a l'andana
  const files = calculaAnada({ trens: trens.slice(0, cfg.opcions), buses, cfg, tempsMetro });
  if (!files.length) return `<p class="buit">No hi ha més metros avui des de Les Moreres.</p>`;
  return files.map(o => {
    const uni = o.bus ? aHHMM(o.arribada + cfg.caminarUniMin) : "—";
    return `<article class="opcio${o.recomanat ? " rec" : ""}">
      <div class="cap">
        <div><div class="gran">${aHHMM(o.tren.min)}</div><div class="sub">Metro a Les Moreres · ${compte(o.tren.min - ctx.min)}</div></div>
        <div class="dest"><div class="sub">Arribes a la uni</div><div class="gran">${uni}</div></div>
      </div>
      ${o.recomanat ? `<div class="rec-tag">Arribes abans</div>` : ""}
      <ul class="tl">
        ${pas("🚶", aHHMM(o.tren.min - cfg.caminarCasaMin), "Surt de casa", `<span class="nota"> · ${cfg.caminarCasaMin} min caminant</span>`)}
        ${pas("🚇", aHHMM(o.tren.min), "Metro L9 Sud · Les Moreres", `<span class="nota"> → Zona Univ. ${aHHMM(o.arrZU)}</span>`)}
        ${o.bus ? `${pas("🚌", o.bus.sortida, `Autocar Av. Diagonal ${etiquetaBus(o.bus)}`, marge(o))}
        ${pas("📍", o.bus.arribada, "Igualada · Estació d'Autobusos")}
        ${pas("🎓", uni, "Arribes a la uni", `<span class="nota"> · ${cfg.caminarUniMin} min caminant</span>`)}`
        : `<li><span class="dot">✕</span><div>Cap autocar més avui.</div></li>`}
      </ul>
      ${o.expres ? `<div class="alt">Exprés següent: <b>${o.expres.sortida}</b> → uni <b>${aHHMM(aMinuts(o.expres.arribada) + cfg.caminarUniMin)}</b></div>` : ""}
    </article>`;
  }).join("");
}

function pintaTornada(ctx, tempsMetro) {
  const buses = expedicionsAvui(estat.dades.autocars, "tornada", ctx, { mostrarNomesEstacio: cfg.mostrarNomesEstacio });
  const zu = estat.metro.zonauni;
  const ara = ctx.min + cfg.caminarUniMin;      // temps de caminar fins a la parada de l'autocar
  const files = calculaTornada({ buses, ara, metroTR: zu.tempsReal ? zu.trens : null,
    metroPrev: trensPrevistos(estat.dades.horaris, "zonauni", ctx.dia, ctx.min, ctx.dow), cfg, tempsMetro });
  if (!files.length) return `<p class="buit">No hi ha més autocars avui des d'Igualada.</p>`;
  return files.map(o => {
    const m = o.metros[0];
    const casa = m ? aHHMM(m.arribada + cfg.caminarCasaMin) : "—";
    return `<article class="opcio${o.recomanat ? " rec" : ""}">
      <div class="cap">
        <div><div class="gran">${o.bus.sortida}</div><div class="sub">${o.bus.nomesEstacio ? "Estació d'Autobusos" : "Pg. Verdaguer"} · ${compte(aMin(o.bus.sortida) - ctx.min)}</div></div>
        <div class="dest"><div class="sub">Arribes a casa</div><div class="gran">${casa}</div></div>
      </div>
      ${o.recomanat ? `<div class="rec-tag">Arribes abans</div>` : ""}
      <ul class="tl">
        ${pas("🚌", o.bus.sortida, `Autocar ${etiquetaBus(o.bus)}`, o.bus.nomesEstacio ? `<div class="nota">Surt només de l'Estació d'Autobusos</div>` : "")}
        ${pas("📍", aHHMM(o.arrZU), "Zona Univ. (Av. Diagonal)")}
        ${m ? `${pas("🚇", aHHMM(m.min), "Metro L9 Sud", `<span class="nota"> → Les Moreres ${aHHMM(m.arribada)}</span>` + (o.tempsReal ? `<span class="nota"> · temps real</span>` : "") + marge(o))}
        ${pas("🏠", casa, "Arribes a casa", `<span class="nota"> · ${cfg.caminarCasaMin} min caminant</span>`)}`
        : `<li><span class="dot">?</span><div class="nota">Sense dades de metro per a aquesta hora.</div></li>`}
      </ul>
    </article>`;
  }).join("");
}

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
