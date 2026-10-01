"""Chapter 3: memory growing under use.

Main view: all of Sketchpad's list memory as blocks on rings, rebuilt
at every change from a timeline the regression recorded.  Picture in
picture: the scope at the same simulated instant, from the recorder.
Both come from one run of the flange regression; nothing is staged.

Render:  manim -qh scenes/memory_growth.py MemoryGrowth
Needs:   build/flange-keyframes.json, build/flange-pip/NNNN.png
"""
import json
import textwrap
from pathlib import Path

from manim import (
    DOWN, UP, LEFT, RIGHT, UL, ORIGIN, BLACK, WHITE, GREY_B, GREY_C, GREY_D, YELLOW, BLUE_C, GREEN_C,
    ORANGE, RED_C, PURPLE_B, Dot, VMobject, VGroup, Scene, Text, Paragraph, FadeIn, FadeOut,
    ImageMobject, SurroundingRectangle, DashedLine, ArcBetweenPoints, config, Transform, Create,
    Group,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
KEYFRAMES = json.loads((ROOT / "build" / "flange-keyframes.json").read_text())
PIP = sorted((ROOT / "build" / "flange-pip").glob("*.png"))
MONO = "Noto Sans Mono"
FRAME_W = config.frame_width

COLORS = {
    "master": GREY_B, "?": GREY_D, "lines": BLUE_C, "points": GREEN_C, "pictures": ORANGE,
    "constraint": RED_C, "constraint-type": PURPLE_B, "frees": GREY_D, "holders": GREY_D,
}
BIG = ("lines", "points", "pictures", "constraint")

# What to say, and when: a caption fires at the first keyframe whose
# phase matches and whose count of constraint blocks has reached `after`.
CAPTIONS = [
    ("boot", 0, "Top left: the operator's scope. Main view: every block in Sketchpad's memory, live."),
    ("boot", 0, "Before anything is drawn: just the master blocks, one per kind of thing, already on rings."),
    ("verify-line", 0, "First line. Three new blocks: a line and two points. Watch them thread onto rings."),
    ("verify-line", 0, "Each new line reuses the previous end point. One block, one more ring member. No copies."),
    ("stage-perpendicular-constraint", 0, "Now the constraints. The operator picks 'perpendicular' and points the pen at two lines."),
    ("expose-perpendicular-handles", 0, "The lines vanish on the scope. That's a display toggle: hide lines so the pen can pick points."),
    ("attach-perpendicular-handle", 0, "Wiring a constraint uses scratch points as handles. Grey dots: they come from the free ring and go back."),
    ("attach-perpendicular-handle", 1, "There it is: a red constraint block. On its type's ring, the picture's ring, and each point's ring."),
    ("attach-perpendicular-handle", 3, "Six corners, six constraints, same ritual each time. Memory grows by a block, not by a copy."),
    ("relax", 0, "RELAX. The structure stops changing. Only the numbers in the points move, and the picture follows."),
]


def p3(xy, scale=0.95, dx=0.9, dy=0.0):
    return [xy[0] * scale + dx, xy[1] * scale + dy, 0]


def caption_text(text, size=28):
    lines = textwrap.wrap(text, 62)
    p = Paragraph(*lines, alignment="center", font_size=size, line_spacing=0.9)
    if p.width > FRAME_W - 1.0:
        p.scale_to_fit_width(FRAME_W - 1.0)
    return p.to_edge(DOWN, buff=0.4)


def ring_curve(points, color):
    if len(points) == 2:
        a, b = points
        g = VGroup(ArcBetweenPoints(a, b, angle=1.2, stroke_color=color, stroke_width=1.5),
                   ArcBetweenPoints(b, a, angle=1.2, stroke_color=color, stroke_width=1.5))
        g.set_fill(opacity=0).set_stroke(opacity=0.6)
        return g
    v = VMobject(stroke_color=color, stroke_width=1.5, fill_opacity=0.0)
    v.set_points_smoothly(points + [points[0]])
    v.set_stroke(opacity=0.6)
    return v


class MemoryGrowth(Scene):
    def construct(self):
        self.camera.background_color = BLACK
        dots = {}
        rings = {}
        ties = {}
        said = set()
        caption = None

        # Picture in picture, top left.
        pip = ImageMobject(str(PIP[0])).scale_to_fit_width(3.3).to_corner(UL, buff=0.25)
        pip_box = SurroundingRectangle(pip, color=GREY_C, buff=0.04)
        pip_label = Text("the scope", font=MONO, font_size=16, color=GREY_B).next_to(pip_box, DOWN, buff=0.08)
        self.add(pip, pip_box, pip_label)

        legend = VGroup(*[
            VGroup(Dot(radius=0.07, color=c), Text(n, font=MONO, font_size=15, color=c)).arrange(RIGHT, buff=0.12)
            for n, c in (("masters", GREY_B), ("lines", BLUE_C), ("points", GREEN_C), ("picture", ORANGE),
                         ("constraints", RED_C), ("free", GREY_D))
        ]).arrange(RIGHT, buff=0.45).to_edge(UP, buff=0.25).shift(RIGHT * 1.6)
        self.add(legend)

        def say(text):
            nonlocal caption
            new = caption_text(text)
            if caption is not None:
                self.play(FadeOut(caption), run_time=0.15)
            self.play(FadeIn(new), run_time=0.25)
            caption = new

        prev_frame = None
        for index, kf in enumerate(KEYFRAMES):
            # Caption for a phase we have not captioned yet.
            n_constraints = sum(1 for v in kf["blocks"].values() if v["type"] == "constraint")
            for i, (phase, after, text) in enumerate(CAPTIONS):
                if i not in said and kf["phase"] == phase and n_constraints >= after:
                    said.add(i)
                    say(text)
                    if i == 1:
                        self.wait(1.2)
                    break
            anims = []
            # Picture in picture frame for this instant.
            if index < len(PIP) and (prev_frame is None or kf["frame"] != prev_frame):
                new_pip = ImageMobject(str(PIP[index])).scale_to_fit_width(3.3).move_to(pip)
                self.remove(pip)
                pip = new_pip
                self.add(pip)
                prev_frame = kf["frame"]
            # Blocks: add, move, remove.
            present = set()
            for b, v in kf["blocks"].items():
                if v["xy"] is None:
                    continue
                present.add(b)
                target = p3(v["xy"])
                color = COLORS.get(v["type"], WHITE)
                radius = 0.11 if v["type"] in BIG else 0.07
                if b not in dots:
                    d = Dot(target, radius=radius, color=color)
                    dots[b] = d
                    anims.append(FadeIn(d, scale=1.6))
                else:
                    d = dots[b]
                    if (abs(d.get_center()[0] - target[0]) > 1e-3 or abs(d.get_center()[1] - target[1]) > 1e-3
                            or d.get_color() != color):
                        anims.append(d.animate.move_to(target).set_color(color))
            for b in list(dots):
                if b not in present:
                    anims.append(FadeOut(dots.pop(b)))
            # Rings: rebuild curves whose membership or positions changed.
            seen = set()
            for r in kf["rings"]:
                members = [m for m in r["members"] if m in kf["blocks"] and kf["blocks"][m]["xy"] is not None]
                if len(members) < 2:
                    continue
                seen.add(r["id"])
                pts = [p3(kf["blocks"][m]["xy"]) for m in members]
                color = COLORS.get(r["headType"], GREY_C)
                if r["headType"] == "master":
                    color = GREY_C
                key = (tuple(members), tuple(tuple(round(c, 3) for c in p) for p in pts))
                if r["id"] in rings and rings[r["id"]][1] == key:
                    continue
                curve = ring_curve(pts, color)
                if r["id"] in rings:
                    old = rings[r["id"]][0]
                    anims.append(Transform(old, curve))
                    rings[r["id"]] = (old, key)
                else:
                    rings[r["id"]] = (curve, key)
                    anims.append(Create(curve))
            for rid in list(rings):
                if rid not in seen:
                    anims.append(FadeOut(rings.pop(rid)[0]))
            # Ties.
            tie_seen = set()
            for a, b in kf["ties"]:
                if a not in kf["blocks"] or b not in kf["blocks"] or kf["blocks"][a]["xy"] is None or kf["blocks"][b]["xy"] is None:
                    continue
                tid = f"{a}>{b}"
                tie_seen.add(tid)
                pa, pb = p3(kf["blocks"][a]["xy"]), p3(kf["blocks"][b]["xy"])
                key = (tuple(round(c, 3) for c in pa), tuple(round(c, 3) for c in pb))
                if tid in ties and ties[tid][1] == key:
                    continue
                line = DashedLine(pa, pb, stroke_color=GREY_B, stroke_width=0.8, dash_length=0.07).set_stroke(opacity=0.45)
                if tid in ties:
                    anims.append(Transform(ties[tid][0], line))
                    ties[tid] = (ties[tid][0], key)
                else:
                    ties[tid] = (line, key)
                    anims.append(FadeIn(line))
            for tid in list(ties):
                if tid not in tie_seen:
                    anims.append(FadeOut(ties.pop(tid)[0]))
            if anims:
                self.play(*anims, run_time=0.35 if kf["structural"] else 0.18)
            else:
                self.wait(0.06)
        self.wait(1.0)
        say("That's a drawing, as the machine holds it: blocks, rings, and the numbers inside the points.")
        self.wait(2.5)
        self.play(FadeOut(caption), run_time=0.4)
        self.wait(0.3)
