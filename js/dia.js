// Lògica del dia: tipus de dia, períodes especials i filtre d'expedicions per regles.
// Mòdul pur (sense DOM) perquè es pugui provar amb `node --test`.

const pad = n => String(n).padStart(2, "0");

/** Data/hora a Europe/Madrid → {iso:"YYYY-MM-DD", mmdd, dow(0=dg), min (minuts des de mitjanit)} */
export function ara(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(x => [x.type, x.value]));
  const iso = `${p.year}-${p.month}-${p.day}`;
  const dow = new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay();
  return { iso, mmdd: `${p.month}-${p.day}`, dow, min: +p.hour * 60 + +p.minute + +p.second / 60 };
}

export const aMinuts = hhmm => { const [h, m] = hhmm.split(":"); return +h * 60 + +m; };
export const aHHMM = min => { const m = Math.round(min); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; };

const dinsRang = (iso, [a, b]) => iso >= a && iso <= b;

export function periodesActius(iso, cal) {
  const mmdd = iso.slice(5), actius = new Set();
  for (const [id, p] of Object.entries(cal.periodes)) {
    if ((p.recurrent || []).some(r => mmdd >= r[0] && mmdd <= r[1])) actius.add(id);
    if ((p.dates || []).includes(iso)) actius.add(id);
    if ((p.rangs || []).some(r => dinsRang(iso, r))) actius.add(id);
  }
  return actius;
}

/** "feiner" | "dissabte" | "diumenge" | "festiuBCN" */
export function tipusDia(iso, dow, cal) {
  if (cal.festius.barcelona.some(f => f.data === iso)) return "festiuBCN";
  if (dow === 0 || cal.festius.catalunya.includes(iso)) return "diumenge";
  if (dow === 6) return "dissabte";
  return "feiner";
}

export function contextDia(date, cal) {
  const t = ara(date);
  const dia = tipusDia(t.iso, t.dow, cal);
  const periodes = periodesActius(t.iso, cal);
  const noLectiu = cal.noLectius.find(r => dinsRang(t.iso, r.rang));
  const lectiu = dia === "feiner" && !noLectiu;
  const festiuLocal = cal.festius.barcelona.find(f => f.data === t.iso);
  return { ...t, dia, periodes, lectiu, noLectiu, festiuLocal, anyVerificat: cal.anysVerificats.includes(+t.iso.slice(0, 4)) };
}

/** Aplica les regles d'una expedició (data/autocars.json) al context del dia. */
export function expedicioValida(e, ctx) {
  if (e.dia !== ctx.dia) return false;
  const r = e.regles || {};
  if ((r.excepte || []).some(p => ctx.periodes.has(p))) return false;
  if (r.nomes && !r.nomes.some(p => ctx.periodes.has(p))) return false;
  if (r.lectiu && !ctx.lectiu) return false;
  return true;
}

export function expedicionsAvui(autocars, sentit, ctx, { mostrarNomesEstacio = true } = {}) {
  return autocars.expedicions
    .filter(e => e.sentit === sentit && expedicioValida(e, ctx) && (mostrarNomesEstacio || !e.nomesEstacio))
    .sort((a, b) => aMinuts(a.sortida) - aMinuts(b.sortida));
}

const NOMS_DIA = { feiner: "horari de feiners", dissabte: "horari de dissabtes", diumenge: "horari de diumenges i festius", festiuBCN: "horari de festius locals" };
const DIES = ["diumenge", "dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte"];

/** Línia resum de dalt: «Avui: festiu local a Barcelona · horari de festius locals» */
export function resumDia(ctx) {
  const parts = [];
  if (ctx.festiuLocal) parts.push(`festiu local a Barcelona (${ctx.festiuLocal.nom})`);
  else parts.push(DIES[ctx.dow]);
  parts.push(NOMS_DIA[ctx.dia]);
  const avisos = [];
  if (ctx.periodes.has("agost")) avisos.push("Agost · alguns exprés no circulen");
  if (ctx.periodes.has("nadal2631")) avisos.push("26–31 de desembre · servei reduït");
  if (ctx.periodes.has("dijousSant")) avisos.push("Dijous Sant · servei especial");
  else if (ctx.periodes.has("setmanaSanta")) avisos.push("Setmana Santa · alguns serveis no circulen");
  if (ctx.periodes.has("estiu") && !ctx.periodes.has("agost")) avisos.push("Estiu · alguns serveis no circulen");
  if (ctx.dia === "feiner" && !ctx.lectiu) avisos.push("dia no lectiu");
  return { text: "Avui: " + parts.join(" · "), avisos };
}
