"""Chapter 0: a question, an explosion, a running TX-2.

The story of the reconstruction as the record tells it: one line of
text, 6,006 tool calls in thirty hours, and a 1963 machine running in a
browser.  Every dot is a real tool call at its real time
(build/session-timeline.json from the provenance ledger), every quote
is the operator's real message at its real hour, every image is from
the session's assets or the emulator's scope.

Render:  manim -qh scenes/reconstruction.py Reconstruction
"""
import json
import math
import random
import textwrap
from pathlib import Path

from manim import (
    DOWN, UP, LEFT, RIGHT, ORIGIN, UL, UR, DL, DR, BLACK, WHITE, GREY_B, GREY_C, GREY_D, YELLOW, BLUE_C, GREEN_C,
    ORANGE, RED_C, PURPLE_B, TEAL_C, VGroup, Group, Scene, Text, Paragraph, FadeIn, FadeOut, Rectangle, Line,
    Dot, config, ImageMobject, SurroundingRectangle, Create, LaggedStart, Transform, Indicate, Flash,
    rate_functions,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
T = json.loads((ROOT / "build" / "session-timeline.json").read_text())
D = json.loads((ROOT / "build" / "reconstruction.json").read_text())
ASSETS = ROOT / "build" / "assets"
MONO = "Noto Sans Mono"
FRAME_W = config.frame_width

CLOCK_X0, CLOCK_X1, CLOCK_Y = -6.0, 6.0, 2.0
HOURS = 30.0


def hx(h):
    return CLOCK_X0 + (CLOCK_X1 - CLOCK_X0) * h / HOURS


def caption_text(text, size=28):
    lines = textwrap.wrap(text, 64)
    p = Paragraph(*lines, alignment="center", font_size=size, line_spacing=0.9)
    if p.width > FRAME_W - 1.0:
        p.scale_to_fit_width(FRAME_W - 1.0)
    return p.to_edge(DOWN, buff=0.4)


def quote(text, width=66, size=22, color=WHITE):
    p = Paragraph(*textwrap.wrap(text, width), font=MONO, font_size=size, color=color, line_spacing=0.9)
    if p.width > FRAME_W - 1.6:
        p.scale_to_fit_width(FRAME_W - 1.6)
    return p


class Reconstruction(Scene):
    def construct(self):
        self.camera.background_color = BLACK
        rnd = random.Random(1963)
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

        # ---- 1. One line of text ----
        q0 = quote('"' + T["featured"][0]["text"] + '"', width=60, size=26)
        self.play(FadeIn(q0), run_time=1.0)
        say("September 14th, 2026, 10:44 pm. A voice-dictated message to a coding agent.", 3.0)
        q1 = quote('"' + T["featured"][1]["text"] + '"', width=60, size=26, color=YELLOW).next_to(q0, DOWN, buff=0.6)
        self.play(FadeIn(q1), run_time=0.8)
        say("Nine minutes later. Nobody had ever run Sketchpad again. That was the project.", 3.2)
        self.play(FadeOut(q1), run_time=0.3)
        self.play(q0.animate.scale(0.42).move_to(UP * 3.45), run_time=0.8)

        # ---- 2. The explosion ----
        calls = T["calls"]
        n = len(calls)
        say(f"What happened next: {n:,} tool calls in thirty hours. Every dot is one of them, at its real time.", 1.0)
        origin = q0.get_center() + DOWN * 0.2
        dots = VGroup()
        targets = []
        for i, h in enumerate(calls):
            d = Dot(origin, radius=0.014, color=BLUE_C).set_opacity(0.0)
            dots.add(d)
            targets.append([hx(h), CLOCK_Y + rnd.uniform(-0.28, 0.28), 0])
        self.add(dots)
        # burst outward, then settle onto the clock
        burst = []
        for d in dots:
            ang = rnd.uniform(0, 2 * math.pi)
            r = rnd.uniform(0.5, 4.5)
            burst.append([origin[0] + r * math.cos(ang), origin[1] + r * math.sin(ang) * 0.6, 0])
        self.play(LaggedStart(*[d.animate.move_to(b).set_opacity(0.9) for d, b in zip(dots, burst)], lag_ratio=0.0004),
                  run_time=2.6, rate_func=rate_functions.ease_out_cubic)
        self.play(LaggedStart(*[d.animate.move_to(t).set_opacity(0.55) for d, t in zip(dots, targets)], lag_ratio=0.0002),
                  run_time=2.4, rate_func=rate_functions.ease_in_out_sine)
        axis = Line([CLOCK_X0, CLOCK_Y - 0.4, 0], [CLOCK_X1, CLOCK_Y - 0.4, 0], color=GREY_C, stroke_width=1)
        ticks = VGroup(*[VGroup(Line([hx(h), CLOCK_Y - 0.4, 0], [hx(h), CLOCK_Y - 0.5, 0], color=GREY_C, stroke_width=1),
                                Text(f"{h}h", font=MONO, font_size=12, color=GREY_B).next_to([hx(h), CLOCK_Y - 0.5, 0], DOWN, buff=0.05))
                         for h in range(0, 31, 5)])
        self.play(Create(axis), FadeIn(ticks), run_time=0.6)
        say("That is the mountain of compute, laid out as a thirty-hour clock. The gap near hour eleven: the operator asleep, the agent still going.", 3.4)
        gap = T["sleepGap"]
        sleep_box = Rectangle(width=hx(gap[1]) - hx(gap[0]), height=0.75, color=GREY_D, stroke_width=1).move_to([(hx(gap[0]) + hx(gap[1])) / 2, CLOCK_Y, 0])
        self.play(Create(sleep_box), run_time=0.5)
        self.wait(0.8)

        # ---- 3. The operator's marks ----
        ops = T["operator"]
        marks = VGroup(*[Line([hx(m["hour"]), CLOCK_Y + 0.42, 0], [hx(m["hour"]), CLOCK_Y + 0.62, 0], color=YELLOW, stroke_width=2) for m in ops])
        self.play(FadeIn(marks, lag_ratio=0.02), run_time=1.2)
        say(f"And above it, the human: {len(ops)} messages in those thirty hours. Yellow marks. Not one line of code among them.", 3.4)
        say("What were they? Mostly status checks and 'keep going'. But a handful of them set the course. Here they are, in order.", 3.2)

        # ---- 4. Walk the clock ----
        cursor = Line([hx(0), CLOCK_Y + 0.7, 0], [hx(0), CLOCK_Y - 0.55, 0], color=WHITE, stroke_width=1.5)
        self.add(cursor)
        shown = None

        def beat(hour, text, hold, color=WHITE, img=None, img_pos=None, img_w=4.6, label=None):
            nonlocal shown
            self.play(cursor.animate.move_to([hx(hour), CLOCK_Y + 0.075, 0]), run_time=0.5)
            group = Group()
            if img is not None:
                im = ImageMobject(str(ASSETS / img)).scale_to_fit_width(img_w).move_to(img_pos if img_pos is not None else (RIGHT * 3.4 + DOWN * 0.5))
                box = SurroundingRectangle(im, color=GREY_C, buff=0.03)
                group.add(im, box)
                if label:
                    group.add(Text(label, font=MONO, font_size=13, color=GREY_B).next_to(box, DOWN, buff=0.08))
            qm = quote('"' + text + '"', width=44 if img is not None else 70, size=20, color=color)
            qm.move_to((LEFT * 3.1 + DOWN * 0.3) if img is not None else DOWN * 0.3)
            if qm.width > (6.2 if img is not None else FRAME_W - 1.6):
                qm.scale_to_fit_width(6.2 if img is not None else FRAME_W - 1.6)
            group.add(qm)
            stamp = Text(f"hour {hour:.1f}", font=MONO, font_size=14, color=YELLOW).next_to(qm, UP, buff=0.2).align_to(qm, LEFT)
            group.add(stamp)
            if shown is not None:
                self.play(FadeOut(shown), run_time=0.2)
            self.play(FadeIn(group), run_time=0.5)
            shown = group
            self.wait(hold)

        f = {q["text"][:20]: q for q in T["featured"]}
        def fq(prefix):
            return next(q for q in T["featured"] if q["text"].startswith(prefix))

        q = fq("Do we start by repairing")
        beat(q["hour"], q["text"], 0.2)
        say("Hour 0.2. The first real decision: repair the real assembly into one plain-text file. Not a rewrite. Not a tribute.", 3.4)
        q = fq("we’re going to target WASM")
        beat(q["hour"], q["text"], 0.2)
        say("Hour 1.5. It will run in a browser. The agent had found an old web shell in the simulator repo; the fork point stayed where it was.", 3.2)
        q = fq("Make sure we’re keeping logs")
        beat(q["hour"], q["text"], 0.2)
        say("Hour 2.8. The research log is born. Today it has 100 checkpoints. This sentence is why there is evidence at all.", 3.4)
        beat(5.3, "All eight Sketchpad jobs assemble into TX-2 paper-tape images.", 0.2, color=GREEN_C)
        say("Hour 5.3, the agent's report. The listing assembles. Five years of groundwork, then five hours.", 3.2)
        q = fq("Get this hosted")
        beat(q["hour"], q["text"], 0.2, img="scope-ink.png", label="the emulated scope: INK, and the tracking cross")
        say("Hour 12.6: put it on the web. Hour 12.8: it is live, INK on the scope. Sketchpad is running thirteen hours after the question.", 3.6)
        q = fq("Are we lying anywhere")
        beat(q["hour"], q["text"], 0.2, img="mobile-input-failure-2026-09-15-1201.jpg", img_w=1.35, img_pos=RIGHT * 4.9 + UP * 0.25, label="the phone, that morning")
        say("Hour 15.1. The question that saved the project. The agent's answer: the mobile shapes were fake ink, drawn by JavaScript on top.", 3.6)
        q = fq("Buddy wtf")
        beat(q["hour"], q["text"], 0.2, color=RED_C)
        self.wait(1.6)
        q = fq("You’re in the stratosphere")
        beat(q["hour"], q["text"], 0.2)
        say("Hour 15.3. The other kind of steering: the agent had started inventing its own safety gates. Back to earth. Back to the goal.", 3.2)
        q = fq("do NOT paper things over")
        beat(q["hour"], q["text"], 0.2, color=YELLOW)
        say("Hour 15.5. The rule, in the operator's words. The research log retracted the fake result the next day and has lived by this since.", 3.6)
        beat(23.8, "D draws a line through the original assembly. T creates the real horizontal-or-vertical constraint. Solve runs the original RELAX solver.", 0.2, color=GREEN_C)
        say("Hour 23.8, the agent's report. Twenty-four hours in: a line drawn by the 1963 code and a constraint solved by its own solver.", 3.4)
        q = fq("When the mouse is over")
        beat(q["hour"], q["text"], 0.2)
        say("Hour 25.7. The one product decision: the mouse is always the pen, a click is the pen's sensor. That is still the control scheme.", 3.4)
        q = fq("Okay I think like state management")
        beat(q["hour"], q["text"], 0.2)
        say("Hours 24 to 28: the operator as test pilot. Lag, seams, lines flipping. And at 28.1: 'possible this is a flaw with the program tbh... but carefully consider if it's on our side.'", 3.6)
        beat(28.0, "The emulator lost the TX-2 positive-zero and negative-zero distinction. This caused axis seams, boundary bars, and extreme line flips.", 0.2, color=GREEN_C)
        say("It was on our side. A ones-complement machine has two zeros; the emulator had forgotten one. Found by a hand on a mouse, not by a test.", 3.4)
        beat(29.5, "Yes. This is the milestone. That shape came from the reconstructed Sketchpad assembly.", 0.2, color=GREEN_C,
             img="photo-crop.jpg", img_w=4.8, label="the operator's photograph, hour 29.5")
        say("Hour 29.5. The operator sends a photo of the screen. The agent confirms what made it. Then the session moves on to other work.", 3.6)
        self.play(FadeOut(shown), FadeOut(cursor), run_time=0.4)
        shown = None

        # ---- 5. The division of labour ----
        say("So where was the line between an informed operator and a mountain of compute? The record is clear.", 3.0)
        left = VGroup(Text("the machine", font=MONO, font_size=22, color=BLUE_C),
                      Text(f"{n:,} tool calls", font=MONO, font_size=18, color=GREY_B),
                      Text(f"{D['commitsSinceStart']} commits", font=MONO, font_size=18, color=GREY_B),
                      Text("every instruction, every test", font=MONO, font_size=18, color=GREY_B)).arrange(DOWN, buff=0.12).move_to(LEFT * 3.2 + DOWN * 0.4)
        right = VGroup(Text("the human", font=MONO, font_size=22, color=YELLOW),
                       Text("the goal: the real program, not a tribute", font=MONO, font_size=17, color=GREY_B),
                       Text("the standard: a log a historian could read", font=MONO, font_size=17, color=GREY_B),
                       Text("the question: are we lying anywhere?", font=MONO, font_size=17, color=GREY_B),
                       Text("the rule: emulate, never paper over", font=MONO, font_size=17, color=GREY_B),
                       Text("the hands: a mouse that found a lost zero", font=MONO, font_size=17, color=GREY_B)).arrange(DOWN, buff=0.12).move_to(RIGHT * 3.0 + DOWN * 0.4)
        self.play(FadeIn(left), run_time=0.6)
        self.play(FadeIn(right, lag_ratio=0.2), run_time=1.2)
        say("The machine did the ten thousand steps. The human supplied five sentences, and the five sentences are why the steps add up to something true.", 4.0)
        self.play(FadeOut(left), FadeOut(right), run_time=0.4)

        # ---- 6. A running TX-2 ----
        self.play(FadeOut(dots), FadeOut(marks), FadeOut(axis), FadeOut(ticks), FadeOut(sleep_box), FadeOut(q0), run_time=0.8)
        s1 = ImageMobject(str(ASSETS / "scope-330.png")).scale_to_fit_width(4.0).move_to(LEFT * 4.3 + UP * 0.5)
        s2 = ImageMobject(str(ASSETS / "scope-755.png")).scale_to_fit_width(4.0).move_to(UP * 0.5)
        s3 = ImageMobject(str(ASSETS / "film-flange.png")).scale_to_fit_width(4.0).move_to(RIGHT * 4.3 + UP * 0.5)
        l1 = Text("the emulator: flange drawn", font=MONO, font_size=13, color=GREY_B).next_to(s1, DOWN, buff=0.08)
        l2 = Text("the emulator: RELAX has squared it", font=MONO, font_size=13, color=GREY_B).next_to(s2, DOWN, buff=0.08)
        l3 = Text("the 1963 film, same operation", font=MONO, font_size=13, color=GREY_B).next_to(s3, DOWN, buff=0.08)
        self.play(FadeIn(s1), FadeIn(l1), run_time=0.5)
        self.play(FadeIn(s2), FadeIn(l2), run_time=0.5)
        self.play(FadeIn(s3), FadeIn(l3), run_time=0.5)
        say(f"The days after added constraints, the handbook's clock, instances, and the films as the final judge. {len(D['checkpoints'])} checkpoints, {sum(D['repairClasses'].values())} graded repairs.", 3.6)
        say("A question, an explosion, a running TX-2. And a written record of every step, so you do not have to take anyone's word for it.", 4.0)
        self.play(FadeOut(s1), FadeOut(s2), FadeOut(s3), FadeOut(l1), FadeOut(l2), FadeOut(l3), FadeOut(caption), run_time=0.6)
        self.wait(0.3)
