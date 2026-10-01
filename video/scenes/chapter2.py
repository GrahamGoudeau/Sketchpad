"""Chapter 2: one object in memory.

Every value shown comes from data/first-line.json, a snapshot of the
emulator's list memory before and after the first line of the
first-line regression, and every frame of the scope comes from the
recorder's output of the same run.  Field names are the equalities of
the original listing (sk.tx2as).

Render:  manim -qh scenes/chapter2.py Chapter2
Needs:   build/first-line-frames/NNNN.png (see data/EXTRACT.md)
"""
import json
import os
from pathlib import Path

from manim import (
    DOWN, LEFT, RIGHT, UP, UL, UR, DL, DR, ORIGIN,
    BLACK, WHITE, GREY_B, GREY_C, YELLOW, BLUE_C, GREEN_C, ORANGE, RED_C,
    Arrow, CurvedArrow, FadeIn, FadeOut, ImageMobject, Indicate, Rectangle,
    Scene, Text, Transform, VGroup, Write, Create, Group, SurroundingRectangle,
    always_redraw, Line, Dot, Circle, config,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA = json.loads((ROOT / "data" / "first-line.json").read_text())
FRAMES = sorted((ROOT / "build" / "first-line-frames").glob("*.png"))
MONO = "Noto Sans Mono"

LIST = 0o24000
LINE = int(DATA["lineAddress"], 8)
AFTER = DATA["after"]


def word(address):
    return AFTER[f"{address:06o}"]


def half(w):
    return w[:6], w[6:]


# Field names from the listing's equalities.  A tie is a hen word at an
# even offset, whose right half names the block it points to and whose
# left quarter is the negative of the offset, followed by its ring word.
LINE_FIELDS = {
    0: ("TYPE", "what kind of block: the LINES master block"),
    1: ("", "ring word: this line on the ring of all lines"),
    2: ("SPECB", ""),
    3: ("", ""),
    4: ("BWHOS", "which picture this block belongs to"),
    5: ("", "ring word: this line among the picture's parts"),
    6: ("", ""),
    7: ("", ""),
    8: ("LSP", "start point of the line"),
    9: ("", "ring word: this line on the start point's ring"),
    10: ("LEP", "end point of the line"),
    11: ("", "ring word: this line on the end point's ring"),
}
POINT_FIELDS = {
    0: ("TYPE", "the POINTS master block"),
    1: ("", "ring word: this point on the ring of all points"),
    4: ("BWHOS", "which picture"),
    5: ("", "ring word: among the picture's blocks"),
    12: ("PLS", "lines and circles on this point (ring head)"),
    13: ("", "ring word: head of that ring"),
    16: ("PVAL", "x coordinate"),
    17: ("PVAL+1", "y coordinate"),
}


def block_table(base, length, fields, scale=0.5, title=None):
    """A column of words: address, octal value, field name."""
    rows = VGroup()
    for i in range(length):
        a = base + i
        w = word(a)
        name, _ = fields.get(i, ("", ""))
        left, right = half(w)
        addr = Text(f"{a:06o}", font=MONO, font_size=22, color=GREY_B)
        off = Text(f"+{i:02o}", font=MONO, font_size=18, color=GREY_C)
        lh = Text(left, font=MONO, font_size=22, color=WHITE)
        rh = Text(right, font=MONO, font_size=22, color=WHITE)
        nm = Text(name, font=MONO, font_size=20, color=YELLOW)
        row = VGroup(addr, off, lh, rh, nm)
        addr.move_to(LEFT * 2.6)
        off.next_to(addr, RIGHT, buff=0.15)
        lh.next_to(off, RIGHT, buff=0.3)
        rh.next_to(lh, RIGHT, buff=0.12)
        nm.next_to(rh, RIGHT, buff=0.35)
        rows.add(row)
    rows.arrange(DOWN, buff=0.12, aligned_edge=LEFT)
    for row in rows:
        row[0].align_to(rows[0][0], LEFT)
    rows.scale(scale)
    group = VGroup(rows)
    if title:
        t = Text(title, font=MONO, font_size=26, color=WHITE)
        t.next_to(rows, UP, buff=0.25).align_to(rows, LEFT)
        group.add(t)
    return group, rows


class Chapter2(Scene):
    def construct(self):
        self.camera.background_color = BLACK

        # 1. The line is drawn, on the real scope output.
        caption = Text("You draw a line.", font_size=40).to_edge(DOWN, buff=0.6)
        scope = ImageMobject(str(FRAMES[0])).scale_to_fit_width(9.0).to_edge(UP, buff=0.7)
        frame_box = SurroundingRectangle(scope, color=GREY_C, buff=0.05)
        self.add(scope, frame_box)
        self.play(Write(caption), run_time=1.0)
        step = max(1, len(FRAMES) // 60)
        for path in FRAMES[::step]:
            new = ImageMobject(str(path)).scale_to_fit_width(9.0).move_to(scope)
            self.remove(scope)
            scope = new
            self.add(scope)
            self.wait(1 / 15)
        self.wait(0.8)

        # 2. Where does it go?  Address and twelve words.
        caption2 = Text(f"Where does it go?  Address {LINE:06o}, twelve words.",
                        font_size=34).to_edge(DOWN, buff=0.6)
        self.play(FadeOut(caption, run_time=0.3), FadeIn(caption2, run_time=0.5))
        caption = caption2
        self.play(scope.animate.scale(0.5).to_corner(UR, buff=0.4),
                  frame_box.animate.scale(0.5).to_corner(UR, buff=0.4))
        line_table, line_rows = block_table(LINE, 12, LINE_FIELDS, scale=0.62, title="the line")
        line_table.to_edge(LEFT, buff=0.6).shift(UP * 0.4)
        self.play(FadeIn(line_table, lag_ratio=0.05), run_time=2)
        self.wait(1.0)

        # 3. TYPE: what this is.
        def say(text):
            nonlocal caption
            new = Text(text, font_size=30).to_edge(DOWN, buff=0.6)
            self.play(FadeOut(caption, run_time=0.3), FadeIn(new, run_time=0.5))
            caption = new

        say("The first word says what this is: its right half names the LINES master block.")
        self.play(Indicate(line_rows[0][3], color=BLUE_C, scale_factor=1.3))
        self.wait(1.5)

        # 4. Ring words: previous and next, both halves.
        say("The second word puts it on the ring of every line: previous link, next link.")
        prev_lbl = Text("prev", font=MONO, font_size=18, color=GREEN_C).next_to(line_rows[1][3], RIGHT, buff=0.5)
        next_lbl = Text("next", font=MONO, font_size=18, color=ORANGE).next_to(prev_lbl, RIGHT, buff=0.25)
        self.play(line_rows[1][2].animate.set_color(GREEN_C), line_rows[1][3].animate.set_color(ORANGE),
                  FadeIn(prev_lbl), FadeIn(next_lbl))
        self.wait(1.2)
        say("Both halves say 000204: the ring head, in the LINES master block. One line, a ring of one.")
        head = Text(f"024204  {word(0o24204)}   LINES ring head", font=MONO, font_size=20, color=GREY_B)
        head.next_to(line_table, DOWN, buff=0.5).align_to(line_table, LEFT)
        self.play(FadeIn(head))
        arc1 = CurvedArrow(line_rows[1][3].get_right(), head.get_left() + RIGHT * 0.2, angle=-1.2, color=ORANGE, stroke_width=2)
        arc2 = CurvedArrow(head.get_right(), line_rows[1][2].get_left() + LEFT * 0.1, angle=-1.2, color=GREEN_C, stroke_width=2)
        self.play(Create(arc1), Create(arc2))
        self.wait(1.5)
        self.play(FadeOut(arc1), FadeOut(arc2), FadeOut(head), FadeOut(prev_lbl), FadeOut(next_lbl))

        # 5. Hen words: the even words.
        say("The even words are hens. Their left quarter counts back to the start of the block.")
        hens = VGroup(*[line_rows[i][2] for i in (2, 4, 6, 8, 10)])
        self.play(hens.animate.set_color(RED_C))
        back = VGroup(*[
            Text(f"{w[:3]} = -{i:o}", font=MONO, font_size=16, color=RED_C).next_to(line_rows[i][3], RIGHT, buff=0.9)
            for i, w in ((2, word(LINE + 2)), (4, word(LINE + 4)), (6, word(LINE + 6)), (8, word(LINE + 8)), (10, word(LINE + 10)))
        ])
        self.play(FadeIn(back))
        self.wait(2.0)
        say("From any ring word, step back one, read the quarter, and you have found the block.")
        self.wait(1.5)
        self.play(FadeOut(back), hens.animate.set_color(WHITE))

        # 6. Ties: BWHOS, LSP, LEP.
        say("A hen's right half is a tie: BWHOS names the picture this line belongs to.")
        self.play(Indicate(line_rows[4][3], color=BLUE_C, scale_factor=1.3))
        self.wait(1.2)
        say("LSP and LEP name the two points. Follow LSP.")
        self.play(Indicate(line_rows[8][3], color=BLUE_C, scale_factor=1.3),
                  Indicate(line_rows[10][3], color=BLUE_C, scale_factor=1.3))
        start = LIST + int(half(word(LINE + 8))[1], 8)
        point_table, point_rows = block_table(start, 18, POINT_FIELDS, scale=0.5, title="the start point")
        point_table.to_edge(RIGHT, buff=0.5).shift(UP * 0.2)
        self.play(FadeOut(scope), FadeOut(frame_box))
        self.play(FadeIn(point_table, lag_ratio=0.04), run_time=2)
        tie = CurvedArrow(line_rows[8][3].get_right() + RIGHT * 0.1, point_rows[0][0].get_left() + LEFT * 0.1,
                          angle=-0.6, color=BLUE_C, stroke_width=2)
        self.play(Create(tie))
        self.wait(1.0)

        # 7. The point: coordinates and its own ring.
        say("The point is a block of its own. Two words are numbers: the coordinates, PVAL.")
        self.play(point_rows[16][2].animate.set_color(YELLOW), point_rows[16][3].animate.set_color(YELLOW),
                  point_rows[17][2].animate.set_color(YELLOW), point_rows[17][3].animate.set_color(YELLOW))
        self.wait(1.8)
        say("And it has a ring of its own, PLS: every line that touches this point.")
        self.play(Indicate(point_rows[13][2], color=ORANGE, scale_factor=1.2),
                  Indicate(point_rows[13][3], color=ORANGE, scale_factor=1.2))
        back_tie = CurvedArrow(point_rows[13][3].get_left() + LEFT * 0.1, line_rows[9][3].get_right() + RIGHT * 0.1,
                               angle=0.8, color=ORANGE, stroke_width=2)
        self.play(Create(back_tie))
        say("That ring's one member is the line we started from, at its ninth word.")
        self.wait(2.0)

        # 8. Close.
        say("Nothing is stored twice. Everything is reached by following links around rings.")
        self.wait(2.5)
        self.play(FadeOut(tie), FadeOut(back_tie), FadeOut(line_table), FadeOut(point_table),
                  FadeOut(caption))
        self.wait(0.5)
