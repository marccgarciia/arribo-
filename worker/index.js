// Cloudflare Worker: proxy de l'API de TMB amb memòria cau curta. Secrets: TMB_APP_ID, TMB_APP_KEY.
// La ruta d'iMetro ve de la documentació de developer.tmb.cat; els codis d'estació (CODI_*) es posen a wrangler.toml.
// Respostes:  /metro   → { trens: [{ ts: <epoch ms>, desti }] }   /alertes → { alertes: [{ text }] }
// /crua?estacio=moreres|zonauni retorna la resposta tal qual de TMB per ajustar el parsing.

const CACHE_S = 25;

const cors = (env, req) => {
  const origen = req.headers.get("Origin");
  const ok = origen && (origen === env.ORIGEN_PERMES || /^http:\/\/localhost(:\d+)?$/.test(origen));
  return ok ? { "Access-Control-Allow-Origin": origen, "Vary": "Origin" } : {};
};
const resposta = (obj, env, req, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_S}`, ...cors(env, req) },
});

async function tmb(env, path, params = {}) {
  const u = new URL(env.TMB_BASE + path);
  for (const [k, v] of Object.entries({ ...params, app_id: env.TMB_APP_ID, app_key: env.TMB_APP_KEY })) u.searchParams.set(k, v);
  const r = await fetch(u, { cf: { cacheTtl: CACHE_S, cacheEverything: true } });
  if (!r.ok) throw new Error(`TMB ${r.status}`);
  return r.json();
}

// Format iMetro (documentat a developer.tmb.cat): linies[].estacions[].linies_trajectes[].propers_trens[]
// amb temps_arribada (epoch ms) i desti_trajecte. Es filtra la L9 Sud pel nom de línia i el sentit pel destí.
function trensL9S(json, estacio) {
  const trens = [];
  for (const l of json.linies || []) {
    if (!/^L?\s*9\s*(S|SUD)$/i.test(String(l.nom_linia || "").trim())) continue;
    for (const e of l.estacions || [])
      for (const t of e.linies_trajectes || []) {
        const aZU = /zona\s*univ/i.test(t.desti_trajecte || "");
        // Les Moreres → només sentit Zona Univ.; Zona Univ. → només cap a l'Aeroport (T1)
        if (estacio === "moreres" ? !aZU : aZU) continue;
        for (const p of t.propers_trens || []) trens.push({ ts: p.temps_arribada, desti: t.desti_trajecte });
      }
  }
  return trens.sort((a, b) => a.ts - b.ts);
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors(env, req), "Access-Control-Allow-Methods": "GET" } });
    const url = new URL(req.url);
    try {
      if (url.pathname === "/metro") {
        const est = url.searchParams.get("estacio");
        const codi = { moreres: env.CODI_MORERES, zonauni: env.CODI_ZONAUNI }[est];
        if (!codi) return resposta({ error: "estacio desconeguda o sense codi configurat" }, env, req, 400);
        const json = await tmb(env, env.TMB_IMETRO_PATH, { estacions: codi });
        return resposta({ trens: trensL9S(json, est) }, env, req);
      }
      if (url.pathname === "/alertes") {
        // La documentació de l'API de TMB no inclou cap servei d'alertes: de moment només s'usa data/avisos.json.
        return resposta({ alertes: [] }, env, req);
      }
      if (url.pathname === "/crua") {   // només per posar a punt el Worker
        const est = url.searchParams.get("estacio");
        return resposta(await tmb(env, env.TMB_IMETRO_PATH, { estacions: { moreres: env.CODI_MORERES, zonauni: env.CODI_ZONAUNI }[est] }), env, req);
      }
      return resposta({ error: "no trobat" }, env, req, 404);
    } catch (e) {
      return resposta({ error: String(e.message || e) }, env, req, 502);
    }
  },
};
