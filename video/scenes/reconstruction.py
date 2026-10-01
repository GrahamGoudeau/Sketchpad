"""Chapter 0: how it was brought back.

The reconstruction told from its own records: the transcribed sources,
the repair register with its evidence classes, the research log's
checkpoints, the growth of the regression suite, all read from the
repository by data/reconstruction_data.py.  No number here is typed in.

Render:  manim -qh scenes/reconstruction.py Reconstruction
"""
import json
import textwrap
from collections import Counter
from pathlib import Path

from manim import (
    DOWN, UP, LEFT, RIGHT, ORIGIN, BLACK, WHITE, GREY_B, GREY_C, GREY_D, YELLOW, BLUE_C, GREEN_C, ORANGE,
    RED_C, PURPLE_B, VGroup, Scene, Text, Paragraph, FadeIn, FadeOut, Rectangle, Line, config, Create,
    GrowFromEdge, Dot,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
D = json.loads((ROOT / "build" / "reconstruction.json").read_text())
MONO = "Noto Sans Mono"
FRAME_W = config.frame_width


def caption_text(text, size=28):
    lines = textwrap.wrap(text, 62)
    p = Paragraph(*lines, alignment="center", font_size=size, line_spacing=0.9)
    if p.width > FRAME_W - 1.0:
        p.scale_to_fit_width(FRAME_W - 1.0)
    return p.to_edge(DOWN, buff=0.4)


def bar(width, color, label, value, y=0.0, axis_x=-1.6):
    """A labelled bar on a common axis: label right-aligned left of axis_x,
    the bar growing rightward from it, the value after the bar."""
    r = Rectangle(width=max(width, 0.05), height=0.5, color=color, fill_color=color, fill_opacity=0.8, stroke_width=0)
    r.move_to([axis_x + r.width / 2, y, 0])
    l = Text(label, font=MONO, font_size=17, color=GREY_B)
    l.move_to([axis_x - 0.25 - l.width / 2, y, 0])
    v = Text(str(value), font=MONO, font_size=17, color=WHITE).next_to(r, RIGHT, buff=0.2)
    return VGroup(l, r, v)


class Reconstruction(Scene):
    def construct(self):
        self.camera.background_color = BLACK
        caption = None

        def say(text):
            nonlocal caption
            new = caption_text(text)
            if caption is not None:
                self.play(FadeOut(caption), run_time=0.15)
            self.play(FadeIn(new), run_time=0.25)
            caption = new

        # 1. Sources.
        src = D["sources"]
        pages = sum(s["pages"] for s in src.values())
        lines = sum(s["lines"] for s in src.values())
        notes = sum(s["scanNotes"] for s in src.values())
        say("Where it came from: Sutherland's own listing, scanned page by page, typed back in as assembly.")
        stats = VGroup(
            Text(f"{pages}", font=MONO, font_size=56, color=YELLOW), Text("scanned pages", font=MONO, font_size=18, color=GREY_B),
            Text(f"{lines:,}", font=MONO, font_size=56, color=YELLOW), Text("lines of 1963 M4 assembly", font=MONO, font_size=18, color=GREY_B),
            Text(f"{notes}", font=MONO, font_size=56, color=YELLOW), Text("bracketed notes about unclear glyphs", font=MONO, font_size=18, color=GREY_B),
        ).arrange_in_grid(rows=3, cols=2, buff=(0.6, 0.35), col_alignments="rl").move_to(UP * 0.6)
        self.play(FadeIn(stats, lag_ratio=0.1), run_time=1.2)
        self.wait(2.8)
        say("Every doubtful character was written down as a doubt, not silently resolved. That matters later.")
        self.wait(2.4)
        self.play(FadeOut(stats), run_time=0.4)

        # 2. Making it run.
        say("Nothing could assemble it. The 1963 assembler is gone, so one was written to read exactly its dialect.")
        counts = VGroup(
            bar(5.5 * D["assemblerCommits"] / max(D["commitsSinceStart"], 1), PURPLE_B, "assembler commits", D["assemblerCommits"], y=1.4),
            bar(5.5 * D["emulatorCommits"] / max(D["commitsSinceStart"], 1), BLUE_C, "emulator commits", D["emulatorCommits"], y=0.6),
            bar(5.5, GREY_B, "all commits since day one", D["commitsSinceStart"], y=-0.2),
        )
        self.play(FadeIn(counts, lag_ratio=0.2), run_time=1.0)
        self.wait(2.6)
        say("Then the emulator's clock was rebuilt from the handbook's timing table, so a second here is a second there.")
        self.wait(2.6)
        self.play(FadeOut(counts), run_time=0.4)

        # 3. Evidence rules.
        classes = D["repairClasses"]
        total = sum(classes.values())
        say(f"The source got {total} repairs. Each one has a row: where, what the scan shows, what changed, and a class.")
        order = [("mechanical", GREY_B), ("verified", GREEN_C), ("inferred", ORANGE), ("speculative", RED_C)]
        rows = VGroup(*[bar(6.0 * classes.get(k, 0) / max(total, 1), c, k, classes.get(k, 0), y=2.0 - 0.75 * i, axis_x=-2.4)
                        for i, (k, c) in enumerate(order)])
        self.play(FadeIn(rows, lag_ratio=0.2), run_time=1.0)
        self.wait(2.2)
        say("'Verified' means the scan was re-read and it says so. 'Inferred' means the code only works one way. Nothing is 'speculative'.")
        self.wait(3.0)
        last = next((r for r in D["repairs"] if r["id"] == "R074"), D["repairs"][-1])
        example = VGroup(
            Text(f"{last['id']}  {last['where']}", font=MONO, font_size=16, color=YELLOW),
            Paragraph(*textwrap.wrap(last["change"], 80), font=MONO, font_size=13, color=GREY_B, line_spacing=0.8),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.12).next_to(rows, DOWN, buff=0.4).set_x(-0.2)
        if example.width > FRAME_W - 1:
            example.scale_to_fit_width(FRAME_W - 1)
        self.play(FadeIn(example), run_time=0.6)
        say("One row. A logical AND read as XOR in six copies of one macro; the scans settled it; two whole features started working.")
        self.wait(3.2)
        self.play(FadeOut(rows), FadeOut(example), run_time=0.4)

        # 4. The log.
        cps = D["checkpoints"]
        by_day = Counter(c["date"] for c in cps)
        days = sorted(by_day)
        say(f"{len(cps)} checkpoints in the research log, each dated, each with its evidence and what stayed open.")
        strip = VGroup()
        for d in days:
            col = VGroup(Rectangle(width=0.9, height=0.18 * by_day[d], color=BLUE_C, fill_color=BLUE_C, fill_opacity=0.7, stroke_width=0),
                         Text(str(by_day[d]), font=MONO, font_size=15, color=WHITE),
                         Text(d[5:], font=MONO, font_size=13, color=GREY_B)).arrange(DOWN, buff=0.08)
            strip.add(col)
        strip.arrange(RIGHT, buff=0.35, aligned_edge=DOWN).move_to(UP * 0.5)
        self.play(FadeIn(strip, lag_ratio=0.1), run_time=1.0)
        self.wait(1.4)
        titles = [c["title"] for c in cps if c["number"] in (1, 45, 73, 86, 93, 98)]
        tl = VGroup(*[Text(t, font=MONO, font_size=14, color=GREY_B) for t in titles]).arrange(DOWN, aligned_edge=LEFT, buff=0.08)
        tl.next_to(strip, DOWN, buff=0.35)
        if tl.width > FRAME_W - 1:
            tl.scale_to_fit_width(FRAME_W - 1)
        self.play(FadeIn(tl, lag_ratio=0.2), run_time=1.0)
        say(f"Negative results are recorded too. {D['decompNotes']} findings are tagged for a future readable rewrite.")
        self.wait(3.0)
        self.play(FadeOut(strip), FadeOut(tl), run_time=0.4)

        # 5. Tests as the standard.
        series = [t for t in D["regressionsByDay"] if t["regressions"] > 0 or t["date"] >= D["firstDay"]]
        say("The standard of truth: regressions that drive the real light pen through the real code in simulated real time.")
        chart = VGroup()
        mx = max(t["regressions"] for t in series) or 1
        for t in series:
            h = 2.4 * t["regressions"] / mx
            col = VGroup(Rectangle(width=0.55, height=max(h, 0.02), color=ORANGE, fill_color=ORANGE, fill_opacity=0.8, stroke_width=0),
                         Text(str(t["regressions"]), font=MONO, font_size=14, color=WHITE),
                         Text(t["date"][5:], font=MONO, font_size=12, color=GREY_B)).arrange(DOWN, buff=0.06)
            chart.add(col)
        chart.arrange(RIGHT, buff=0.2, aligned_edge=DOWN).move_to(UP * 0.5)
        if chart.width > FRAME_W - 1:
            chart.scale_to_fit_width(FRAME_W - 1)
        self.play(FadeIn(chart, lag_ratio=0.1), run_time=1.2)
        self.wait(2.0)
        say("No test checks a table against itself. Each one draws, constrains, deletes, or instances, and reads memory back.")
        self.wait(2.8)
        say("Rule of the project: no overlays, no cheated logic, no host-side geometry. Either the 1963 code does it, or it is a gap, written down.")
        self.wait(3.4)
        self.play(FadeOut(chart), FadeOut(caption), run_time=0.5)
        self.wait(0.3)
