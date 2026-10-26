#!/usr/bin/env python3 -I
"""Genera data/metro-horaris.json a partir del GTFS de TMB (zip).
Només la L9 Sud: sortides a Les Moreres (sentit Zona Univ.) i a Zona Universitària
(sentit Aeroport T1) + temps de trajecte Les Moreres → Zona Universitària.

Ús: python3 -I tools/gtfs_metro.py gtfs.zip data/metro-horaris.json
"""
import csv, io, json, statistics, sys, unicodedata, zipfile, datetime, collections

zf = zipfile.ZipFile(sys.argv[1])
def taula(nom):
    return list(csv.DictReader(io.TextIOWrapper(zf.open(nom), encoding="utf-8-sig")))
norm = lambda s: unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()

rutes = {r["route_id"] for r in taula("routes.txt") if norm(r.get("route_short_name", "")) in ("l9s", "l9 sud")}
if not rutes: sys.exit("No trobo la ruta L9 Sud a routes.txt (revisar route_short_name)")
trips = {t["trip_id"]: t for t in taula("trips.txt") if t["route_id"] in rutes}
stops = {s["stop_id"]: s["stop_name"] for s in taula("stops.txt")}
objectiu = {"moreres": "les moreres", "zonauni": "zona universitaria"}
def quina(stop_id):
    n = norm(stops.get(stop_id, ""))
    return next((k for k, v in objectiu.items() if n.startswith(v)), None)

# service_id -> tipus de dia (a partir del calendar.txt)
tipus = {}
for c in taula("calendar.txt"):
    dies = [c[d] == "1" for d in "monday tuesday wednesday thursday friday saturday sunday".split()]
    if all(dies[:5]): tipus[c["service_id"]] = "feiner"
    elif dies[5] and not any(dies[:5]) : tipus[c["service_id"]] = "dissabte"
    elif dies[6] and not any(dies[:5]): tipus[c["service_id"]] = "diumenge"

per_viatge = collections.defaultdict(list)
for st in taula("stop_times.txt"):
    if st["trip_id"] in trips:
        per_viatge[st["trip_id"]].append((int(st["stop_sequence"]), st))

res = {"moreres": collections.defaultdict(set), "zonauni": collections.defaultdict(set)}
durades = []
def hhmm(t):  # GTFS pot passar de 24h
    h, m, _ = t.split(":"); return f"{int(h) % 24:02d}:{m}"
def segs(t): h, m, s = map(int, t.split(":")); return h * 3600 + m * 60 + s

for tid, parades in per_viatge.items():
    parades.sort(key=lambda x: x[0])
    dia = tipus.get(trips[tid]["service_id"])
    if not dia: continue
    claus = [(quina(s["stop_id"]), s) for _, s in parades]
    idx = {k: i for i, (k, _) in enumerate(claus) if k}
    if "moreres" in idx and "zonauni" in idx:
        if idx["moreres"] < idx["zonauni"]:      # sentit Zona Univ.
            a, b = claus[idx["moreres"]][1], claus[idx["zonauni"]][1]
            res["moreres"][dia].add(hhmm(a["departure_time"]))
            durades.append((segs(b["arrival_time"]) - segs(a["departure_time"])) / 60)
        else:                                      # sentit Aeroport T1
            res["zonauni"][dia].add(hhmm(claus[idx["zonauni"]][1]["departure_time"]))

sortida = {
    "_comentari": "Generat per tools/gtfs_metro.py a partir del GTFS de TMB. No editar a mà.",
    "generat": datetime.date.today().isoformat(),
    "tempsMetroMin": round(statistics.median(durades)) if durades else None,
    "moreres": {d: sorted(res["moreres"][d]) for d in ("feiner", "dissabte", "diumenge")},
    "zonauni": {d: sorted(res["zonauni"][d]) for d in ("feiner", "dissabte", "diumenge")},
}
json.dump(sortida, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
print({k: {d: len(v) for d, v in sortida[k].items()} for k in ("moreres", "zonauni")}, "temps:", sortida["tempsMetroMin"])
