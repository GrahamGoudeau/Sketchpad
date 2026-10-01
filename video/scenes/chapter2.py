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
        caption = caption_text("You draw a line.  Where does the computer keep it?")

        def say(text, size=30):
            nonlocal caption
            new = caption_text(text, size)
            self.play(FadeOut(caption), run_time=0.25)
            self.play(FadeIn(new), run_time=0.4)
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
            self.wait(1 / 10)
        self.wait(2.5)
        say("Somewhere in the computer's memory, that line now exists.  Let's go and find it.")
        self.wait(3.0)

        # 2. How you would write it today.
        self.play(FadeOut(scope), FadeOut(frame_box))
        say("First, how you would do it today.  A struct for the line, a struct for each point, pointers between them.")
        today_line = struct_box("struct Line", ["Point *start;", "Point *end;", "Picture *owner;"], color=BLUE_C)
        today_point = struct_box("struct Point", ["int x, y;", "List lines_here;"], color=GREEN_C)
        today = VGroup(today_line, today_point).arrange(RIGHT, buff=1.6).shift(UP * 0.6)
        self.play(FadeIn(today_line), FadeIn(today_point))
        a1 = Arrow(today_line[2][0].get_right(), today_point[0].get_left(), buff=0.15, color=BLUE_C, stroke_width=3)
        self.play(Create(a1))
        self.wait(4.0)
        say("Sketchpad did exactly this in 1963.  No structs, no pointer types, no language to help.  Just words of memory.")
        self.wait(4.0)
        self.play(FadeOut(today), FadeOut(a1))

        # 3. The real blocks at their real addresses.
        say("Now the real thing.  These are the actual blocks, at their actual addresses, right after that line was drawn.")
        line_box = struct_box(f"line  @ {LINE:06o}", ["start  -> point", "end    -> point", "owner  -> picture"], color=BLUE_C)
        p1_box = struct_box(f"point @ {START:06o}", [f"x = {word(START + 0o20)[3:]}", f"y = {word(START + 0o21)[3:]}", "lines here: ring"], color=GREEN_C)
        p2_box = struct_box(f"point @ {END:06o}", [f"x = {word(END + 0o20)[3:]}", f"y = {word(END + 0o21)[3:]}", "lines here: ring"], color=GREEN_C)
        pic_box = struct_box(f"picture @ {PICTURE:06o}", ["parts: ring", "points: ring"], color=ORANGE)
        line_box.move_to(LEFT * 3.8 + UP * 1.4)
        p1_box.move_to(RIGHT * 3.4 + UP * 2.3)
        p2_box.move_to(RIGHT * 3.4 + DOWN * 0.3)
        pic_box.move_to(LEFT * 3.8 + DOWN * 1.4)
        self.play(FadeIn(line_box))
        self.play(FadeIn(p1_box), FadeIn(p2_box), FadeIn(pic_box))
        a_start = Arrow(line_box[2][0].get_right(), p1_box[0].get_left(), buff=0.15, color=GREEN_C, stroke_width=3)
        a_end = Arrow(line_box[2][1].get_right(), p2_box[0].get_left(), buff=0.15, color=GREEN_C, stroke_width=3)
        a_pic = Arrow(line_box[2][2].get_bottom(), pic_box[0].get_top(), buff=0.15, color=ORANGE, stroke_width=3)
        self.play(Create(a_start), Create(a_end), Create(a_pic), run_time=1.5)
        self.wait(3.0)
        say("The line block points at its two end points and at the picture it belongs to.")
        self.wait(3.5)
        say("Notice the line has no coordinates of its own.  The points hold them, and any number of lines can share a point.")
        self.play(Indicate(p1_box[2][0], color=YELLOW), Indicate(p2_box[2][0], color=YELLOW), run_time=2)
        self.wait(3.5)

        # 4. What a pointer looks like here.
        say("What does a pointer look like on this machine?  A word is 36 bits.  An address is 18.  So a pointer is half a word.")
        self.wait(3.0)
        say("Here is the real word that says 'start point'.  Its right half is the address.")
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
        self.play(Create(a_w))
        self.wait(4.0)
        self.play(FadeOut(word_view), FadeOut(lbl), FadeOut(a_w))

        # 5. Lists are rings.
        say("One more idea and we're done.  Every list in Sketchpad is a ring: a doubly linked list whose ends are joined.")
        self.play(p1_box.animate.move_to(LEFT * 3.5 + UP * 0.5))
        ring_center = RIGHT * 2.8 + UP * 0.4
        ring = Circle(radius=1.6, color=GREY_C, stroke_width=2).move_to(ring_center)
        head = Dot(ring.point_at_angle(3.14159 / 2), color=GREEN_C, radius=0.11)
        head_l = Text("ring head (in the point)", font=MONO, font_size=18, color=GREEN_C).next_to(head, UP, buff=0.15)
        member = Dot(ring.point_at_angle(-3.14159 / 2), color=BLUE_C, radius=0.11)
        member_l = Text("the line's link word", font=MONO, font_size=18, color=BLUE_C).next_to(member, DOWN, buff=0.15)
        self.play(Create(ring), FadeIn(head), FadeIn(head_l), FadeIn(member), FadeIn(member_l), run_time=1.5)
        self.wait(2.5)
        say("Rings mean you can start walking from any member, and remove any member, without searching from a head.")
        self.wait(4.0)
        say("The point keeps a ring of the lines that touch it.  One line so far, so previous and next both lead back to the head.")
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
        self.wait(4.5)
        self.play(FadeOut(ring), FadeOut(head), FadeOut(head_l), FadeOut(member), FadeOut(member_l),
                  FadeOut(ring_word), FadeOut(tags), FadeOut(p1_box))

        # 7. The whole line, all twelve words.
        say("So here is the whole line as the machine holds it: twelve words.")
        
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
        self.play(FadeIn(rows, lag_ratio=0.05), run_time=2.5)
        self.wait(3.0)
        say("A type, three pointers, and four ring links.  Not one coordinate.")
        self.wait(4.0)
        say("Lines, points, pictures, constraints: everything in Sketchpad is a block like this, on rings like these.")
        self.wait(4.0)
        self.play(FadeOut(rows), FadeOut(caption))
        self.wait(0.5)
