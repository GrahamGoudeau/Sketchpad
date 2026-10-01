"""Chapter 0a: the most famous program nobody could run.

Why anyone cares, then the catch, then the people who tried.  Film
clips are frames of the 1963 Lincoln Laboratory film (build/assets/
film-*/), the "what it did" beat uses the emulator's own scope output,
the documents are the real title pages and a real scan, and the
volunteers' history is git by year with their own status quotes
(build/reconstruction.json).

Render:  manim -qh scenes/context.py Context
"""
import json
import textwrap
from pathlib import Path

from manim import (
    DOWN, UP, LEFT, RIGHT, BLACK, WHITE, GREY_B, GREY_C, YELLOW, BLUE_C, GREEN_C, ORANGE,
    VGroup, Group, Scene, Text, Paragraph, FadeIn, FadeOut, Rectangle, config, ImageMobject,
    SurroundingRectangle, Create,
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


class Context(Scene):
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

        def play_clip(name, width=7.5, pos=UP * 0.5, fps=12, label=None):
            frames = sorted((ASSETS / f"film-{name}").glob("*.png"))
            img = ImageMobject(str(frames[0])).scale_to_fit_width(width).move_to(pos)
            box = SurroundingRectangle(img, color=GREY_C, buff=0.03)
            lbl = Text(label, font=MONO, font_size=14, color=GREY_B).next_to(box, DOWN, buff=0.08) if label else None
            self.add(img, box)
            if lbl:
                self.add(lbl)
            for f in frames[1:]:
                new = ImageMobject(str(f)).scale_to_fit_width(width).move_to(pos)
                self.remove(img)
                img = new
                self.add(img)
                self.wait(1 / fps)
            return Group(img, box, lbl) if lbl else Group(img, box)

        # ---- 1. Open on the film ----
        clip = play_clip("draw", label="Lincoln Laboratory film, 1963")
        say("1963. A man touches a glass screen with a pen, and the computer notices. He draws by pointing.", 2.4)
        self.remove(*clip)
        clip = play_clip("draw", label="Lincoln Laboratory film, 1963")
        say("This is a decade before a mouse reached anyone's desk.", 1.6)
        self.remove(*clip)
        clip = play_clip("correct", label="Lincoln Laboratory film, 1963")
        say("He tells it the corners should be square, and the drawing fixes itself. The program is Sketchpad. The machine is the TX-2.", 2.8)
        self.remove(*clip)

        # ---- 2. What it did first ----
        say("Everything after it cites it. Here is why, from the real program running today.", 1.0)
        tiles = []
        for img, text in (("scope-330.png", "point to draw"), ("scope-755.png", "constraints"),
                          ("scope-copies.png", "instances"), ("gestalt-frame.png", "rings")):
            im = ImageMobject(str(ASSETS / img)).scale_to_fit_width(2.9)
            if im.height > 2.9:
                im.scale_to_fit_height(2.9)
            box = SurroundingRectangle(im, color=GREY_C, buff=0.03)
            lb = Text(text, font=MONO, font_size=15, color=GREY_B)
            tiles.append(Group(im, box, lb))
        for i, t in enumerate(tiles):
            t[0].move_to([-4.9 + 3.27 * i, 0.8, 0])
            t[1].move_to(t[0])
            t[2].next_to(t[1], DOWN, buff=0.1)
            self.play(FadeIn(t), run_time=0.45)
        say("Direct manipulation. Constraints. Instances. Object graphs. Four ideas the rest of computing spent decades catching up to.", 3.4)
        say("Not slides. These frames are the 1963 code running on an emulated TX-2, which is the subject of this series.", 3.2)
        for t in tiles:
            self.remove(*t)

        # ---- 3. The catch ----
        say("Here is the catch. Sketchpad ran on exactly one computer, and that computer was dismantled.", 3.0)
        clip = play_clip("rivet", width=6.0, pos=UP * 0.6, label="the TX-2, in its only film")
        say("For sixty years the program was a citation: taught, diagrammed, admired, and never executed by anyone alive.", 3.4)
        self.remove(*clip)
        docs = Group()
        for img, text, x in (("thesis-page.png", "the thesis, 1963 (2003 reprint)", -4.3), ("handbook-page.png", "the TX-2 handbook, 1963", 0.0), ("scan-page.png", "the listing: a photocopy", 4.3)):
            im = ImageMobject(str(ASSETS / img)).scale_to_fit_height(3.6).move_to([x, 0.7, 0])
            box = SurroundingRectangle(im, color=GREY_C, buff=0.03)
            lb = Text(text, font=MONO, font_size=14, color=GREY_B).next_to(box, DOWN, buff=0.08)
            docs.add(im, box, lb)
        self.play(FadeIn(docs, lag_ratio=0.15), run_time=1.2)
        pages = sum(s["pages"] for s in D["sources"].values())
        say(f"Three documents remain. The thesis explains the ideas. The handbook describes the machine. And {pages} photocopied pages are the program itself.", 3.6)
        say("Typewriter output, copied, in an assembler dialect that died with the machine. Superscripts carry meaning. Many are unreadable.", 3.4)
        self.remove(*docs)

        # ---- 4. The people who tried ----
        say("People tried. From 2021 the TX-2 Project, a few volunteers, set out to rebuild the machine itself.", 3.0)
        years = sorted(y for y in D["authorsByYear"] if y < "2026")
        top = max(sum(v.values()) for y, v in D["authorsByYear"].items() if y < "2026")
        rows = VGroup()
        for i, y in enumerate(years):
            v = D["authorsByYear"][y]
            total = sum(v.values())
            who = ", ".join(f"{n} {c}" for n, c in sorted(v.items(), key=lambda kv: -kv[1])[:2])
            rows.add(bar(6.0 * total / top, BLUE_C, y, f"{total}   {who}", y=1.9 - 0.6 * i, axis_x=-3.6))
        self.play(FadeIn(rows, lag_ratio=0.15), run_time=1.0)
        say("James Youngman wrote a TX-2 simulator in Rust from the handbook, opcode by opcode. In 2023 Jurij Smakov typed the listing in, marking every doubt.", 3.6)
        say("Their strategy: build the whole machine faithfully first, then one day run Sketchpad on it. Careful, honest, slow.", 3.2)
        self.play(FadeOut(rows), run_time=0.4)
        q1 = quote('"' + D["quotes"]["simulatorState"] + '"').move_to(UP * 1.4)
        q2 = quote('"' + D["quotes"]["transcriptionStatus"] + '"').next_to(q1, DOWN, buff=0.5)
        self.play(FadeIn(q1), run_time=0.6)
        say("Their own words, from the simulator's design notes.", 2.6)
        self.play(FadeIn(q2), run_time=0.6)
        say("And from the transcription's README, August 2025. Five years in, the listing had never once assembled.", 3.4)
        self.play(FadeOut(q1), FadeOut(q2), run_time=0.4)

        # ---- 5. Out ----
        say("So, in September 2026: paper, a handbook, a half-built machine, and nobody to run it.", 3.4)
        say("Then someone asked a coding agent a question.", 3.0)
        self.play(FadeOut(caption), run_time=0.5)
        self.wait(0.4)
