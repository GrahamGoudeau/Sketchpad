"""Replay a MEMORY_TIMELINE into keyframes for the growing-memory scene.

Reads the JSON lines a regression wrote with MEMORY_TIMELINE (first
line the full list area, then changed words), rebuilds the ring graph
at every change with rings.py, lays it out with layout.py (master tree
fixed, drawing blocks at their real scope positions), and writes
keyframes: time, phase, scope frame number, block positions and types,
rings as member lists, ties.  Keyframes are kept whenever the set of
blocks, a ring's membership, or a tie changes; position-only changes
(points moving) are kept at most every `--motion` seconds.

Usage: python3 timeline.py flange.timeline.jsonl flange.frames.jsonl > flange-keyframes.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rings as R  # noqa: E402
import layout as L  # noqa: E402

FPS = 30


def states(path):
    words = {}
    for line in open(path):
        e = json.loads(line)
        for a, v in e["changes"].items():
            words[a] = v
        yield e["time"], e["phase"], dict(words)


def graph_of(words):
    snapshot = {"after": {a: v for a, v in words.items() if a < "200000"},
                "statics": {a: v for a, v in words.items() if a >= "200000"},
                "lineAddress": "000000"}
    numeric = {int(a, 8): int(v, 8) for a, v in snapshot["after"].items()}
    g = R.build({"lineAddress": "000000"}, numeric)
    try:
        g["layout"] = L.layout(g, snapshot)
    except StopIteration:
        g["layout"] = {}
    return g


def signature(g):
    blocks = tuple(sorted((b, v["type"]) for b, v in g["blocks"].items()))
    rings = tuple(sorted(tuple(m["block"] + ":" + m["field"] for m in r["members"]) for r in g["rings"] if r["size"] > 1))
    ties = tuple(sorted((t["from"], t["field"], t["to"]) for t in g["ties"]))
    return blocks, rings, ties


SLOW_PHASES = ("expose-perpendicular-handles", "map-perpendicular-target", "attach-perpendicular-handle",
               "stage-perpendicular-constraint", "create-perpendicular-constraint")


def main(timeline, motion=0.5, slow_motion=1.0):
    keyframes = []
    last_sig = None
    last_motion = -1e9
    for time, phase, words in states(timeline):
        if not words.get("024000"):
            continue
        g = graph_of(words)
        if not g["layout"]:
            continue
        sig = signature(g)
        structural = sig != last_sig
        gap = slow_motion if phase in SLOW_PHASES else motion
        if not structural and time - last_motion < gap:
            continue
        if not structural:
            last_motion = time
        else:
            last_motion = time
        last_sig = sig
        keyframes.append({
            "time": time, "phase": phase, "frame": int(round(time * FPS)), "structural": structural,
            "blocks": {b: {"type": v["type"], "xy": g["layout"].get(b)} for b, v in g["blocks"].items()},
            "rings": [{"id": f"{r['head']['block']}:{r['head']['field']}", "members": [m["block"] for m in r["members"]],
                       "headType": g["blocks"][r["head"]["block"]]["type"]}
                      for r in g["rings"] if r["size"] > 1 and r["head"]],
            "ties": [[t["from"], t["to"]] for t in g["ties"]],
        })
    return keyframes


if __name__ == "__main__":
    kf = main(sys.argv[1])
    json.dump(kf, sys.stdout)
    print(json.dumps({"keyframes": len(kf), "structural": sum(1 for k in kf if k["structural"]),
                      "span": [kf[0]["time"], kf[-1]["time"]] if kf else None}), file=sys.stderr)
