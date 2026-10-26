#!/usr/bin/env python3 -I
"""Extreu del PDF de Monbus (v210126) les files que ens interessen i les deixa
en un JSON intermedi (tools/brut.json). Les regles de les notes s'apliquen
després a mà a data/autocars.json (vegeu tools/genera_autocars.py).

Ús: python3 -I tools/extreu_pdf.py data/font/monbus-v210126.pdf tools/brut.json
"""
import json, re, subprocess, sys, collections

pdf, out = sys.argv[1], sys.argv[2]

# (pàgina, taula) -> (sentit, tipus de dia, nombre de columnes, índex PgV/Estació sortida, índex ZU)
# Sentit "tornada" = Igualada -> BCN ; "anada" = BCN -> Igualada
TAULES = {
    (1, None):        ("tornada", "feiner",       21),
    (2, "dissabte"):  ("tornada", "dissabte",     20),
    (2, "diumenge"):  ("tornada", "diumenge",     20),
    (2, "festiuBCN"): ("tornada", "festiuBCN",    21),
    (3, None):        ("anada",   "feiner",       20),
    (4, None):        ("anada",   "feiner",       20),
    (5, "dissabte"):  ("anada",   "dissabte",     19),
    (5, "diumenge"):  ("anada",   "diumenge",     19),
    (5, "festiuBCN"): ("anada",   "festiuBCN",    20),
}
# Posicions de columna des de l'esquerra (tornada) / dreta (anada) segons el nombre de columnes n
def cols_tornada(n):
    # S.Margarida, Balmes, PgV, PgV, Estació, ..., ZU, PalauReial, MariaCristina, Sants
    return dict(pgv=2, estacio=4, zu=n - 4)
def cols_anada(n):
    # ..., ZU(3), ..., Estació(n-5), PgV(n-4), PlCat, Balmes, S.Margarida
    return dict(zu=3, estacio=n - 5)

TIME = re.compile(r"^\d{1,2}:\d\d$")
NOTE = re.compile(r"^\((\d|e5|e24|e6)\)$")
res = collections.defaultdict(list)
stats = collections.Counter()

for p in range(1, 6):
    txt = subprocess.run(["pdftotext", "-layout", "-f", str(p), "-l", str(p), pdf, "-"],
                         capture_output=True, text=True, check=True).stdout
    taula = None
    ordre = iter(["dissabte", "diumenge", "festiuBCN"])   # a les pàg. 2 i 5 les taules van en aquest ordre
    for ln in txt.splitlines():
        if ln.strip().startswith("Notes:"):
            taula = next(ordre) if p in (2, 5) else None
            continue
        t = ln.split()
        i = 0
        while i < len(t) and NOTE.match(t[i]): i += 1
        notes, cells = t[:i], t[i:]
        if len(cells) < 10 or not all(TIME.match(c) or c == "-" for c in cells): continue
        key = (p, taula if p in (2, 5) else None)
        sentit, dia, n = TAULES[key]
        if "(e24)" in notes: stats["e24"] += 1; continue
        irregular = len(cells) != n
        if len(cells) == n - 1 and cells[-1] != "-":
            cells.append("-")    # el PDF omet la cel·la final buida (Sants) en algunes files
        assert n - 6 <= len(cells) <= n, (p, taula, ln.strip(), len(cells), n)
        notes = [x.strip("()") for x in notes]
        if sentit == "tornada":
            c = cols_tornada(n)
            # Si falten cel·les buides, les columnes de l'esquerra es llegeixen des de l'esquerra
            # i les de la dreta des de la dreta (les cel·les que falten són "-" del mig).
            sort, estacio, zu = cells[c["pgv"]], cells[c["estacio"]], cells[c["zu"] - n]
            res[(sentit, dia)].append(dict(pgv=sort, estacio=estacio, zu=zu, notes=notes))
        else:
            c = cols_anada(n)
            res[(sentit, dia)].append(dict(zu=cells[c["zu"]], estacio=cells[c["estacio"] - n], notes=notes))
        if irregular: print("IRREGULAR", p, dia, len(cells), n, notes, " ".join(cells))
        stats[(sentit, dia)] += 1

json.dump({f"{s}|{d}": v for (s, d), v in res.items()}, open(out, "w"), ensure_ascii=False, indent=1)
for k, v in sorted(stats.items(), key=str): print(k, v)
