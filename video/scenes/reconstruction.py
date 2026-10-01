"""Chapter 0: how it was brought back.

A story in six parts, told from the repository's own records
(build/reconstruction.json from data/reconstruction_data.py): the relic,
the volunteers who spent five years on it, the different bet made in
2026, the loop that did the work, the trap it fell into and the rule
that came out of it, and where it stands.  Quotes are the real text of
the upstream READMEs and the research log.

Render:  manim -qh scenes/reconstruction.py Reconstruction
Needs:   build/assets/scan-page.png, film-flange.png, emulator-flange.png
"""
import json
import textwrap
from pathlib import Path

from manim import (
    DOWN, UP, LEFT, RIGHT, BLACK, WHITE, GREY_B, GREY_C, YELLOW, BLUE_C, GREEN_C, ORANGE,
    RED_C, PURPLE_B, VGroup, Scene, Text, Paragraph, FadeIn, FadeOut, Rectangle, config,
    ImageMobject, SurroundingRectangle, Create,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
D = json.loads((ROOT / "build" / "reconstruction.json").read_text())
ASSETS = ROOT / "build" / "assets"
MONO = "Noto Sans Mono"
FRAME_W = config.frame_width


def caption_text(text, size=28):
    lines = textwrap.wrap(text, 64)
    p = Paragraph(*lines, alignment="center", font_size=size, line_spacing=0.9)
    if p.width > FRAME_W - 1.0:
        p.scale_to_fit_width(FRAME_W - 1.0)
    return p.to_edge(DOWN, buff=0.4)


def quote(text, width=78, size=16, color=GREY_B):
    p = Paragraph(*textwrap.wrap(text, width), font=MONO, font_size=size, color=color, line_spacing=0.85)
    if p.width > FRAME_W - 1.2:
        p.scale_to_fit_width(FRAME_W - 1.2)
    return p


def bar(width, color, label, value, y=0.0, axis_x=-1.6):
    r = Rectangle(width=max(width, 0.05), height=0.45, color=color, fill_color=color, fill_opacity=0.8, stroke_width=0)
    r.move_to([axis_x + r.width / 2, y, 0])
    l = Text(label, font=MONO, font_size=16, color=GREY_B)
    l.move_to([axis_x - 0.25 - l.width / 2, y, 0])
    v = Text(str(value), font=MONO, font_size=16, color=WHITE).next_to(r, RIGHT, buff=0.2)
    return VGroup(l, r, v)


class Reconstruction(Scene):
    def construct(self):
        self.camera.background_color = BLACK
        caption = None

        def say(text, hold=0.0):
            nonlocal caption
            new = caption_text(text)
            if caption is not None:
                self.play(FadeOut(caption), run_time=0.15)
            self.play(FadeIn(new), run_time=0.25)
            caption = new
            if hold:
                self.wait(hold)

        # ---- 1. The relic ----
        src = D["sources"]
        pages = sum(s["pages"] for s in src.values())
        scan = ImageMobject(str(ASSETS / "scan-page.png")).scale_to_fit_height(5.4).move_to(LEFT * 3.4 + UP * 0.5)
        scan_box = SurroundingRectangle(scan, color=GREY_C, buff=0.03)
        self.play(FadeIn(scan), Create(scan_box), run_time=0.8)
        say("1963. Sketchpad ran on one computer, the TX-2 at Lincoln Lab. The TX-2 was scrapped in the seventies.", 3.0)
        say("What survived: a photocopy of the program listing, which Sutherland gave to the Computer History Museum.", 3.0)
        facts = VGroup(
            Text(f"{pages} pages", font=MONO, font_size=30, color=YELLOW),
            Text("typewriter output, photocopied", font=MONO, font_size=16, color=GREY_B),
            Text("superscripts and subscripts carry meaning", font=MONO, font_size=16, color=GREY_B),
            Text("many are unreadable", font=MONO, font_size=16, color=GREY_B),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.15).move_to(RIGHT * 2.8 + UP * 0.8)
        self.play(FadeIn(facts, lag_ratio=0.2), run_time=0.8)
        say("No assembler for it exists. No machine to run it on. Just paper.", 3.0)
        self.play(FadeOut(scan), FadeOut(scan_box), FadeOut(facts), run_time=0.4)

        # ---- 2. The volunteers ----
        say("People tried. From 2021 a small open-source group, the TX-2 Project, set out to rebuild the machine itself.", 3.0)
        years = sorted(y for y in D["authorsByYear"] if y < "2026")
        top = max(sum(v.values()) for y, v in D["authorsByYear"].items() if y < "2026")
        rows = VGroup()
        for i, y in enumerate(years):
            v = D["authorsByYear"][y]
            total = sum(v.values())
            who = ", ".join(f"{n} {c}" for n, c in sorted(v.items(), key=lambda kv: -kv[1])[:2])
            rows.add(bar(6.0 * total / top, BLUE_C, y, f"{total}   {who}", y=1.9 - 0.6 * i, axis_x=-3.6))
        self.play(FadeIn(rows, lag_ratio=0.15), run_time=1.0)
        say("A TX-2 simulator in Rust, built from the 1963 handbook opcode by opcode, in spare time. And in 2023, a transcription of the listing.", 3.4)
        say("Their strategy: build the whole machine faithfully first, then one day run Sketchpad on it. Careful, honest, slow.", 3.2)
        self.play(FadeOut(rows), run_time=0.4)
        q1 = quote('"' + D["quotes"]["simulatorState"] + '"').move_to(UP * 1.4)
        q2 = quote('"' + D["quotes"]["transcriptionStatus"] + '"').next_to(q1, DOWN, buff=0.5)
        self.play(FadeIn(q1), run_time=0.6)
        say("Their own words, from the simulator's design notes.", 2.8)
        self.play(FadeIn(q2), run_time=0.6)
        say("And from the transcription's README, as of August 2025. Five years in, the source had never assembled.", 3.4)
        self.play(FadeOut(q1), FadeOut(q2), run_time=0.4)

        # ---- 3. A different bet ----
        sess = D["session"]
        fq = quote('"' + D["firstQuestion"] + '"', width=70, size=20, color=WHITE).move_to(UP * 0.8)
        self.play(FadeIn(fq), run_time=0.6)
        say("September 14th, 2026. One question to an AI coding agent.", 3.2)
        self.play(FadeOut(fq), run_time=0.3)
        nums = VGroup(
            Text(f"{sess['messages']}", font=MONO, font_size=44, color=YELLOW), Text("messages", font=MONO, font_size=16, color=GREY_B),
            Text(f"{sess['toolCalls']:,}", font=MONO, font_size=44, color=YELLOW), Text("tool calls", font=MONO, font_size=16, color=GREY_B),
            Text(f"{sess['rawBytes'] / 1e6:.0f} MB", font=MONO, font_size=44, color=YELLOW), Text("of session log", font=MONO, font_size=16, color=GREY_B),
            Text("30 h", font=MONO, font_size=44, color=YELLOW), Text("wall clock, one session", font=MONO, font_size=16, color=GREY_B),
        ).arrange_in_grid(rows=4, cols=2, buff=(0.5, 0.3), col_alignments="rl").move_to(UP * 0.6)
        self.play(FadeIn(nums, lag_ratio=0.1), run_time=1.0)
        say(f"The first session alone: {sess['messages']} messages and {sess['toolCalls']:,} tool calls in thirty hours. The honest answer to 'how' starts with mountains of compute.", 3.6)
        self.play(FadeOut(nums), run_time=0.4)
        per_day = D["commitsPerDay"]
        strip = VGroup()
        for d, n in per_day.items():
            strip.add(VGroup(Rectangle(width=0.8, height=0.04 * n, color=ORANGE, fill_color=ORANGE, fill_opacity=0.8, stroke_width=0),
                             Text(str(n), font=MONO, font_size=14, color=WHITE),
                             Text(d[5:], font=MONO, font_size=12, color=GREY_B)).arrange(DOWN, buff=0.06))
        strip.arrange(RIGHT, buff=0.4, aligned_edge=DOWN).move_to(UP * 0.6)
        self.play(FadeIn(strip, lag_ratio=0.1), run_time=0.8)
        say(f"{sum(per_day.values())} commits in six working days, after five years of groundwork. But compute alone is not the difference. The strategy was.", 3.6)
        self.play(FadeOut(strip), run_time=0.4)

        # ---- 4. The strategy: run it and let it tell you ----
        say("Instead of finishing the machine first, run the program at once and let every failure name the next missing piece.", 3.4)
        loop = VGroup(*[Text(t, font=MONO, font_size=18, color=c) for t, c in (
            ("assemble the listing", PURPLE_B), ("it fails: the assembler lacks a 1963 M4 form", GREY_B),
            ("teach the assembler that form; assemble again", PURPLE_B), ("load the tape; run; it halts on a missing instruction", GREY_B),
            ("implement that instruction from the handbook; run again", BLUE_C), ("it draws one more thing; the printed octal says if it is right", GREEN_C),
        )]).arrange(DOWN, aligned_edge=LEFT, buff=0.18).move_to(UP * 0.7)
        self.play(FadeIn(loop, lag_ratio=0.2), run_time=1.2)
        say(f"That loop ran hundreds of times. {D['assemblerCommits']} commits taught the assembler M4's dialect. {D['emulatorCommits']} filled in the machine.", 3.4)
        self.play(FadeOut(loop), run_time=0.4)
        findings = D["trackerFindings"][:5]
        fl = VGroup(*[quote(f"{i + 1}. {f}", width=95, size=13) for i, f in enumerate(findings)]).arrange(DOWN, aligned_edge=LEFT, buff=0.14).move_to(UP * 0.6)
        if fl.width > FRAME_W - 1:
            fl.scale_to_fit_width(FRAME_W - 1)
        self.play(FadeIn(fl, lag_ratio=0.15), run_time=1.2)
        say("One run of Sketchpad's own pen tracker exposed five missing pieces of the machine at once. Each fixed from the handbook, each with a test.", 3.6)
        self.play(FadeOut(fl), run_time=0.4)
        oracle = [c for c in D["checkpoints"] if c["number"] in (18, 19, 21, 22, 24, 26)]
        ol = VGroup(*[Text(f"{c['number']:>3}  {c['title']}", font=MONO, font_size=15, color=GREY_B) for c in oracle]).arrange(DOWN, aligned_edge=LEFT, buff=0.12).move_to(UP * 0.7)
        if ol.width > FRAME_W - 1:
            ol.scale_to_fit_width(FRAME_W - 1)
        self.play(FadeIn(ol, lag_ratio=0.15), run_time=0.9)
        say("And an oracle: where the listing prints assembled addresses, the assembler had to reproduce them exactly. Checkpoint after checkpoint, matched.", 3.4)
        self.play(FadeOut(ol), run_time=0.3)

        # ---- 5. The trap ----
        say("Then the trap. Day two: shapes appeared on a phone screen. It looked like Sketchpad drawing. It was not.", 3.0)
        r = quote('"' + D["quotes"]["retraction"] + '"', width=80, size=17, color=RED_C).move_to(UP * 1.2)
        self.play(FadeIn(r), run_time=0.6)
        say("A browser overlay had drawn the shapes while the 1963 program ran underneath. The research log retracted it, in writing, the next day.", 3.6)
        b = quote(D["quotes"]["boundary"], width=90, size=14).next_to(r, DOWN, buff=0.5)
        self.play(FadeIn(b), run_time=0.6)
        say("Out of that came the rule everything since obeys: modern code supplies hardware inputs and draws the beam. Nothing else. Ever.", 3.6)
        self.play(FadeOut(r), FadeOut(b), run_time=0.4)

        # ---- 6. Evidence, and where it stands ----
        classes = D["repairClasses"]
        total = sum(classes.values())
        order = [("mechanical", GREY_B), ("verified", GREEN_C), ("inferred", ORANGE), ("speculative", RED_C)]
        rows = VGroup(*[bar(5.5 * classes.get(k, 0) / max(total, 1), c, k, classes.get(k, 0), y=1.9 - 0.6 * i, axis_x=-2.2)
                        for i, (k, c) in enumerate(order)])
        self.play(FadeIn(rows, lag_ratio=0.2), run_time=0.8)
        say(f"The source itself got {total} repairs, each a row: where, what the scan shows at 300 dpi, what changed, and a grade. None speculative.", 3.4)
        self.play(FadeOut(rows), run_time=0.4)
        cps = D["checkpoints"]
        picks = [c for c in cps if c["number"] in (1, 17, 26, 34, 43, 45, 86, 90, 93, 98)]
        tl = VGroup(*[Text(f"{c['number']:>3}  {c['date'][5:]}  {c['title']}", font=MONO, font_size=14,
                          color=WHITE if c["number"] in (43, 86) else GREY_B) for c in picks]).arrange(DOWN, aligned_edge=LEFT, buff=0.1).move_to(UP * 0.5)
        if tl.width > FRAME_W - 1:
            tl.scale_to_fit_width(FRAME_W - 1)
        self.play(FadeIn(tl, lag_ratio=0.1), run_time=1.0)
        say(f"{len(cps)} checkpoints in the research log, the way a lab notebook works: dated, with the evidence, the negative results, and what stayed open.", 3.6)
        self.play(FadeOut(tl), run_time=0.4)
        film = ImageMobject(str(ASSETS / "film-flange.png")).scale_to_fit_width(5.6).move_to(LEFT * 3.3 + UP * 0.7)
        emu = ImageMobject(str(ASSETS / "emulator-flange.png")).scale_to_fit_width(5.6).move_to(RIGHT * 3.3 + UP * 0.7)
        fl_ = Text("the 1963 film", font=MONO, font_size=15, color=GREY_B).next_to(film, DOWN, buff=0.1)
        el_ = Text("the emulator, same operation", font=MONO, font_size=15, color=GREY_B).next_to(emu, DOWN, buff=0.1)
        self.play(FadeIn(film), FadeIn(fl_), run_time=0.6)
        self.play(FadeIn(emu), FadeIn(el_), run_time=0.6)
        say("The last judge is the film. Every operation the 1963 demonstrations show now runs through the original code, pen in, beam out.", 3.6)
        say("Five years of careful groundwork, then one week of relentless, checked, written-down iteration. That is how.", 3.4)
        self.play(FadeOut(film), FadeOut(emu), FadeOut(fl_), FadeOut(el_), FadeOut(caption), run_time=0.5)
        self.wait(0.3)
