import test from "node:test";
import assert from "node:assert/strict";
import { calculaAnada, calculaTornada } from "../js/connexions.js";

const cfg = { transbordamentMin: 8, margeJustMin: 3, opcions: 4, tempsRealSiMenysDe: 30 };
const bus = (sortida, arribada, tipus = "pobles") => ({ sortida, arribada, tipus });

test("anada: primer autocar vàlid, exprés alternatiu i recomanat", () => {
  const r = calculaAnada({ trens: [{ min: 6 * 60 }, { min: 6 * 60 + 10 }], tempsMetro: 17, cfg,
    buses: [bus("06:19", "07:05", "expres"), bus("06:30", "07:50"), bus("07:00", "07:45", "expres")] });
  // tren 06:00 → ZU 06:17 + 8 = 06:25 → bus 06:30 (pobles), exprés alternatiu 07:00
  assert.equal(r[0].bus.sortida, "06:30"); assert.equal(r[0].expres.sortida, "07:00"); assert.equal(r[0].marge, 5);
  assert.equal(r[1].bus.sortida, "07:00");
  assert.ok(r[1].recomanat && !r[0].recomanat);   // arriba a les 07:45 vs 07:50
});

test("anada: connexió justa < 3 min", () => {
  const r = calculaAnada({ trens: [{ min: 360 }], tempsMetro: 17, cfg, buses: [bus("06:26", "07:10")] });
  assert.equal(r[0].marge, 1); assert.ok(r[0].just);
});

test("tornada: metro després de l'arribada + transbordament", () => {
  const r = calculaTornada({ buses: [bus("12:00", "13:00")], ara: 11 * 60 + 50, tempsMetro: 17, cfg,
    metroTR: null, metroPrev: [{ min: 13 * 60 + 5 }, { min: 13 * 60 + 12 }, { min: 13 * 60 + 20 }] });
  assert.equal(r[0].metros[0].min, 13 * 60 + 12);       // 13:00 + 8 = 13:08 → 13:12
  assert.equal(r[0].metros[0].arribada, 13 * 60 + 29);
  assert.equal(r[0].tempsReal, false);
});
