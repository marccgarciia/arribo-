# El Prat ⇄ Igualada

Web estàtica (HTML/CSS/JS sense compilació) + Cloudflare Worker. Provar en local: `python3 -m http.server` i obrir `http://localhost:8000`. Tests: `npm test`.

## Estat
| Part | Estat |
|---|---|
| Autocars (`data/autocars.json`) | Fet. Extret del PDF amb `tools/extreu_pdf.py` + `tools/genera_autocars.py`; notes aplicades com a regles de dades |
| Calendari (`data/calendari.json`) | 2026 verificat (DOGC / decret d'alcaldia). **2027 provisional** |
| Interfície, connexions, PWA | Fet |
| Worker (`worker/`) | Desplegat i funcionant (`/metro`, `/alertes`). iMetro retorna `propers_trens: []` a la L9S en les proves; TMB no documenta cap API d'alertes: només `data/avisos.json` |
| Horari de metro (`data/metro-horaris.json`) | Generat del GTFS (L9S: dl–dj, dv, ds, dg/festius) |

## Què has de fer tu
1. **TMB**: compte a developer.tmb.cat → aplicació → `app_id` / `app_key`. A la documentació, mira els codis d'estació de Les Moreres i Zona Universitària (L9S).
2. **Worker**: omple `worker/wrangler.toml` (`ORIGEN_PERMES`, `CODI_MORERES`, `CODI_ZONAUNI`), i:
   ```
   cd worker && npx wrangler login
   npx wrangler secret put TMB_APP_ID
   npx wrangler secret put TMB_APP_KEY
   npx wrangler deploy
   ```
   Comprova `…workers.dev/crua?estacio=moreres`: si l'estructura no coincideix amb `trensL9S()` a `worker/index.js`, ajusta-la. Esborra la ruta `/crua` quan acabis. Després posa l'URL del Worker a `workerUrl` de `config.js`.
3. **GitHub**: crea el repositori, activa Pages (branca `main`, carpeta arrel), afegeix els secrets `TMB_APP_ID`, `TMB_APP_KEY` i la variable `TMB_GTFS_URL`; llança un cop l'Action «Actualitza horaris de metro» a mà.

## Manteniment
- Nou PDF de Monbus: `python3 -I tools/extreu_pdf.py data/font/<pdf> tools/brut.json && python3 -I tools/genera_autocars.py tools/brut.json data/autocars.json` (revisar les llegendes a `genera_autocars.py` si canvien les notes).
- Cada any: `data/calendari.json` (festius, Setmana Santa, períodes no lectius).
- Vagues o incidències de Monbus: `data/avisos.json` → `[{"text": "…", "fins": "2026-11-30"}]`.

## Supòsits a revisar
- `transbordamentMin: 8` i `tempsMetroMin: 17` (aproximat; el GTFS el substitueix).
- Períodes no lectius per defecte (Nadal 23/12–07/01, Setmana Santa, estiu): ajusta'ls al teu calendari.
- «Setmana Santa» = dilluns sant → dilluns de Pasqua.
- `mostrarNomesEstacio: true` a `config.js` (pendent de confirmar).
- Sense icones PNG: la icona és SVG (iOS pot demanar un PNG per a la pantalla d'inici).
