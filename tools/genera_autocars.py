#!/usr/bin/env python3 -I
"""Converteix tools/brut.json (sortida d'extreu_pdf.py) en data/autocars.json
aplicant la llegenda de notes de cada pàgina del PDF com a REGLES de dades.

Regles (camp "regles" de cada expedició; el front només les interpreta):
  excepte : llista de períodes (calendari.json) on NO circula
  nomes   : llista de períodes on SÍ circula (només en algun d'ells)
  lectiu  : true -> només dies lectius
Períodes: agost, nadal2631, estiu (15/07-01/09), dijousSant, setmanaSanta.
"""
import json, sys

brut = json.load(open(sys.argv[1]))
sortida = sys.argv[2]

TOT = {}
# Llegenda de les pàgines de feiners (1 = tornada, 3-4 = anada)
FEINER = {
    "1": TOT,
    "2": {"excepte": ["agost", "dijousSant", "nadal2631"]},
    "3": {"excepte": ["estiu", "setmanaSanta", "nadal2631"]},
    "4": None, "6": None,                        # informatives
    "5": {"nomes": ["agost", "nadal2631", "dijousSant"]},
}
FEINER_TORNADA = {**FEINER, "7": {"lectiu": True}}
FEINER_ANADA = {**FEINER, "7": None, "8": {"lectiu": True}}
# Pàgines de dissabte / diumenge / festius locals: totes les notes són informatives o «tot l'any»
NOFEINER = {k: None for k in "12345"}

E5_FEINER = {"excepte": ["agost"]}                              # «tot l'any, excepte agost»
E5_NOFEINER = {"excepte": ["agost", "nadal2631"]}               # «excepte agost i 26-31 des.»
TEXT_NOTES = {
    "1": "Tot l'any", "2": "No funciona a l'agost, ni Dijous Sant, ni del 26 al 31 de desembre",
    "3": "No circula del 15/07 a l'01/09, ni Setmana Santa, ni del 26 al 31 de desembre",
    "4": "Puja al poble de Collbató", "5": "Només a l'agost, del 26 al 31 de desembre i Dijous Sant",
    "6": "A l'agost, del 26 al 31 de desembre i Dijous Sant surt des de Sta. Margarida de Montbui",
}

def merge(regles_list):
    out = {}
    for r in regles_list:
        for k, v in r.items():
            if k == "excepte": out["excepte"] = sorted(set(out.get("excepte", [])) | set(v))
            elif k == "nomes": out["nomes"] = sorted(set(out["nomes"]) & set(v)) if "nomes" in out else sorted(v)
            elif k == "lectiu": out["lectiu"] = True
    return out

def regles(row, dia, sentit):
    expres = "e5" in row["notes"]
    nums = [n for n in row["notes"] if n != "e5"]
    if dia == "feiner":
        leg = FEINER_TORNADA if sentit == "tornada" else FEINER_ANADA
        r = [leg[n] for n in nums if leg.get(n) is not None]
        explicit_tot = "1" in nums
        if expres and not r and not explicit_tot:
            r = [E5_FEINER]
        return merge(r)
    return merge([E5_NOFEINER] if expres else [])

res = []
def afegeix(sentit, dia, sort, arr, row, nomes_estacio=False):
    expres = "e5" in row["notes"]
    e = {
        "id": f"{sentit[0]}-{dia}-{sort.replace(':','')}-{'e' if expres else 'p'}",
        "sentit": sentit, "dia": dia, "sortida": sort, "arribada": arr,
        "tipus": "expres" if expres else "pobles",
        "notes": [n for n in row["notes"] if n != "e5"],
        "regles": regles(row, dia, sentit),
    }
    if nomes_estacio: e["nomesEstacio"] = True
    res.append(e)

def hhmm(t): h, m = t.split(":"); return f"{int(h):02d}:{m}"

for key, rows in brut.items():
    sentit, dia = key.split("|")
    for row in rows:
        if sentit == "anada":
            if row["zu"] == "-" or row["estacio"] == "-": continue
            afegeix(sentit, dia, hhmm(row["zu"]), hhmm(row["estacio"]), row)
        else:
            if row["zu"] == "-": continue
            if row["pgv"] != "-":
                afegeix(sentit, dia, hhmm(row["pgv"]), hhmm(row["zu"]), row)
            elif row["estacio"] != "-":
                afegeix(sentit, dia, hhmm(row["estacio"]), hhmm(row["zu"]), row, True)

# IDs únics
seen = {}
for e in res:
    n = seen.get(e["id"], 0); seen[e["id"]] = n + 1
    if n: e["id"] += f"-{n+1}"
res.sort(key=lambda e: (e["sentit"], e["dia"], e["sortida"]))

doc = {
    "font": "Monbus — Igualada–Esparreguera–Barcelona, PDF v210126",
    "avis": "Transcrit del PDF amb tools/extreu_pdf.py + tools/genera_autocars.py. Cal regenerar-ho si Monbus publica una versió nova.",
    "parades": {
        "anada": {"puja": "Av. Diagonal (Zona Univ.)", "baixa": "Igualada – Estació d'Autobusos"},
        "tornada": {"puja": "Igualada – Pg. Verdaguer", "baixa": "Av. Diagonal (Zona Univ.)"},
    },
    "notesText": TEXT_NOTES,
    "expedicions": res,
}
json.dump(doc, open(sortida, "w"), ensure_ascii=False, indent=1)
import collections
print(collections.Counter((e["sentit"], e["dia"]) for e in res))
print("nomesEstacio:", sum(1 for e in res if e.get("nomesEstacio")))
print(collections.Counter(json.dumps(e["regles"], sort_keys=True) for e in res))
