"""Plano de coordenadas propuesto para las ubicaciones reales del almacén 24 (USMF).
Salida: plan24.json y layout-24-plan.json junto al script. Aplicado en el entorno m365live (USMF) el 26/10/2026
por OData (PATCH de WarehouseLocationX/Y/ZCoordinate); valores originales: todo 0. Almacén 24 → CityBlock.
Metros. Y crece hacia el fondo; el muelle (BAYDOOR) delante. Z = nivel (0 suelo).
"""
import json, pathlib

OUT = pathlib.Path(__file__).parent
Y = lambda rack: 4 + (rack - 1) * 2.5  # racks cada 2,5 m

plan = []  # (locationId, x, y, z, aisle, rack, zona-para-colores)
def add(loc, x, y, z, aisle, rack, zone):
    plan.append(dict(locationId=loc, x=x, y=round(y, 2), z=z, aisle=aisle, rack=rack, zone=zone))

# Pasillo A (x=6): picking en suelo FL-001..006 y BULK en altura encima de los racks del fondo
for r in range(1, 7):
    add(f"FL-{r:03d}", 6, Y(r), 0, "A", r, "PICK")
for i, r in enumerate([4, 5, 6], start=1):          # BULK-001..003 nivel 2, fondo del pasillo A
    add(f"BULK-{i:03d}", 6, Y(r), 2, "A", r, "BULK")
for i, r in enumerate([1, 2, 3], start=4):          # BULK-004..006 nivel 1, delante del pasillo A
    add(f"BULK-{i:03d}", 6, Y(r), 1, "A", r, "BULK")
# Pasillo B (x=12): FL-007..012 en suelo, BULK-007..009 nivel 1 al fondo
for r in range(1, 7):
    add(f"FL-{r + 6:03d}", 12, Y(r), 0, "B", r, "PICK")
for i, r in enumerate([4, 5, 6], start=7):
    add(f"BULK-{i:03d}", 12, Y(r), 1, "B", r, "BULK")
# Pasillo C (x=18): webshop CP-001..009, 3 racks del fondo x 3 niveles
n = 1
for r in [4, 5, 6]:
    for z in range(3):
        add(f"CP-{n:03d}", 18, Y(r), z, "C", r, "PICK" if z == 0 else "BULK")
        n += 1
# Lateral (x=22): flow racks y suelo FLOOR-05
for i, r in enumerate([1, 2, 3], start=1):
    add(f"{i}0000", 22, Y(r), 0, "D", r, "PICK")
add("FL-101", 22, Y(5), 0, "D", 5, "PICK")
add("FL-102", 22, Y(6), 0, "D", 6, "PICK")
# Frente: muelle, staging, pack y recepción
add("BAYDOOR", 4, -2, 0, "-", 0, "DOCK")
add("STAGE", 12, 0.5, 0, "-", 0, "STAGE")
add("PACK", 20, -2, 0, "-", 0, "STAGE")
add("RECV", 25, -2, 0, "-", 0, "DOCK")

json.dump([{k: p[k] for k in ("locationId", "x", "y", "z")} for p in plan], open(OUT / "plan24.json", "w"), indent=1)

puts = {"BAYDOOR", "STAGE", "PACK", "RECV"}
size = {"BAYDOOR": (3, 1, 0.2), "STAGE": (6, 1.5, 0.2), "PACK": (3, 1, 0.2), "RECV": (3, 1, 0.2)}
layout = {
    "warehouseId": "24", "name": "Almacén 24 (USMF) — plano propuesto",
    "bounds": {"minX": 0, "maxX": 27, "minY": -4, "maxY": 20, "maxLevel": 2},
    "locations": [{
        "locationId": p["locationId"], "zone": p["zone"], "aisle": p["aisle"], "rack": p["rack"], "level": p["z"],
        "x": p["x"], "y": p["y"], "z": p["z"], "profile": p["zone"],
        **(dict(zip(("sizeX", "sizeY", "sizeZ"), size[p["locationId"]])) if p["locationId"] in size else {"sizeX": 1.2, "sizeY": 1.0, "sizeZ": 1.0}),
    } for p in plan],
    "putLocations": sorted(puts),
    "distanceStrategy": "CityBlock", "sortAlgorithm": "Fast",
}
json.dump(layout, open(OUT / "layout-24-plan.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(len(plan), "ubicaciones con coordenadas")
for p in plan:
    print(f"  {p['locationId']:8} x={p['x']:>4} y={p['y']:>5} z={p['z']}  pasillo {p['aisle']}")
