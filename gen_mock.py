"""Genera los JSON de swa/public/mock/.

El orden de las líneas imita lo que hace F&O con el paso de ola "Sort picking work lines"
(feature Warehouse spatial location, algoritmo "Fast calculation", distancia "City block"):
se parte del put, se elige cada vez la ubicación de pick más cercana sin visitar y al final
se invierte la lista. La altura cuenta como |z origen| + |z destino|.
Ref: learn.microsoft.com/dynamics365/supply-chain/warehousing/spatial-location-overview
"""
import json, os, pathlib, random

out = pathlib.Path(__file__).parent / "swa" / "public" / "mock"
os.makedirs(out, exist_ok=True)

def dump(obj, name):
    with open(out / name, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")

def fmt(n):
    return f"{n:g}".replace(".", ",")

# Almacén 24: 3 pasillos (A,B,C), 8 racks por pasillo, 3 niveles (0,1,2). Pasillos separados 6 m en X; racks cada 2.5 m en Y.
locs = []
for ai, aisle in enumerate(["A", "B", "C"]):
    x = 6 + ai * 6
    for rack in range(1, 9):
        y = 4 + (rack - 1) * 2.5
        for level in range(0, 3):
            zone = "PICK" if level == 0 else "BULK"
            locs.append({
                "locationId": f"{aisle}-{rack:02d}-{level}",
                "zone": zone, "aisle": aisle, "rack": rack, "level": level,
                "x": x, "y": round(y, 2), "z": level,
                "profile": zone,
                "sizeX": 1.2, "sizeY": 1.0, "sizeZ": 1.0
            })
# Staging y muelles
puts = [
    {"locationId": "STAGE-01", "zone": "STAGE", "aisle": "S", "rack": 1, "level": 0, "x": 12, "y": 0.5, "z": 0, "profile": "STAGING", "sizeX": 6, "sizeY": 1.5, "sizeZ": 0.2},
    {"locationId": "DOCK-01", "zone": "DOCK", "aisle": "D", "rack": 1, "level": 0, "x": 4, "y": -2, "z": 0, "profile": "DOCK", "sizeX": 3, "sizeY": 1, "sizeZ": 0.2},
    {"locationId": "DOCK-02", "zone": "DOCK", "aisle": "D", "rack": 2, "level": 0, "x": 20, "y": -2, "z": 0, "profile": "DOCK", "sizeX": 3, "sizeY": 1, "sizeZ": 0.2},
]
locs += puts
dump({
    "warehouseId": "24", "name": "Almacén 24 (demo)",
    "bounds": {"minX": 0, "maxX": 26, "minY": -4, "maxY": 24, "maxLevel": 2},
    "locations": locs,
    "putLocations": ["STAGE-01", "DOCK-01", "DOCK-02"],
    "distanceStrategy": "CityBlock", "sortAlgorithm": "Fast"
}, "layout-24.json")

byid = {l["locationId"]: l for l in locs}

def cityblock(a, b, levels=True):
    v = abs(a["z"]) + abs(b["z"]) if levels else 0
    return abs(a["x"] - b["x"]) + abs(a["y"] - b["y"]) + v

def fno_fast_sort(pick_ids, put):
    """Fast calculation de F&O: vecino más cercano desde el put, luego invertir. Devuelve (orden, traza)."""
    cur, left, built, trace = put, list(pick_ids), [], []
    while left:
        ranked = sorted(left, key=lambda k: (cityblock(cur, byid[k]), k))
        chosen = ranked[0]
        trace.append((cur["locationId"], chosen, ranked[1] if len(ranked) > 1 else None))
        built.append(chosen)
        left.remove(chosen)
        cur = byid[chosen]
    return built[::-1], trace

def explanation(lines, put, trace, total):
    put_id = put["locationId"]
    top = max(lines, key=lambda l: abs(l["z"]))
    expl = [
        f"F&O construye la ruta de las {len(lines)} líneas desde el muelle {put_id} hacia atrás, "
        f"eligiendo cada vez la ubicación más cercana, y después la invierte. "
        f"Por eso el último pick ({lines[-1]['locationId']}) es el más cercano al muelle.",
        f"La altura cuenta al subir y al bajar: se suma el nivel de origen y el de destino. {top['locationId']} está en el nivel {fmt(top['z'])}, "
        f"así que añade {fmt(top['z'])} a cada tramo que llega o sale de ella.",
    ]
    steps = []
    for frm, chosen, second in trace:
        a, c = byid[frm], byid[chosen]
        s = f"desde {frm} lo más cercano era {chosen} ({fmt(cityblock(a, c))} m)"
        if second:
            b = byid[second]
            s += f"; {second} quedaba a {fmt(cityblock(a, b))} m"
            if cityblock(a, c, False) > cityblock(a, b, False):
                s += " (sin contar la altura habría ganado " + second + ")"
        steps.append(s)
    expl.append("Construcción desde el muelle: " + "; ".join(steps) + ".")
    expl.append(f"Recorrido total: {fmt(total)} m hasta dejarlo todo en {put_id}.")
    return expl

def route(work_id, load_id, put_id, picks, status="Open"):
    put = byid[put_id]
    info = {p[0]: p for p in picks}
    order, trace = fno_fast_sort([p[0] for p in picks], put)
    lines = []
    for i, loc in enumerate(order, start=1):
        _, item, name, qty, unit = info[loc]
        l = byid[loc]
        lines.append({"lineNum": i, "workType": "Pick", "locationId": loc, "itemId": item, "itemName": name,
                      "qty": qty, "unit": unit, "x": l["x"], "y": l["y"], "z": l["z"], "distanceToNext": 0})
    total = 0
    for i in range(len(lines)):
        nxt = byid[lines[i + 1]["locationId"]] if i + 1 < len(lines) else put
        d = round(cityblock(byid[lines[i]["locationId"]], nxt), 2)
        lines[i]["distanceToNext"] = d
        total += d
    total = round(total, 2)
    return {"workId": work_id, "loadId": load_id, "warehouseId": "24", "workStatus": status,
            "strategy": "CityBlock", "algorithm": "Fast",
            "putLocation": {"locationId": put_id, "x": put["x"], "y": put["y"], "z": put["z"]},
            "lines": lines, "totalDistance": total, "explanation": explanation(lines, put, trace, total)}

# Ruta estrella. Caso "raro": A-08-2 (nivel 2) sale la primera; sin contar la altura iría la tercera.
r1 = route("W-1203", "LD-0042", "DOCK-01", [
    ("C-08-0", "A0001", "Tornillo M8 x 40 (caja 500)", 2, "ea"),
    ("A-08-2", "A0014", "Rodamiento 6204 2RS", 1, "ea"),
    ("B-06-0", "A0007", "Correa trapezoidal A-42", 4, "ea"),
    ("A-05-1", "A0031", "Motor 0,75 kW IE3", 1, "ea"),
    ("A-02-0", "A0020", "Cable 3x2,5 (rollo 100 m)", 3, "ea"),
])
dump(r1, "route-W-1203.json")

r2 = route("W-1204", "LD-0042", "DOCK-01", [
    ("B-08-1", "A0044", "Filtro de aire industrial", 6, "ea"),
    ("B-02-0", "A0050", "Guantes nitrilo (caja 100)", 2, "ea"),
])
dump(r2, "route-W-1204.json")
# Una carga en F&O puede tener varios works; cada work tiene su propia ruta ordenada.
dump([r1, r2], "load-LD-0042.json")
# Histórico (GET /warehouses/24/works en mock)
dump([{k: r[k] for k in ("workId", "loadId", "warehouseId", "workStatus")} for r in (r2, r1)], "works-24.json")

# Vista de almacén (GET /warehouses/24/stock en mock): stock por ubicación + picks abiertos de W-1203/W-1204.
# Semilla fija para que el fichero no cambie entre ejecuciones. Las ubicaciones de la ruta siempre tienen stock.
rnd = random.Random(24)
catalog = sorted({(l["itemId"], l["itemName"], l["unit"]) for r in (r1, r2) for l in r["lines"]} | {
    ("A0060", "Lubricante multiuso 5 l", "ea"),
    ("A0072", "Fusible 10 A (caja 50)", "ea"),
    ("A0085", "Brida nylon 300 mm (bolsa 100)", "ea"),
    ("A0093", "Palé europeo usado", "ea"),
})
open_picks = {}
for r in (r1, r2):
    for l in r["lines"]:
        open_picks.setdefault(l["locationId"], []).append(
            {"workId": r["workId"], "lineNum": l["lineNum"], "itemId": l["itemId"], "qty": l["qty"], "unit": l["unit"]})
stock = []
for l in locs:
    lid = l["locationId"]
    if lid in ("STAGE-01", "DOCK-01", "DOCK-02"):
        continue
    items = []
    for p in open_picks.get(lid, []):
        name = next(c[1] for c in catalog if c[0] == p["itemId"])
        items.append((p["itemId"], name, p["unit"], p["qty"] + rnd.randint(3, 30)))
    if not items and rnd.random() < 0.6:
        item = rnd.choice(catalog)
        qty = rnd.randint(40, 240) if l["level"] > 0 else rnd.randint(5, 60)
        items.append((item[0], item[1], item[2], qty))
    if not items:
        continue
    rows = []
    for item_id, name, unit, qty in items:
        row = {"itemId": item_id, "itemName": name, "qty": qty, "unit": unit}
        if l["level"] > 0:
            row["licensePlate"] = f"LP-{lid}"
        row["inventoryStatus"] = "Available"
        rows.append(row)
    stock.append({"locationId": lid, "qty": sum(i["qty"] for i in rows), "items": rows, "openPicks": open_picks.get(lid, [])})
dump({"warehouseId": "24", "asOf": "2026-10-27T08:00:00Z", "qtyBasis": "AvailablePhysical", "locations": stock}, "stock-24.json")

# Location detail: la de la pregunta "¿dónde está…?" de la demo y la del caso raro
def detail(loc_id):
    l = byid[loc_id]
    others = sorted([o for o in locs if o["locationId"] != loc_id], key=lambda o: (cityblock(l, o), o["locationId"]))[:4]
    return {**l,
            "deepLinkWeb": f"https://REPLACE-swa.azurestaticapps.net/?locationId={loc_id}&present=1",
            "deepLinkTeams": f"https://teams.microsoft.com/l/entity/REPLACE-TEAMS-APP-ID/mapa3d?context=%7B%22subEntityId%22%3A%22loc%3A{loc_id}%22%7D",
            "neighbours": [o["locationId"] for o in others]}
for loc_id in ["A-05-1", "A-08-2"]:
    dump(detail(loc_id), f"location-{loc_id}.json")

print("locations:", len(locs), "· con stock:", len(stock))
for r in (r1, r2):
    print(r["workId"], [l["locationId"] for l in r["lines"]], r["totalDistance"])
print(*r1["explanation"], sep="\n")
