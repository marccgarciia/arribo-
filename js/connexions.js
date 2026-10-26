// Càlcul de connexions metro ⇄ autocar. Tot en minuts des de mitjanit (hora local).
import { aMinuts, aHHMM } from "./dia.js";

const primer = (llista, min) => llista.find(e => aMinuts(e.sortida) >= min);

/** trens: [{min}] sortides del metro a Les Moreres (ja ordenades, >= ara). */
export function calculaAnada({ trens, buses, cfg, tempsMetro }) {
  const out = [];
  for (const t of trens) {
    const arrZU = t.min + tempsMetro;
    const llest = arrZU + cfg.transbordamentMin;
    const bus = primer(buses, llest);
    const expres = primer(buses.filter(b => b.tipus === "expres"), llest);
    if (!bus) { out.push({ tren: t, arrZU, bus: null }); continue; }
    out.push({
      tren: t, arrZU, bus, marge: aMinuts(bus.sortida) - llest,
      expres: expres && expres !== bus ? expres : null,
      arribada: aMinuts(bus.arribada),
    });
  }
  const valides = out.filter(o => o.bus);
  if (valides.length) {
    const millor = valides.reduce((a, b) => (b.arribada < a.arribada ? b : a));
    millor.recomanat = true;
  }
  for (const o of out) o.just = !!o.bus && o.marge < cfg.margeJustMin;
  return out;
}

/** metroAra: {trens:[{min}], temps_real:boolean} i metroPrevist: [{min}] (llistes de Zona Univ. → Aeroport) */
export function calculaTornada({ buses, ara, metroTR, metroPrev, cfg, tempsMetro }) {
  const out = [];
  for (const b of buses.filter(b => aMinuts(b.sortida) >= ara).slice(0, cfg.opcions)) {
    const arrZU = aMinuts(b.arribada);
    const llest = arrZU + cfg.transbordamentMin;
    const usaTR = metroTR && metroTR.length && arrZU - ara < cfg.tempsRealSiMenysDe;
    const font = usaTR ? metroTR : metroPrev;
    const metros = font.filter(t => t.min >= llest).slice(0, 2);
    out.push({
      bus: b, arrZU, tempsReal: !!usaTR,
      metros: metros.map(m => ({ ...m, arribada: m.min + tempsMetro })),
      marge: metros[0] ? metros[0].min - llest : null,
    });
  }
  const valides = out.filter(o => o.metros[0]);
  if (valides.length) valides.reduce((a, b) => (b.metros[0].arribada < a.metros[0].arribada ? b : a)).recomanat = true;
  for (const o of out) o.just = o.marge !== null && o.marge < cfg.margeJustMin;
  return out;
}

/** Trens previstos (GTFS) per a un dia i estació: ["05:12",...] → [{min}] a partir de `ara` (minuts). */
export function trensPrevistos(horaris, estacio, dia, ara, dow) {
  // Festius → horari de diumenge; els divendres tenen horari propi (si el GTFS el distingeix)
  const clau = dia === "festiuBCN" ? "diumenge" : dia === "feiner" && dow === 5 ? "divendres" : dia;
  const llista = horaris?.[estacio]?.[clau]?.length ? horaris[estacio][clau] : horaris?.[estacio]?.[dia === "festiuBCN" ? "diumenge" : dia] || [];
  return llista.map(aMinuts).filter(m => m >= ara).sort((a, b) => a - b).map(min => ({ min }));
}
export { aHHMM };
