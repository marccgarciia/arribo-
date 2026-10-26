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

# service_id -> tipus de dia. TMB defineix els serveis a calendar_dates.txt (dates concretes):
# es classifiquen pel dia de la setmana dominant. Dl–Dj = feiner, Dv = divendres (horari propi), Ds, Dg/festius.
dates = collections.defaultdict(collections.Counter)
for r in taula("calendar_dates.txt"):
    if r["exception_type"] == "1":
        dates[r["service_id"]][datetime.datetime.strptime(r["date"], "%Y%m%d").weekday()] += 1
tipus = {}
for sid, c in dates.items():
    wd = c.most_common(1)[0][0]            # 0=dilluns … 6=diumenge
    tipus[sid] = "feiner" if wd <= 3 else "divendres" if wd == 4 else "dissabte" if wd == 5 else "diumenge"

per_viatge = collections.defaultdict(list)
for st in taula("stop_times.txt"):
    if st["trip_id"] in trips:
        per_viatge[st["trip_id"]].append((int(st["stop_sequence"]), st))

res = {"moreres": collections.defaultdict(set), "zonauni": collections.defaultdict(set)}
durades = []
def hhmm(t):  # els trens passada la mitjanit (>= 24:00) es descarten: pertanyen al dia anterior
    h, m, _ = t.split(":"); return f"{int(h):02d}:{m}" if int(h) < 24 else None
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
            if hhmm(a["departure_time"]): res["moreres"][dia].add(hhmm(a["departure_time"]))
            durades.append((segs(b["arrival_time"]) - segs(a["departure_time"])) / 60)
        else:                                      # sentit Aeroport T1
            h = hhmm(claus[idx["zonauni"]][1]["departure_time"])
            if h: res["zonauni"][dia].add(h)

sortida = {
    "_comentari": "Generat per tools/gtfs_metro.py a partir del GTFS de TMB. No editar a mà.",
    "generat": datetime.date.today().isoformat(),
    "tempsMetroMin": round(statistics.median(durades)) if durades else None,
    "moreres": {d: sorted(res["moreres"][d]) for d in ("feiner", "divendres", "dissabte", "diumenge")},
    "zonauni": {d: sorted(res["zonauni"][d]) for d in ("feiner", "divendres", "dissabte", "diumenge")},
}
json.dump(sortida, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
print({k: {d: len(v) for d, v in sortida[k].items()} for k in ("moreres", "zonauni")}, "temps:", sortida["tempsMetroMin"])
