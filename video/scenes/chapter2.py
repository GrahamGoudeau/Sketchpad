"""Chapter 2: one object in memory.

Audience: someone with a CS degree who knows structs, pointers, and
linked lists, and nothing about the TX-2.

Every address and value shown comes from data/first-line.json, a
snapshot of the emulator's list memory after the first line of the
first-line regression, and every frame of the scope comes from the
recorder's output of the same run.  Field names are the equalities of
the original listing (sk.tx2as).

Render:  manim -qh scenes/chapter2.py Chapter2
Needs:   build/first-line-frames/NNNN.png (see data/EXTRACT.md)
"""
import json
import textwrap
from pathlib import Path

from manim import (
    DOWN, LEFT, RIGHT, UP, UR, ORIGIN,
    BLACK, WHITE, GREY_B, GREY_C, YELLOW, BLUE_C, GREEN_C, ORANGE, RED_C,
    Arrow, CurvedArrow, FadeIn, FadeOut, ImageMobject, Indicate, Rectangle,
    RoundedRectangle, Scene, Text, VGroup, Write, Create, SurroundingRectangle,
    Line, Dot, Circle, Paragraph, config,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DATA = json.loads((ROOT / "data" / "first-line.json").read_text())
FRAMES = sorted((ROOT / "build" / "first-line-frames").glob("*.png"))
MONO = "Noto Sans Mono"

LIST = 0o24000
LINE = int(DATA["lineAddress"], 8)
AFTER = DATA["after"]
FRAME_W = config.frame_width


def word(address):
    return AFTER[f"{address:06o}"]


def halves(w):
    return w[:6], w[6:]


def tie(address):
    """The block an even (hen) word points to: LIST plus its right half."""
    return LIST + int(halves(word(address))[1], 8)


START = tie(LINE + 0o10)
END = tie(LINE + 0o12)
PICTURE = tie(LINE + 0o4)


def caption_text(text, size=30):
    lines = textwrap.wrap(text, 58)
    p = Paragraph(*lines, alignment="center", font_size=size, line_spacing=0.9)
    if p.width > FRAME_W - 1.0:
        p.scale_to_fit_width(FRAME_W - 1.0)
    return p.to_edge(DOWN, buff=0.45)


def struct_box(title, fields, width=3.2, color=WHITE, mono_values=True):
    """A box drawn like a struct: a title and one row per field."""
    t = Text(title, font=MONO, font_size=26, color=color)
    rows = VGroup(*[
        Text(f, font=MONO, font_size=20, color=WHITE if mono_values else GREY_B) for f in fields
    ]).arrange(DOWN, buff=0.12, aligned_edge=LEFT)
    body = VGroup(t, rows).arrange(DOWN, buff=0.2, aligned_edge=LEFT)
    box = RoundedRectangle(corner_radius=0.15, width=max(width, body.width + 0.5),
                           height=body.height + 0.5, color=color, stroke_width=2)
    body.move_to(box.get_center())
    return VGroup(box, t, rows)


class Chapter2(Scene):
    def construct(self):
        self.camera.background_color = BLACK
        caption = caption_text("1963. You draw a line. Where does it GO?")

        def say(text, size=30):
            nonlocal caption
            new = caption_text(text, size)
            self.play(FadeOut(caption), run_time=0.15)
            self.play(FadeIn(new), run_time=0.25)
            caption = new

        # 1. The line is drawn, on the real scope output.
        scope = ImageMobject(str(FRAMES[0])).scale_to_fit_width(8.5).to_edge(UP, buff=0.7)
        frame_box = SurroundingRectangle(scope, color=GREY_C, buff=0.05)
        self.add(scope, frame_box)
        self.play(FadeIn(caption), run_time=0.8)
        step = max(1, len(FRAMES) // 60)
        for path in FRAMES[::step]:
            new = ImageMobject(str(path)).scale_to_fit_width(8.5).move_to(scope)
            self.remove(scope)
            scope = new
            self.add(scope)
            self.wait(1 / 15)
        self.wait(1.2)
        say("It's in memory somewhere. Let's go find it.")
        self.wait(1.6)

        # 2. How you would write it today.
        self.play(FadeOut(scope), FadeOut(frame_box))
        say("How YOU would do it: two structs, some pointers. Easy.")
        today_line = struct_box("struct Line", ["Point *start;", "Point *end;", "Picture *owner;"], color=BLUE_C)
        today_point = struct_box("struct Point", ["int x, y;", "List lines_here;"], color=GREEN_C)
        today = VGroup(today_line, today_point).arrange(RIGHT, buff=1.6).shift(UP * 0.6)
        self.play(FadeIn(today_line), FadeIn(today_point))
        a1 = Arrow(today_line[2][0].get_right(), today_point[0].get_left(), buff=0.15, color=BLUE_C, stroke_width=3)
        self.play(Create(a1), run_time=0.6)
        self.wait(2.2)
        say("Sketchpad did the same thing. No structs. No pointer types. No compiler. Just raw words.")
        self.wait(2.6)
        self.play(FadeOut(today), FadeOut(a1))

        # 3. The real blocks at their real addresses.
        say("The REAL blocks. Real addresses. Pulled straight out of the machine.")
        line_box = struct_box(f"line  @ {LINE:06o}", ["start  -> point", "end    -> point", "owner  -> picture"], color=BLUE_C)
        p1_box = struct_box(f"point @ {START:06o}", [f"x = {word(START + 0o20)[3:]}", f"y = {word(START + 0o21)[3:]}", "lines here: ring"], color=GREEN_C)
        p2_box = struct_box(f"point @ {END:06o}", [f"x = {word(END + 0o20)[3:]}", f"y = {word(END + 0o21)[3:]}", "lines here: ring"], color=GREEN_C)
        pic_box = struct_box(f"picture @ {PICTURE:06o}", ["parts: ring", "points: ring"], color=ORANGE)
        line_box.move_to(LEFT * 3.8 + UP * 1.4)
        p1_box.move_to(RIGHT * 3.4 + UP * 2.3)
        p2_box.move_to(RIGHT * 3.4 + DOWN * 0.3)
        pic_box.move_to(LEFT * 3.8 + DOWN * 1.4)
        self.play(FadeIn(line_box, scale=1.15), run_time=0.5)
        self.play(FadeIn(p1_box, scale=1.15), FadeIn(p2_box, scale=1.15), FadeIn(pic_box, scale=1.15), run_time=0.6)
        a_start = Arrow(line_box[2][0].get_right(), p1_box[0].get_left(), buff=0.15, color=GREEN_C, stroke_width=3)
        a_end = Arrow(line_box[2][1].get_right(), p2_box[0].get_left(), buff=0.15, color=GREEN_C, stroke_width=3)
        a_pic = Arrow(line_box[2][2].get_bottom(), pic_box[0].get_top(), buff=0.15, color=ORANGE, stroke_width=3)
        self.play(Create(a_start), Create(a_end), Create(a_pic), run_time=0.9)
        self.wait(1.8)
        say("Line -> two points -> picture. That's the whole object graph.")
        self.wait(2.2)
        say("Plot twist: the line has NO coordinates. The points own them. Lines just share points.")
        self.play(Indicate(p1_box[2][0], color=YELLOW), Indicate(p2_box[2][0], color=YELLOW), run_time=1.2)
        self.wait(2.2)

        # 4. What a pointer looks like here.
        say("What's a pointer here? Word = 36 bits. Address = 18 bits. So: half a word.")
        self.wait(1.8)
        say("This is the actual 'start point' word. Right half = the address.")
        w = word(LINE + 0o10)
        lh, rh = halves(w)
        word_view = VGroup(
            Text(f"{LINE + 0o10:06o}:", font=MONO, font_size=28, color=GREY_B),
            Text(lh, font=MONO, font_size=34, color=GREY_B),
            Text(rh, font=MONO, font_size=34, color=GREEN_C),
        ).arrange(RIGHT, buff=0.35).move_to(LEFT * 2.0 + UP * 0.3)
        self.play(FadeOut(a_start), FadeOut(a_end), FadeOut(a_pic),
                  FadeOut(line_box), FadeOut(p2_box), FadeOut(pic_box))
        self.play(FadeIn(word_view))
        lbl = Text(f"right half: {rh} + base {LIST:o} = {START:06o}, the start point",
                   font=MONO, font_size=20, color=GREEN_C).next_to(word_view, DOWN, buff=0.35)
        self.play(FadeIn(lbl))
        a_w = Arrow(word_view[2].get_top(), p1_box[0].get_left(), buff=0.15, color=GREEN_C, stroke_width=3)
        self.play(Create(a_w), run_time=0.6)
        self.wait(2.4)
        self.play(FadeOut(word_view), FadeOut(lbl), FadeOut(a_w))

        # 5. Lists are rings.
        say("Last idea. Every list is a RING: doubly linked, ends joined.")
        self.play(p1_box.animate.move_to(LEFT * 3.5 + UP * 0.5))
        ring_center = RIGHT * 2.8 + UP * 0.4
        ring = Circle(radius=1.6, color=GREY_C, stroke_width=2).move_to(ring_center)
        head = Dot(ring.point_at_angle(3.14159 / 2), color=GREEN_C, radius=0.11)
        head_l = Text("ring head (in the point)", font=MONO, font_size=18, color=GREEN_C).next_to(head, UP, buff=0.15)
        member = Dot(ring.point_at_angle(-3.14159 / 2), color=BLUE_C, radius=0.11)
        member_l = Text("the line's link word", font=MONO, font_size=18, color=BLUE_C).next_to(member, DOWN, buff=0.15)
        self.play(Create(ring), FadeIn(head), FadeIn(head_l), FadeIn(member), FadeIn(member_l), run_time=0.9)
        self.wait(1.4)
        say("Walk from anywhere. Delete from anywhere. No searching. That's why rings.")
        self.wait(2.2)
        say("The point's ring = every line touching it. One line so far, so prev and next both hit the head.")
        rw = word(LINE + 0o11)
        plh, prh = halves(rw)
        ring_word = VGroup(
            Text(f"{LINE + 0o11:06o}:", font=MONO, font_size=24, color=GREY_B),
            Text(plh, font=MONO, font_size=28, color=GREEN_C),
            Text(prh, font=MONO, font_size=28, color=ORANGE),
        ).arrange(RIGHT, buff=0.3).next_to(ring, DOWN, buff=0.9)
        tags = VGroup(
            Text("prev", font=MONO, font_size=16, color=GREEN_C).next_to(ring_word[1], DOWN, buff=0.1),
            Text("next", font=MONO, font_size=16, color=ORANGE).next_to(ring_word[2], DOWN, buff=0.1),
        )
        self.play(FadeIn(ring_word), FadeIn(tags))
        self.wait(2.6)
        self.play(FadeOut(ring), FadeOut(head), FadeOut(head_l), FadeOut(member), FadeOut(member_l),
                  FadeOut(ring_word), FadeOut(tags), FadeOut(p1_box))

        # 7. The whole line, all twelve words.
        say("The whole line, exactly as the machine holds it. Twelve words.")

        rows = VGroup()
        names = {0: "type", 1: "ring: all lines", 4: "owner picture", 5: "ring: picture parts",
                 8: "start point", 9: "ring: lines on start", 10: "end point", 11: "ring: lines on end"}
        for i in range(12):
            a = LINE + i
            lh, rh = halves(word(a))
            row = VGroup(
                Text(f"{a:06o}", font=MONO, font_size=22, color=GREY_B),
                Text(lh, font=MONO, font_size=22, color=WHITE),
                Text(rh, font=MONO, font_size=22, color=WHITE),
                Text(names.get(i, ""), font=MONO, font_size=20, color=YELLOW),
            ).arrange(RIGHT, buff=0.35)
            rows.add(row)
        rows.arrange(DOWN, buff=0.1, aligned_edge=LEFT)
        for row in rows:
            row[1].align_to(rows[0][1], LEFT)
            if row[3].has_points():
                row[3].align_to(rows[0][3], LEFT)
        rows.scale(0.8).move_to(UP * 0.4)
        self.play(FadeIn(rows, lag_ratio=0.04), run_time=1.5)
        self.wait(1.8)
        say("One type word. Three pointers. Four ring links. Zero coordinates.")
        self.wait(2.4)
        say("Lines, points, pictures, constraints: ALL of Sketchpad is blocks like this on rings like these.")
        self.wait(2.6)
        self.play(FadeOut(rows), FadeOut(caption))
        self.wait(0.5)
