"""Reconstruct the ring structure of Sketchpad's list memory from a snapshot.

Reads a MEMORY_SNAPSHOT file (octal words keyed by octal address) and
finds, mechanically and without any knowledge of block types:

- ring words: a word w whose next link's prev link is w and whose prev
  link's next link is w (self-loops included);
- rings: the cycles those words form;
- the block that owns each ring word: the word before a ring word is its
  hen, whose left quarter is minus the hen's offset in the block (the
  type ring word at +1 has the TYPE word before it instead);
- the head of each ring: the one member whose hen carries no tie;
- ties: a hen's right half, the block it points at.

Block types are then read from the TYPE word's right half, which ties
every block to the master block of its kind, and named with the
listing's equalities for the master block table.

Usage: python3 rings.py flange.json > flange-rings.json
"""
import json
import sys

LIST = 0o24000
MASBL = 0o24
SMASBL = 6
PICTURES = 22 * 8 // 8  # placeholder replaced below

# Master block names from the equalities (sk.tx2as): N×MASBL+PICTURES
# and N×SMASBL+LIST+1.
PICTURES_BASE = 0o22 * SMASBL + LIST + 1
MASTERS = {
    PICTURES_BASE + 0 * MASBL: "PICTURES",
    PICTURES_BASE + 1 * MASBL: "LINES",
    PICTURES_BASE + 2 * MASBL: "CIRCLES",
    PICTURES_BASE + 3 * MASBL: "SCALERS",
    PICTURES_BASE + 4 * MASBL: "POINTS",
    PICTURES_BASE + 5 * MASBL: "TPVALS",
    PICTURES_BASE + 6 * MASBL: "INSTANCES",
    PICTURES_BASE + 7 * MASBL: "TEXTS",
    PICTURES_BASE + 0o10 * MASBL: "NUMBERS",
    PICTURES_BASE + 0o11 * MASBL: "IPCONS",
    PICTURES_BASE + 0o12 * MASBL: "ONLINES",
    PICTURES_BASE + 0o13 * MASBL: "ONCIRCLES",
    PICTURES_BASE + 0o14 * MASBL: "IBVERTS",
    PICTURES_BASE + 0o15 * MASBL: "HOVS",
}
SMALL_MASTERS = {
    LIST + 1 + n * SMASBL: name for n, name in {
        0o2: "HOLDERS", 0o3: "TOPOS", 0o4: "CONSTRAINTS", 0o5: "FREES", 0o6: "FREEDOMS",
        0o10: "MERGERS", 0o11: "DEADS", 0o12: "FIXEDS", 0o13: "DESIGS", 0o14: "MOVINGS",
        0o15: "CURPICS", 0o16: "NEWCONS",
    }.items()
}


def load(path):
    data = json.load(open(path))
    words = {int(a, 8): int(v, 8) for a, v in data["after"].items()}
    return data, words


def halves(w):
    return (w >> 18) & 0o777777, w & 0o777777


def quarter4(w):
    return (w >> 27) & 0o777


def neg9(q):
    """A nine-bit one's complement value as a signed integer."""
    return q - 0o777 if q & 0o400 else q


def find_ring_words(words):
    ring = set()
    for a, w in words.items():
        prev, nxt = halves(w)
        if prev == 0 and nxt == 0:
            continue
        pa, na = LIST + prev, LIST + nxt
        if pa not in words or na not in words:
            continue
        if halves(words[na])[0] == a - LIST and halves(words[pa])[1] == a - LIST:
            ring.add(a)
    return ring


def owner_of(ring_word, words):
    """Block base and field offset of a ring word, from its hen."""
    hen = words.get(ring_word - 1, 0)
    q = neg9(quarter4(hen))
    if q < 0:
        offset = -q
        return ring_word - 1 - offset, offset + 1
    # The type ring word at +1: the word before is the TYPE word.
    return ring_word - 1, 1


