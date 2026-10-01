"""Chapter 1b: the machine in software.

How the TX-2 emulator works, shown from its own records: the code's
real shape (build/codemap.json), forty milliseconds of the real machine
tick by tick (build/ticks.jsonl, from TICK_TRACE on a regression), the
clock's table (quoted from cpu/src/control/timing.rs), and the one
boundary where modern code touches the 1963 program.

Render:  manim -qh scenes/emulator.py Emulator
"""
import json
import textwrap
from pathlib import Path

from manim import (
    DOWN, UP, LEFT, RIGHT, UL, UR, ORIGIN, BLACK, WHITE, GREY_B, GREY_C, GREY_D, YELLOW, BLUE_C, GREEN_C,
    ORANGE, RED_C, PURPLE_B, TEAL_C, Dot, VGroup, Scene, Text, Paragraph, FadeIn, FadeOut, Rectangle,
    RoundedRectangle, Line, Arrow, config, Create, Flash, SurroundingRectangle, Indicate,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CODEMAP = json.loads((ROOT / "build" / "codemap.json").read_text())
TICKS = [json.loads(l) for l in (ROOT / "build" / "ticks.jsonl").read_text().splitlines()]
MONO = "Noto Sans Mono"
FRAME_W = config.frame_width

SEQ_COLORS = {"47": ORANGE, "54": GREY_B, "55": GREEN_C, "57": GREY_B, "60": BLUE_C, "76": YELLOW}
SEQ_NAMES = {"47": "47 buttons", "54": "54 tape", "55": "55 light pen", "57": "57 reader", "60": "60 display", "76": "76 Sketchpad"}

# Rows of Table 7-8 as the emulator holds them (tenths of a microsecond),
# quoted from cpu/src/control/timing.rs.
TIMING_ROWS = [
    ("LDA, LDB ...", [128, 64, 68, 88, 68, 52, 68, 48]),
    ("STA, STB ...", [140, 76, 68, 100, 68, 52, 68, 48]),
    ("ADD, SUB", [128, 64, 68, 88, 68, 56, 68, 48]),
    ("TSD (to a device)", [144, 88, 76, 104, 76, 88, 76, 88]),
    ("MUL (per quarter)", [192, 192, 180, 184, 180, 192, 180, 176]),
]


def caption_text(text, size=28):
    lines = textwrap.wrap(text, 62)
    p = Paragraph(*lines, alignment="center", font_size=size, line_spacing=0.9)
    if p.width > FRAME_W - 1.0:
        p.scale_to_fit_width(FRAME_W - 1.0)
    return p.to_edge(DOWN, buff=0.4)


class Emulator(Scene):
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

        # 1. The code's real shape.
        say("The whole thing. Every box is real code, sized by line count.")
        boxes = VGroup()
        total = sum(p["lines"] for p in CODEMAP)
        for p in CODEMAP:
            w = max(1.7, 9.5 * p["lines"] / total * 2.2)
            color = {"cpu": BLUE_C, "base": BLUE_C, "assembler": PURPLE_B, "cli": GREY_B, "wasm bridge": TEAL_C,
                     "web": GREEN_C, "regressions": ORANGE, "Sketchpad source": YELLOW}.get(p["name"], GREY_B)
            box = RoundedRectangle(corner_radius=0.1, width=w, height=1.1, color=color, stroke_width=2)
            name = Text(p["name"], font=MONO, font_size=15, color=color)
            n = Text(f"{p['lines']:,} lines", font=MONO, font_size=13, color=GREY_B)
            VGroup(name, n).arrange(DOWN, buff=0.08).move_to(box)
            boxes.add(VGroup(box, name, n))
        boxes.arrange_in_grid(rows=2, buff=0.25).move_to(UP * 0.6)
        if boxes.width > FRAME_W - 1:
            boxes.scale_to_fit_width(FRAME_W - 1)
        self.play(FadeIn(boxes, lag_ratio=0.1), run_time=1.5)
        self.wait(1.6)
        say("Blue is the machine. Purple is the assembler that reads 1963 M4 syntax. Yellow is Sutherland's program.")
        self.wait(2.4)
        say("Green and orange are the only modern code that touches it: the web page's pen and buttons, and the tests.")
        self.wait(2.4)
        self.play(FadeOut(boxes), run_time=0.4)

        # 2. Forty milliseconds, tick by tick.
        t0 = TICKS[0]["time"]
        t1 = TICKS[-1]["time"] + TICKS[-1]["duration"]
        span = t1 - t0
        seqs = [s for s in ("47", "54", "57", "60", "76") if any(t["sequence"] == s for t in TICKS)]
        lane_y = {s: 2.2 - 0.75 * i for i, s in enumerate(seqs)}
        x0, x1 = -4.6, 3.3
        labels = VGroup()
        for s in seqs:
            lbl = Text(SEQ_NAMES[s], font=MONO, font_size=16, color=SEQ_COLORS[s])
            lbl.move_to([x0 - 0.2 - lbl.width / 2, lane_y[s], 0])
            labels.add(lbl)
        lanes = VGroup(*[Line([x0, lane_y[s], 0], [x1, lane_y[s], 0], color=GREY_D, stroke_width=1) for s in seqs])
        say(f"Now {span * 1000:.0f} milliseconds of the real machine, tick by tick, slowed about 500 times.")
        self.play(FadeIn(labels), Create(lanes), run_time=0.8)
        # Pre-draw every tick as a thin bar in its lane, dim; then sweep.
        bars = VGroup()
        for t in TICKS:
            xa = x0 + (t["time"] - t0) / span * (x1 - x0)
            xb = x0 + (t["time"] + t["duration"] - t0) / span * (x1 - x0)
            bars.add(Line([xa, lane_y[t["sequence"]], 0], [max(xb, xa + 0.004), lane_y[t["sequence"]], 0],
                          color=SEQ_COLORS[t["sequence"]], stroke_width=6).set_stroke(opacity=0.35))
        self.add(bars)
        # mini scope at the right
        scope_box = Rectangle(width=2.6, height=2.6, color=GREY_C, stroke_width=1.5).move_to([5.3, 0.9, 0])
        scope_lbl = Text("the scope", font=MONO, font_size=14, color=GREY_B).next_to(scope_box, DOWN, buff=0.06)
        self.add(scope_box, scope_lbl)
        cursor = Line([x0, 2.6, 0], [x0, lane_y[seqs[-1]] - 0.3, 0], color=WHITE, stroke_width=1.5)
        readout = Text("", font=MONO, font_size=20, color=WHITE).move_to([-0.6, -2.0, 0])
        self.add(cursor, readout)
        say("Sequence 60 is the display. It hands the scope one point, waits while the beam burns it in, hands it the next.")
        # Sweep: group ticks into ~900 steps for the animation budget.
        step = max(1, len(TICKS) // 420)
        shown_points = []
        said_switch = False
        said_buttons = False
        for i in range(0, len(TICKS), step):
            t = TICKS[i]
            x = x0 + (t["time"] - t0) / span * (x1 - x0)
            cursor.move_to([x, cursor.get_center()[1], 0])
            new_readout = Text(f"{t['sequence']}  {t['address']}  {t['instruction']}", font=MONO, font_size=18,
                               color=SEQ_COLORS[t["sequence"]]).move_to([-0.6, -2.0, 0])
            self.remove(readout)
            readout = new_readout
            self.add(readout)
            for tt in TICKS[i:i + step]:
                for e in tt["events"]:
                    if e["kind"] == "scope_point":
                        d = Dot([5.3 - 1.3 + 2.6 * e["x"] / 1022, 0.9 - 1.3 + 2.6 * e["y"] / 1022, 0], radius=0.025, color=WHITE)
                        shown_points.append(d)
                        self.add(d)
            frac = (t["time"] - t0) / span
            if not said_switch and frac > 0.3:
                said_switch = True
                switches = sum(1 for a, b in zip(TICKS, TICKS[1:]) if a["sequence"] != b["sequence"])
                say(f"While the scope is busy, the display drops out and Sketchpad runs in the gap. {switches:,} switches in {span * 1000:.0f} ms.")
            if not said_buttons and frac > 0.65:
                said_buttons = True
                say("The small sequences wake for a few microseconds: buttons read the switches, then hand the machine back.")
            self.wait(0.05)
        self.wait(0.8)
        ms = {}
        for t in TICKS:
            ms[t["sequence"]] = ms.get(t["sequence"], 0) + t["duration"] * 1000
        share = ", ".join(f"{SEQ_NAMES[s].split()[1]} {ms[s] / span / 1000 * 100:.0f}%" for s in seqs if ms.get(s, 0) > 0.5)
        say(f"Where the time went: {share}. One processor, shared by priority, no operating system.")
        self.wait(2.6)
        self.play(FadeOut(bars), FadeOut(cursor), FadeOut(readout), FadeOut(labels), FadeOut(lanes),
                  FadeOut(scope_box), FadeOut(scope_lbl), *[FadeOut(d) for d in shown_points], run_time=0.5)

        # 3. The clock.
        say("How long is a tick? The 1963 handbook has a table. The emulator holds every row of it.")
        header = Text("tenths of a microsecond   S/S  S/T  S/V  T/S  T/T  T/V  V/S  V/T", font=MONO, font_size=16, color=GREY_B)
        rows = VGroup(header)
        for name, vals in TIMING_ROWS:
            rows.add(Text(f"{name:18s}" + "".join(f"{v:5d}" for v in vals), font=MONO, font_size=16, color=WHITE))
        rows.arrange(DOWN, aligned_edge=LEFT, buff=0.14).move_to(UP * 0.8)
        self.play(FadeIn(rows, lag_ratio=0.1), run_time=1.0)
        self.wait(1.0)
        say("Columns are where the instruction and its operand live: core (S), the fast T memory, or V registers.")
        self.wait(2.6)
        say("A load from core: 6.4 microseconds. A multiply: nineteen. A TSD to the scope: about nine, plus the wait.")
        self.wait(2.8)
        self.play(FadeOut(rows), run_time=0.4)

        # 4. The boundary.
        say("Last: the one place modern code touches the program.")
        left = RoundedRectangle(corner_radius=0.12, width=4.6, height=3.0, color=BLUE_C, stroke_width=2).move_to(LEFT * 3.2 + UP * 0.6)
        lt = VGroup(Text("TX-2 in WebAssembly", font=MONO, font_size=20, color=BLUE_C),
                    Text("memory, sequences, clock,", font=MONO, font_size=15, color=GREY_B),
                    Text("scope unit 60, pen unit 55,", font=MONO, font_size=15, color=GREY_B),
                    Text("buttons, toggles, knobs", font=MONO, font_size=15, color=GREY_B)).arrange(DOWN, buff=0.1).move_to(left)
        right = RoundedRectangle(corner_radius=0.12, width=4.6, height=3.0, color=GREEN_C, stroke_width=2).move_to(RIGHT * 3.2 + UP * 0.6)
        rt = VGroup(Text("the page (or the test bed)", font=MONO, font_size=20, color=GREEN_C),
                    Text("draws scope points", font=MONO, font_size=15, color=GREY_B),
                    Text("sends pen position, buttons,", font=MONO, font_size=15, color=GREY_B),
                    Text("toggles, knob turns", font=MONO, font_size=15, color=GREY_B)).arrange(DOWN, buff=0.1).move_to(right)
        self.play(FadeIn(left), FadeIn(lt), FadeIn(right), FadeIn(rt), run_time=0.8)
        a1 = Arrow(left.get_right() + UP * 0.5, right.get_left() + UP * 0.5, buff=0.1, color=WHITE, stroke_width=3)
        a1l = Text("step_batch(ticks) -> scope point events", font=MONO, font_size=14, color=WHITE).next_to(a1, UP, buff=0.08)
        a2 = Arrow(right.get_left() + DOWN * 0.5, left.get_right() + DOWN * 0.5, buff=0.1, color=WHITE, stroke_width=3)
        a2l = Text("set_light_pen, set_external_input, set_knob", font=MONO, font_size=14, color=WHITE).next_to(a2, DOWN, buff=0.08)
        self.play(Create(a1), FadeIn(a1l), Create(a2), FadeIn(a2l), run_time=0.9)
        self.wait(1.2)
        say("Points out, hardware inputs in. Nothing else crosses. No geometry, no shortcuts, no help for the 1963 code.")
        self.wait(3.0)
        self.play(FadeOut(VGroup(left, lt, right, rt, a1, a1l, a2, a2l)), FadeOut(caption), run_time=0.5)
        self.wait(0.3)
