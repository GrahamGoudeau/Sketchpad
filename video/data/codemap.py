"""The emulator's real shape: crates, modules, and sizes, from the tree.

Usage: python3 codemap.py > ../build/codemap.json
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PARTS = [
    ("base", "base/src", "words, addresses, instruction encoding", "*.rs"),
    ("cpu", "cpu/src", "the TX-2: control, memory, sequences, I/O units, clock", "*.rs"),
    ("assembler", "assembler/src", "M4 cross-assembler (tx2m4as) and tape tools", "*.rs"),
    ("cli", "cli/src", "command-line simulator", "*.rs"),
    ("wasm bridge", "sketchpad-web/rust/src", "machine in the browser: step_batch, events", "*.rs"),
    ("web", "sketchpad-web/web", "scope, pen, buttons, knobs as web controls", "*.js"),
    ("regressions", "sketchpad-web/tests", "the test bed: drives the pen, reads memory", "*.mjs"),
    ("Sketchpad source", "reconstruction", "transcribed 1963 M4 assembly", "sk*.tx2as"),
]


def count(path, pattern):
    files = sorted((ROOT / path).rglob(pattern))
    return [{"file": str(f.relative_to(ROOT)), "lines": sum(1 for _ in open(f, errors="replace"))} for f in files]


if __name__ == "__main__":
    out = []
    for name, path, role, pattern in PARTS:
        files = count(path, pattern)
        out.append({"name": name, "path": path, "role": role, "lines": sum(f["lines"] for f in files),
                    "files": len(files), "largest": sorted(files, key=lambda f: -f["lines"])[:8]})
    json.dump(out, sys.stdout, indent=1)
    print(json.dumps([(p["name"], p["lines"], p["files"]) for p in out]), file=sys.stderr)
