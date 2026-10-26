import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contextDia, expedicioValida, expedicionsAvui, resumDia, dataLlarga } from "../js/dia.js";

const cal = JSON.parse(readFileSync(new URL("../data/calendari.json", import.meta.url)));
const bus = JSON.parse(readFileSync(new URL("../data/autocars.json", import.meta.url)));
const ctx = d => contextDia(new Date(d + "T12:00:00Z"), cal);   // migdia UTC = mateix dia a Madrid
const exp = (sentit, sortida, tipus, dia) => bus.expedicions.find(e => e.sentit === sentit && e.sortida === sortida && e.dia === dia && (!tipus || e.tipus === tipus));

test("dimarts normal: feiner i lectiu", () => {
  const c = ctx("2026-11-03");
  assert.equal(c.dia, "feiner"); assert.ok(c.lectiu);
  assert.ok(expedicioValida(exp("anada", "06:19", "expres", "feiner"), c));       // e5 sense nota
  assert.ok(expedicioValida(exp("anada", "09:24", "pobles", "feiner"), c));       // nota (2)
  assert.ok(!expedicioValida(exp("anada", "11:34", "pobles", "feiner"), c));      // nota (5): només ag./Nadal/Dj. Sant
});

test("dissabte i diumenge", () => {
  assert.equal(ctx("2026-11-07").dia, "dissabte");
  assert.equal(ctx("2026-11-08").dia, "diumenge");
  assert.ok(expedicionsAvui(bus, "anada", ctx("2026-11-07"), {}).length > 5);
});

test("24 de setembre: festiu local de Barcelona", () => {
  const c = ctx("2026-09-24");
  assert.equal(c.dia, "festiuBCN");
  assert.match(resumDia(c).text, /festiu local a Barcelona/);
  assert.ok(expedicionsAvui(bus, "tornada", c, {}).length > 20);
});

test("dia d'agost: l'e5 sense nota no circula, (5) sí", () => {
  const c = ctx("2026-08-12");
  assert.equal(c.dia, "feiner"); assert.ok(c.periodes.has("agost")); assert.ok(!c.lectiu);
  assert.ok(!expedicioValida(exp("anada", "06:19", "expres", "feiner"), c));
  assert.ok(expedicioValida(exp("anada", "11:34", "pobles", "feiner"), c));
  assert.ok(!expedicioValida(exp("anada", "09:24", "pobles", "feiner"), c));
});

test("28 de desembre: (2) no circula, (5) sí; no lectiu", () => {
  const c = ctx("2026-12-28");
  assert.ok(c.periodes.has("nadal2631")); assert.ok(!c.lectiu);
  assert.ok(!expedicioValida(exp("anada", "09:24", "pobles", "feiner"), c));
  assert.ok(expedicioValida(exp("anada", "11:34", "pobles", "feiner"), c));
});

test("Dijous Sant 2026: (2) i (3) no circulen, (5) sí", () => {
  const c = ctx("2026-04-02");
  assert.ok(c.periodes.has("dijousSant")); assert.ok(c.periodes.has("setmanaSanta"));
  assert.ok(!expedicioValida(exp("anada", "09:24", "pobles", "feiner"), c));
  assert.ok(expedicioValida(exp("anada", "11:34", "pobles", "feiner"), c));
});

test("dia lectiu només per a notes (7)/(8)", () => {
  const e = bus.expedicions.find(x => x.regles.lectiu);
  assert.ok(expedicioValida(e, ctx("2026-11-03")));
  assert.ok(!expedicioValida(e, ctx("2026-12-29")));
});

test("data llarga en català", () => {
  assert.equal(dataLlarga(ctx("2026-10-26")), "dilluns 26 d'octubre");
  assert.equal(dataLlarga(ctx("2026-11-03")), "dimarts 3 de novembre");
  assert.equal(resumDia(ctx("2026-11-03")).text, "Avui: dimarts 3 de novembre · horari de feiners");
});
