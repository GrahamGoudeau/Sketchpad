"""Facts about the reconstruction itself, from the repository's own records.

Reads reconstruction/RESEARCH_LOG.md (checkpoints: number, title, date),
reconstruction/RECONSTRUCTION.md (the repair register: row id, class),
and git history (commits per day, and the number of web regressions in
sketchpad-web/package.json over time).  Writes JSON for the
reconstruction chapter.  Nothing here is typed in by hand.

Usage: python3 reconstruction_data.py > ../build/reconstruction.json
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def checkpoints():
    out = []
    text = (ROOT / "reconstruction" / "RESEARCH_LOG.md").read_text()
    for m in re.finditer(r"^## Checkpoint (\d+): (.+)$\n+Date: (\d{4}-\d{2}-\d{2})", text, re.M):
        out.append({"number": int(m.group(1)), "title": m.group(2).strip(), "date": m.group(3)})
    decomp = len(re.findall(r"\[DECOMP\]", text))
    return out, decomp, len(text.splitlines())


def repairs():
    rows = []
    for line in (ROOT / "reconstruction" / "RECONSTRUCTION.md").read_text().splitlines():
        m = re.match(r"^\| (R\d{3}) \| (.*?) \| (mechanical|verified|inferred|speculative) \| (.*) \| (.*?) \|\s*$", line)
        if m:
            rows.append({"id": m.group(1), "where": m.group(2).replace("`", ""), "class": m.group(3),
                         "evidence": m.group(4), "change": m.group(5)})
    return rows


def git_history():
    log = subprocess.run(["git", "log", "--reverse", "--date=short", "--format=%h %ad %s"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout.splitlines()
    commits = [{"sha": l.split()[0], "date": l.split()[1], "subject": " ".join(l.split()[2:])} for l in log]
    # regressions over time: count test: scripts in package.json at the first commit of each day
    by_day = {}
    for c in commits:
        by_day[c["date"]] = c["sha"]  # the last commit of each day
    tests = []
    for day, sha in sorted(by_day.items()):
        if day < "2026-09-14":
            continue
        r = subprocess.run(["git", "show", f"{sha}:sketchpad-web/package.json"], cwd=ROOT, capture_output=True, text=True)
        if r.returncode != 0:
            tests.append({"date": day, "regressions": 0})
            continue
        chain = re.search(r'"test": "([^"]*)"', r.stdout)
        n = chain.group(1).count("npm run") if chain else 0
        tests.append({"date": day, "regressions": n})
    return commits, tests


def sources():
    out = {}
    for name in ("sk.tx2as", "sk2.tx2as"):
        lines = (ROOT / "reconstruction" / name).read_text().splitlines()
        out[name] = {"lines": len(lines), "pages": sum(1 for l in lines if l.startswith("[meta ")),
                     "scanNotes": sum(1 for l in lines if "[" in l and "]" in l and not l.startswith("[meta "))}
    return out


if __name__ == "__main__":
    cps, decomp, loglines = checkpoints()
    reps = repairs()
    commits, tests = git_history()
    since = [c for c in commits if c["date"] >= "2026-09-14"]
    assembler_commits = subprocess.run(["git", "log", "--since=2026-09-14", "--format=%h", "--", "assembler/"], cwd=ROOT,
                                       capture_output=True, text=True).stdout.split()
    emulator_commits = subprocess.run(["git", "log", "--since=2026-09-14", "--format=%h", "--", "cpu/", "base/"], cwd=ROOT,
                                      capture_output=True, text=True).stdout.split()
    classes = {}
    for r in reps:
        classes[r["class"]] = classes.get(r["class"], 0) + 1
    json.dump({
        "checkpoints": cps, "decompNotes": decomp, "logLines": loglines,
        "repairs": reps, "repairClasses": classes,
        "commits": commits, "regressionsByDay": tests,
        "commitsSinceStart": len(since), "assemblerCommits": len(assembler_commits), "emulatorCommits": len(emulator_commits),
        "firstDay": "2026-09-14",
        "sources": sources(),
    }, sys.stdout, indent=1)
    print(json.dumps({"checkpoints": len(cps), "repairs": len(reps), "classes": classes, "commits": len(commits),
                      "days": len(tests), "decomp": decomp}), file=sys.stderr)
