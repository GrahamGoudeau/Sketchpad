"""The gestalt: all of list memory as rings threaded through blocks.

Reads build/flange-layout.json (rings.py then layout.py over
data/flange.json, a snapshot after the solved flange).  Every node is a
real block, every ring a real cycle of ring words, every tie a real hen
word.  Then a traversal: start at the root, walk down the tree of
rings to a line, cross a tie to its point, walk the point's ring to the
next line, and so on round the flange.

Render:  manim -qh scenes/gestalt.py Gestalt
"""
import json
import math
import textwrap
from pathlib import Path

from manim import (
    DOWN, UP, LEFT, RIGHT, ORIGIN, BLACK, WHITE, GREY_B, GREY_C, GREY_D, YELLOW, BLUE_C, GREEN_C,
    ORANGE, RED_C, PURPLE_B, TEAL_C, Dot, VMobject, VGroup, Scene, Text, Paragraph, FadeIn, FadeOut,
    Create, Flash, Line, Arrow, config, Indicate, MoveAlongPath, ArcBetweenPoints, DashedLine,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
G = json.loads((ROOT / "build" / "flange-layout.json").read_text())
MONO = "Noto Sans Mono"
FRAME_W = config.frame_width

COLORS = {
    "master": GREY_B, "?": GREY_D, "lines": BLUE_C, "points": GREEN_C, "pictures": ORANGE,
    "constraint": RED_C, "constraint-type": PURPLE_B, "frees": GREY_D, "holders": GREY_D,
}


def p3(xy):
    return [xy[0], xy[1], 0]


def caption_text(text, size=30):
    lines = textwrap.wrap(text, 58)
    p = Paragraph(*lines, alignment="center", font_size=size, line_spacing=0.9)
    if p.width > FRAME_W - 1.0:
        p.scale_to_fit_width(FRAME_W - 1.0)
    return p.to_edge(DOWN, buff=0.45)


def ring_curve(points, color, width=2.0):
    """A smooth closed curve through the member positions, in ring order."""
    if len(points) == 2:
        a, b = points
        c = VGroup(ArcBetweenPoints(a, b, angle=1.2, color=color, stroke_width=width),
                   ArcBetweenPoints(b, a, angle=1.2, color=color, stroke_width=width))
        c.set_fill(opacity=0.0)
        return c
    v = VMobject(stroke_color=color, stroke_width=width, fill_opacity=0.0)
    v.set_points_smoothly(points + [points[0]])
    return v


class Gestalt(Scene):
    def construct(self):
        self.camera.background_color = BLACK
        blocks = G["blocks"]
        pos = {b: p3(xy) for b, xy in G["layout"].items()}
        # shift everything up a little to leave the caption strip free
        for b in pos:
            pos[b][1] += 0.35
        pos = {b: [x * 0.92, y * 0.82, 0] for b, (x, y, _) in pos.items()}

        caption = caption_text("This is ALL of Sketchpad's memory after drawing the flange. Every dot is a block.")
        dots = {}
        for b, v in blocks.items():
            r = 0.09 if v["type"] in ("master", "?", "frees", "holders") else 0.13
            dots[b] = Dot(pos[b], radius=r, color=COLORS.get(v["type"], WHITE))
        self.play(FadeIn(VGroup(*dots.values()), lag_ratio=0.01), FadeIn(caption), run_time=1.6)
        self.wait(1.4)

        def say(text, size=30):
            nonlocal caption
            new = caption_text(text, size)
            self.play(FadeOut(caption), run_time=0.15)
            self.play(FadeIn(new), run_time=0.25)
            caption = new

        # Legend
        legend = VGroup(*[
            VGroup(Dot(radius=0.09, color=c), Text(n, font=MONO, font_size=18, color=c)).arrange(RIGHT, buff=0.15)
            for n, c in (("master blocks", GREY_B), ("lines", BLUE_C), ("points", GREEN_C), ("picture", ORANGE),
                         ("constraints", RED_C), ("constraint types", PURPLE_B), ("free", GREY_D))
        ]).arrange(DOWN, aligned_edge=LEFT, buff=0.08).to_corner(UP + RIGHT, buff=0.3)
        self.play(FadeIn(legend), run_time=0.5)

        # Rings
        say("Now the rings. Every closed loop here is a real doubly linked ring in memory.")
        rings = [r for r in G["rings"] if r["size"] > 1 and r["head"]]
        ring_mobs = []
        for r in rings:
            head = r["head"]["block"]
            members = [m["block"] for m in r["members"]]
            pts = [pos[m] for m in members]
            color = COLORS.get(blocks[head]["type"], GREY_C)
            if blocks[head]["type"] == "master":
                color = GREY_C
            curve = ring_curve(pts, color, width=1.6)
            curve.set_stroke(opacity=0.6)
            curve.set_fill(opacity=0.0)
            ring_mobs.append(curve)
        self.play(*[Create(c) for c in ring_mobs], run_time=2.2)
        self.wait(1.8)

        # Ties
        say("And the ties: a pointer from inside one block to another. Thin, dashed.")
        tie_mobs = []
        for t in G["ties"]:
            a, b = pos[t["from"]], pos[t["to"]]
            tie_mobs.append(DashedLine(a, b, color=GREY_B, stroke_width=1.0, dash_length=0.08).set_opacity(0.5))
        self.play(*[Create(t) for t in tie_mobs], run_time=1.5)
        self.wait(1.6)

        say("So: is it a forest of rings? Yes. And they're threaded through each other, chain-mail style.")
        self.wait(2.4)
        say("Every block is on at least two rings. That's how you get from anywhere to anywhere.")
        self.wait(2.2)

        # The tree: root -> category -> type master -> objects.
        root = next(r for r in rings if all(blocks[m["block"]]["type"] in ("master", "?") for m in r["members"]) and r["size"] > 3)
        root_block = root["head"]["block"]
        self.play(Flash(dots[root_block], color=YELLOW, flash_radius=0.4), run_time=0.8)
        say("Start at the root block. Its ring lists the categories of things.")
        self.wait(1.6)

        def ring_of(head_block, field=None):
            for r in rings:
                if r["head"]["block"] == head_block and (field is None or r["head"]["field"] == field):
                    return r
            return None

        def walk(ring, color=YELLOW, pause=0.25):
            members = [m["block"] for m in ring["members"]]
            cursor = Dot(pos[members[0]], radius=0.17, color=color)
            self.add(cursor)
            for a, b in zip(members, members[1:] + members[:1]):
                self.play(cursor.animate.move_to(pos[b]), run_time=pause)
            return cursor

        cursor = walk(root)
        # find the category whose ring contains LINES
        lines_master = next(b for b, v in blocks.items() if v["type"] == "master" and v["name"] == "LINES")
        category = next(r for r in rings if any(m["block"] == lines_master for m in r["members"]) and r["head"]["block"] != lines_master)
        say("One category's ring holds the drawing types: pictures, lines, circles.")
        self.play(cursor.animate.move_to(pos[category["head"]["block"]]), run_time=0.4)
        for m in category["members"]:
            self.play(cursor.animate.move_to(pos[m["block"]]), run_time=0.3)
        self.play(cursor.animate.move_to(pos[lines_master]), run_time=0.3)
        say("The LINES master block. Its ring is every line in the drawing. All six.")
        lines_ring = ring_of(lines_master)
        for m in lines_ring["members"]:
            self.play(cursor.animate.move_to(pos[m["block"]]), run_time=0.28)
        self.wait(0.6)

        # From a line, tie to its start point, then round the point's ring.
        first_line = next(m["block"] for m in lines_ring["members"] if blocks[m["block"]]["type"] == "lines")
        say("Pick a line. Its 'start point' tie jumps across to a point block.")
        self.play(cursor.animate.move_to(pos[first_line]), run_time=0.4)
        tie = next(t for t in G["ties"] if t["from"] == first_line and t["field"] == "10")
        point = tie["to"]
        self.play(cursor.animate.move_to(pos[point]), run_time=0.5)
        say("The point's own ring: every line touching it. Walk it and you're on the NEXT line of the flange.")
        pring = ring_of(point, "14")
        for m in pring["members"]:
            self.play(cursor.animate.move_to(pos[m["block"]]), run_time=0.35)
        other_line = next(m["block"] for m in pring["members"] if blocks[m["block"]]["type"] == "lines" and m["block"] != first_line)
        self.play(cursor.animate.move_to(pos[other_line]), run_time=0.35)
        self.wait(0.5)

        # Go round the flange: line -> end point -> its ring -> next line.
        say("Repeat: line, end point, that point's ring, next line. Round the whole flange without one search.")
        current = other_line
        visited = {first_line, other_line}
        for _ in range(6):
            ties = [t for t in G["ties"] if t["from"] == current and t["field"] in ("10", "12")]
            moved = False
            for t in ties:
                pt = t["to"]
                pr = ring_of(pt, "14")
                if not pr:
                    continue
                nxt = [m["block"] for m in pr["members"] if blocks[m["block"]]["type"] == "lines" and m["block"] not in visited]
                if nxt:
                    self.play(cursor.animate.move_to(pos[pt]), run_time=0.3)
                    self.play(cursor.animate.move_to(pos[nxt[0]]), run_time=0.3)
                    visited.add(nxt[0])
                    current = nxt[0]
                    moved = True
                    break
            if not moved:
                break
        self.wait(1.0)

        # Constraints hang on the same rings.
        say("The red dots? Constraints. Same rings, same ties. The solver walks them exactly the same way.")
        cons = [b for b, v in blocks.items() if v["type"] == "constraint"]
        self.play(*[Indicate(dots[c], color=RED_C, scale_factor=1.6) for c in cons], run_time=1.2)
        self.wait(2.0)
        say("One structure. No arrays, no hash maps, no search. Just rings you can walk, and ties you can jump.")
        self.wait(2.6)
        self.play(FadeOut(cursor), FadeOut(caption), run_time=0.6)
        self.wait(0.4)
