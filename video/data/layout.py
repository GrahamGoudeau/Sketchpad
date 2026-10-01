"""Lay out the ring graph of a snapshot for the gestalt scene.

Input: the JSON that rings.py writes, plus the snapshot it came from
(for point coordinates and the scope window).  Output: the same JSON
with a "layout" entry giving an (x, y) in Manim units for every block.

The layout is structured, not force-directed, so that the picture is
recognisable: the master-block tree sits on the left as nested arcs
(root, categories, type masters, constraint types); the drawing's own
blocks sit on the right at their real scope positions, points where
the scope shows them, lines at the midpoints of their end points,
constraints at the centroid of the points they tie to; the picture
block above them; freed blocks in a pile at the bottom left.

Usage: python3 layout.py flange-rings.json flange.json > flange-layout.json
"""
import json
import math
import sys

LIST = 0o24000


def signed36(v):
    return v - (2 ** 36 - 1) if v >= 2 ** 35 else v


def scope_of(words, statics, base):
    scsz = int(statics["200034"], 8)
    cx = signed36(int(statics["200035"], 8))
    cy = signed36(int(statics["200036"], 8))
    x = signed36(int(words[f"{base + 0o20:06o}"], 8))
    y = signed36(int(words[f"{base + 0o21:06o}"], 8))
    return 511 + (x - cx) * 512 / scsz, 511 + (y - cy) * 512 / scsz


def layout(graph, snapshot):
    blocks = graph["blocks"]
    words = snapshot["after"]
    statics = snapshot["statics"]
    rings = [r for r in graph["rings"] if r["size"] > 1 and r["head"]]
    pos = {}

    # 1. The master tree, on the left.
    root_ring = next(r for r in rings if r["size"] > 3 and all(blocks[m["block"]]["type"] in ("master", "?") for m in r["members"]))
    root = root_ring["head"]["block"]
    root_xy = (-4.3, 0.6)
    pos[root] = root_xy
    categories = [m["block"] for m in root_ring["members"] if m["block"] != root]
    n = len(categories)
    for i, c in enumerate(categories):
        ang = math.pi / 2 + 2 * math.pi * i / n
        pos[c] = (root_xy[0] + 1.1 * math.cos(ang), root_xy[1] + 1.1 * math.sin(ang))
        # the category's own ring: its type masters, on an arc further out
        cring = next((r for r in rings if r["head"]["block"] == c), None)
        if not cring:
            continue
        members = [m["block"] for m in cring["members"] if m["block"] != c]
        k = len(members)
        spread = min(2.6, 0.32 * k)
        for j, m in enumerate(members):
            a = ang + (j - (k - 1) / 2) * (spread / max(k, 1))
            radius = 2.4 if blocks[m]["type"] == "master" else 2.9
            pos[m] = (root_xy[0] + radius * math.cos(a), root_xy[1] + radius * math.sin(a))

    # 2. The drawing, on the right, at real scope positions.
    points = [b for b, v in blocks.items() if v["type"] == "points"]
    scope = {p: scope_of(words, statics, int(p, 8)) for p in points}
    if scope:
        xs = [s[0] for s in scope.values()]
        ys = [s[1] for s in scope.values()]
        w = max(xs) - min(xs) + 1e-6
        h = max(ys) - min(ys) + 1e-6
        s = min(4.2 / w, 4.4 / h)
        cx = (max(xs) + min(xs)) / 2
        cy = (max(ys) + min(ys)) / 2
        for p, (x, y) in scope.items():
            pos[p] = (3.4 + (x - cx) * s, 0.3 + (y - cy) * s)
    ties_from = {}
    for t in graph["ties"]:
        ties_from.setdefault(t["from"], []).append(t)
    for b, v in blocks.items():
        if v["type"] == "lines":
            ends = [t["to"] for t in ties_from.get(b, []) if t["field"] in ("10", "12") and t["to"] in pos]
            if len(ends) == 2:
                pos[b] = ((pos[ends[0]][0] + pos[ends[1]][0]) / 2, (pos[ends[0]][1] + pos[ends[1]][1]) / 2)
    for b, v in blocks.items():
        if v["type"] == "constraint":
            targets = [t["to"] for t in ties_from.get(b, []) if blocks[t["to"]]["type"] == "points" and t["to"] in pos]
            if targets:
                mx = sum(pos[t][0] for t in targets) / len(targets)
                my = sum(pos[t][1] for t in targets) / len(targets)
                # push outward from the drawing's centre so it sits off the corner
                dx, dy = mx - 3.4, my - 0.3
                d = math.hypot(dx, dy) + 1e-6
                pos[b] = (mx + 0.55 * dx / d, my + 0.55 * dy / d)
    for b, v in blocks.items():
        if v["type"] == "pictures":
            pos[b] = (3.4, 3.1)

    # 3. Everything else: freed blocks in a pile, unknowns beside the tree.
    pile = [b for b in blocks if b not in pos and blocks[b]["type"] == "frees"]
    for i, b in enumerate(pile):
        pos[b] = (-6.2 + 0.28 * (i % 9), -2.6 - 0.28 * (i // 9))
    rest = [b for b in blocks if b not in pos]
    for i, b in enumerate(rest):
        pos[b] = (-1.2, 2.8 - 0.35 * i)
    return {b: [x, y] for b, (x, y) in pos.items()}


if __name__ == "__main__":
    graph = json.load(open(sys.argv[1]))
    snapshot = json.load(open(sys.argv[2]))
    graph["layout"] = layout(graph, snapshot)
    json.dump(graph, sys.stdout, indent=1)