def build(data, words):
    ring_words = find_ring_words(words)
    seen = set()
    rings = []
    for start in sorted(ring_words):
        if start in seen:
            continue
        cycle = []
        a = start
        while a not in seen:
            seen.add(a)
            cycle.append(a)
            a = LIST + halves(words[a])[1]
            if a not in ring_words:
                break
        rings.append(cycle)
    blocks = {}
    for rw in ring_words:
        base, offset = owner_of(rw, words)
        blocks.setdefault(base, {"fields": {}})
        blocks[base]["fields"][offset] = rw
    # Types, from the TYPE word's right half.
    for base, b in blocks.items():
        t = words.get(base, 0)
        master = LIST + halves(t)[1]
        name = MASTERS.get(master) or SMALL_MASTERS.get(master)
        if base in MASTERS:
            b["type"] = "master"
            b["name"] = MASTERS[base]
        elif base in SMALL_MASTERS:
            b["type"] = "master"
            b["name"] = SMALL_MASTERS[base]
        else:
            b["type"] = (name or "?").lower()
            b["name"] = f"{b['type']} {base:06o}"
            b["master"] = f"{master:06o}"
        b["length"] = quarter4(t)
    # A block whose master is itself an ordinary block of the CONSTRAINTS
    # master is an instance of that constraint type.
    for base, b in blocks.items():
        if b["type"] == "?" and "master" in b:
            m = blocks.get(int(b["master"], 8))
            if m and m["type"] == "constraints":
                b["type"] = "constraint"
                b["name"] = f"constraint {base:06o} (type {b['master']})"
    for base, b in blocks.items():
        if b["type"] == "constraints":
            b["type"] = "constraint-type"
    # Ties: hens with a nonzero right half that names a known block.
    ties = []
    for base, b in blocks.items():
        for offset in sorted(b["fields"]):
            hen = base + offset - 1
            if offset == 1:
                continue
            target = LIST + halves(words.get(hen, 0))[1]
            if target in blocks and target != base:
                ties.append({"from": base, "field": offset - 1, "to": target})
    # Ring heads and members.
    ring_records = []
    for cycle in rings:
        members = []
        head = None
        for rw in cycle:
            base, offset = owner_of(rw, words)
            hen = words.get(rw - 1, 0)
            is_head = offset != 1 and halves(hen)[1] == 0
            if base in MASTERS or base in SMALL_MASTERS:
                is_head = True
            if is_head and head is None:
                head = {"block": base, "field": offset - 1}
            members.append({"block": base, "field": offset - 1, "word": rw})
        ring_records.append({"head": head, "members": members, "size": len(cycle)})
    return {
        "source": data.get("lineAddress"),
        "blocks": {f"{b:06o}": {"type": v["type"], "name": v["name"], "length": v["length"],
                                "fields": {f"{k - 1:o}": f"{w:06o}" for k, w in v["fields"].items()}}
                   for b, v in sorted(blocks.items())},
        "ties": [{"from": f"{t['from']:06o}", "field": f"{t['field']:o}", "to": f"{t['to']:06o}"} for t in ties],
        "rings": [{"head": None if r["head"] is None else {"block": f"{r['head']['block']:06o}", "field": f"{r['head']['field']:o}"},
                   "members": [{"block": f"{m['block']:06o}", "field": f"{m['field']:o}"} for m in r["members"]],
                   "size": r["size"]} for r in ring_records],
    }


if __name__ == "__main__":
    data, words = load(sys.argv[1])
    out = build(data, words)
    json.dump(out, sys.stdout, indent=1)
    counts = {}
    for b in out["blocks"].values():
        counts[b["type"]] = counts.get(b["type"], 0) + 1
    print(json.dumps({"blocks": len(out["blocks"]), "byType": counts, "rings": len(out["rings"]),
                      "nonTrivialRings": sum(1 for r in out["rings"] if r["size"] > 1), "ties": len(out["ties"])}),
          file=sys.stderr)
