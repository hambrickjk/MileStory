"""Build data/map.json for MileStory from Natural Earth GeoJSON files (1:50m, plus 1:10m cities).

Natural Earth is public domain: https://www.naturalearthdata.com
Usage: python3 tools/build_map.py /path/to/natural-earth-vector/geojson
"""
import json, math, os, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "geojson"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "map.json")
TOL = 0.025  # simplification tolerance in degrees (about 1.5 miles)


def load(name):
    with open(os.path.join(SRC, name + ".geojson"), encoding="utf-8") as f:
        return json.load(f)["features"]


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-12
        best, idx = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L if (dx or dy) else math.hypot(px - ax, py - ay)
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def line(pts, tol=TOL, closed=False):
    s = dp(pts, tol)
    out = []
    for x, y in s:
        q = [round(x, 2), round(y, 2)]
        if not out or out[-1] != q:
            out.append(q)
    if closed and len(out) < 4:
        return None
    if not closed and len(out) < 2:
        return None
    return out


def geom(g, tol=TOL):
    t, c = g["type"], g["coordinates"]
    if t == "Polygon":
        polys = [c]
    elif t == "MultiPolygon":
        polys = c
    elif t == "LineString":
        ls = line(c, tol)
        return {"type": "MultiLineString", "coordinates": [ls]} if ls else None
    elif t == "MultiLineString":
        ls = [l for l in (line(x, tol) for x in c) if l]
        return {"type": "MultiLineString", "coordinates": ls} if ls else None
    else:
        return None
    out = []
    for p in polys:
        rings = [r for r in (line(r, tol, True) for r in p) if r]
        if rings and len(rings[0]) >= 4:
            out.append(rings)
    return {"type": "MultiPolygon", "coordinates": out} if out else None


def feat(g, props=None):
    return {"type": "Feature", "properties": props or {}, "geometry": g}


def centroid(g):
    """Area-weighted centroid of the largest polygon's outer ring."""
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    best, bestA = None, -1
    for p in polys:
        r = p[0]
        A = cx = cy = 0
        for (x0, y0), (x1, y1) in zip(r, r[1:]):
            f = x0 * y1 - x1 * y0
            A += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f
        if abs(A) > bestA and A:
            bestA, best = abs(A), (cx / (3 * A), cy / (3 * A))
    return best


def title(s):
    s = s.replace("MTS.", "MOUNTAINS").replace("RA.", "RANGE")
    return " ".join(w.capitalize() if w.isupper() else w for w in s.split())


out = {}

land = [g for g in (geom(f["geometry"]) for f in load("ne_50m_land")) if g]
out["land"] = {"type": "FeatureCollection", "features": [feat(g) for g in land]}

out["borders"] = {"type": "FeatureCollection", "features": [
    feat(g) for g in (geom(f["geometry"]) for f in load("ne_50m_admin_0_boundary_lines_land")) if g]}

out["stateLines"] = {"type": "FeatureCollection", "features": [
    feat(g) for g in (geom(f["geometry"]) for f in load("ne_50m_admin_1_states_provinces_lines")) if g]}

lakes = []
for f in load("ne_50m_lakes"):
    p = f["properties"]
    if (p.get("scalerank") or 9) > 4:
        continue
    g = geom(f["geometry"], 0.02)
    if g:
        lakes.append(feat(g, {"n": p.get("name") or "", "r": p.get("scalerank")}))
out["lakes"] = {"type": "FeatureCollection", "features": lakes}

rivers = []
for f in load("ne_50m_rivers_lake_centerlines"):
    p = f["properties"]
    if p.get("featurecla") not in ("River", "Lake Centerline"):
        continue
    if (p.get("scalerank") or 9) > 6:
        continue
    g = geom(f["geometry"], 0.02)
    if g:
        rivers.append(feat(g, {"n": p.get("name_en") or p.get("name") or "", "r": p.get("scalerank")}))
out["rivers"] = {"type": "FeatureCollection", "features": rivers}

relief = []
for f in load("ne_50m_geography_regions_polys"):
    p = f["properties"]
    if p.get("FEATURECLA") not in ("Range/mtn", "Plateau", "Desert", "Basin", "Plain", "Lowland", "Foothills", "Valley"):
        continue
    if (p.get("SCALERANK") or 9) > 4:
        continue
    g = geom(f["geometry"], 0.05)
    if not g:
        continue
    c = centroid(g)
    kind = {"Range/mtn": "mtn", "Desert": "desert"}.get(p["FEATURECLA"], "plain")
    relief.append({"n": title(p.get("NAME_EN") or p["NAME"]), "k": kind, "r": p["SCALERANK"],
                   "x": round(c[0], 2), "y": round(c[1], 2), "g": g if kind == "mtn" else None})
out["relief"] = relief

labels = []
for f in load("ne_50m_admin_0_countries"):
    p = f["properties"]
    labels.append({"t": "country", "n": p.get("NAME_EN") or p["NAME"], "r": p.get("MIN_LABEL") or 5,
                   "x": round(p["LABEL_X"], 2), "y": round(p["LABEL_Y"], 2)})
for f in load("ne_50m_admin_1_states_provinces"):
    p = f["properties"]
    if p.get("admin") not in ("United States of America", "Canada", "Mexico", "Australia"):
        continue
    if p.get("latitude") is None:
        continue
    abbr = (p.get("postal") or "")[:2]
    labels.append({"t": "state", "n": p.get("name_en") or p["name"], "a": abbr, "r": p.get("min_label") or 5,
                   "x": round(p["longitude"], 2), "y": round(p["latitude"], 2)})
for f in load("ne_50m_geography_marine_polys"):
    p = f["properties"]
    if (p.get("scalerank") or 9) > 3:
        continue
    g = f["geometry"]
    c = centroid(g)
    if not c:
        continue
    labels.append({"t": "sea", "n": title(p.get("name_en") or p["name"]), "r": p["scalerank"],
                   "x": round(c[0], 2), "y": round(c[1], 2)})
out["labels"] = labels

cities = []
for f in load("ne_10m_populated_places_simple"):
    p = f["properties"]
    if p["scalerank"] > 7:
        continue
    cities.append({"n": p["name"], "r": p["scalerank"], "x": round(p["longitude"], 2), "y": round(p["latitude"], 2)})
cities.sort(key=lambda c: c["r"])
out["cities"] = cities

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
for k, v in out.items():
    print(" ", k, len(v["features"]) if isinstance(v, dict) else len(v))
