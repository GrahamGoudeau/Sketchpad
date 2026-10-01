# Sketchpad, structurally: storyboard

An educational film about how Sketchpad (Sutherland, 1963) is built: the
machine it ran on, the one data structure everything stands on, how a
picture becomes light and light becomes a selection, pictures inside
pictures, and constraints as objects. Seven chapters of one mechanism
each, about twelve minutes.

Audience: someone with a CS degree who knows structs, pointers, and
linked lists and nothing about the TX-2. Each chapter starts from
something they already know, moves at one idea per caption with room
to read it, and shows the real thing only after the shape of it is
clear.

Rule for every frame: nothing is illustrated from imagination. Memory
views come from snapshots of the emulator's list memory, display views
from the recorder's scope frames, and every label is the name the
original listing gives the thing. The data layer is in `data/`, the
Manim scenes in `scenes/`. Narration is drafted here beside each
chapter and recorded last.

## Chapter 1: The machine

Question answered: what is this program running on?

Shows: the TX-2 in one picture, drawn from the handbook's figures. A
36-bit word with its four quarters. The memory banks (S, T, V, U) and
where Sketchpad's list memory (24000 up), its statics (200000 up), and
the display file (100000 up) sit. The scope, the light pen, the push
buttons, the toggle registers, the shaft encoders. Then the idea of
sequences: four programs interleaved on one processor by priority, the
display (60), the pen (55), the buttons (47), and Sketchpad itself
(76), lowest of all.

Data: the memory map from `reconstruction/RECONSTRUCTION.md`; the
sequence split measured in research log checkpoint 97 (display 41
percent, program 56 percent during a solve) can appear as one bar.

Narration draft: "Sketchpad ran on the TX-2 at Lincoln Laboratory. A
36-bit word, split into four nine-bit quarters the instructions could
address separately. Sixty-four thousand words of core, a vector scope,
a light pen, and one processor shared by several programs at once,
each a sequence with a priority. The display is a sequence. The pen is
a sequence. The buttons are a sequence. Sketchpad is the lowest
priority program on the machine, and that fact shapes everything you
will see."

## Chapter 2: One object in memory (the pilot)

Question answered: where does a line live?

Shows, in order: the pen draws one line on the scope (recorder
frames); how you would write it today, a `struct Line` with two point
pointers and an owner, a `struct Point` with coordinates and a list of
lines; then the real blocks as boxes at their real addresses, the line
at 025261 pointing at its two points and its picture, with the
observation that the line holds no coordinates; then what a pointer
is on this machine, the real word 767000 001215 with its right half as
the address; then the idea of a ring, a doubly linked list with its
ends joined, and the point's ring of lines with its one member; and
finally the whole line as twelve raw words with their roles. The hen
back-offset trick is left for chapter 3.

Data: `data/first-line.json`, the list area before and after the first
line of `npm run test:first-line`, with the display file and statics;
`data/first-line.gray` and `.frames.jsonl`, the scope frames of the
same run.

Narration draft: "You draw a line. Where does it go? Here, at address
twenty-five thousand two hundred and sixty-one octal, twenty words.
Only a few of them are numbers. Most are links. The first word says
what this is: a line. The second puts it on the ring of every line in
the drawing. The fifth says which picture it belongs to. Two more name
its end points, and the points are blocks of their own, with the
actual coordinates, and with a ring of their own: every line that
touches this point. Nothing in Sketchpad is stored twice. Everything
is reached by following links around rings."

## Chapter 3: Memory growing under use

Question answered: what happens in memory while someone draws?

Shows: the scope picture-in-picture, top left, from the recorder; the
main view is all of list memory as blocks on rings, rebuilt at every
change from a timeline the regression recorded, laid out with the
master tree on the left and the drawing's blocks at their real scope
positions on the right so the figure takes shape in memory as it
takes shape on the scope. The first line allocates three blocks that
thread onto rings; each further line reuses the previous end point;
constraint entry allocates scratch blocks that return to the free
ring; each constraint lands on its type's ring, the picture's ring,
and its points' rings; `RELAX` changes no structure, only the numbers
in the points, and the picture follows.

Data: `MEMORY_TIMELINE` and `SCOPE_RECORD` on `test:flange`, replayed
by `data/timeline.py` into `build/flange-keyframes.json` and one
cropped scope frame per keyframe (`data/EXTRACT.md`).

Scene: `scenes/memory_growth.py`. The rings-as-operations material
(allocation from FREES, `ERASE` unlinking to DEADS, `MERGER` splicing
two points' rings, the hen back-offset that lets a link find its
block) moves to a chapter 3b with before-and-after snapshots from
`test:delete` and the polyline's closing merge.

Narration draft: "Every operation in Sketchpad is one of a handful of
ring moves. Take a block off the free ring and put it on the ring of
its kind: that is creation. Unlink it and put it on the dead ring:
deletion. Splice one ring into another: merging two points into one.
The program never searches memory. It walks rings."

## Chapter 4: From memory to light

Question answered: how does the data structure become a picture?

Shows: the display builder (`MAGPIC`) walks the current picture's
parts ring. For each block it reads `TYPE`, follows it to the master
block, and jumps through that block's `DISPLAY` word: each kind of
object has its own display routine. Lines are stepped eight scope
units at a time into words of the display file at 100000, each word a
coordinate pair plus the index of the block that made it. A separate
sequence, the display, replays the file onto the scope forever and
knows nothing about lines.

Data: `data/first-line.json` display file; the display routine range
200206 to 200334 from research log checkpoint 87; the type-dispatch
through `LIST+DISPLAY` from checkpoint 95.

Narration draft: "Twice a second or so, Sketchpad rebuilds the whole
picture from scratch. It walks the ring of parts, asks each one what
it is, and hands it to that type's display routine. A line becomes a
row of points, eight units apart, written into a flat file. Another
program, the display sequence, reads that file in a loop and drives
the scope. It does not know what a line is. It only knows points."

## Chapter 5: From light to memory

Question answered: how does the pen know what you are pointing at?

Shows: the tracking cross, four arms redrawn every pass, the pen
seeing the beam and the program recentering the cross under it. Then
selection: the pen also sees ordinary picture points, and each display
file word carries the index of the block that made it, so a hit on the
scope maps straight back to a block in list memory. The eight-word
selection buffer at 200045.

Data: scope frames with the cross; display file words with their block
indexes; `ATBITS` and the selection words from the harness.

Narration draft: "The pen does not know where it is. It only knows
when it sees light. Sketchpad draws a small cross and watches which
arms the pen sees, then moves the cross toward the pen, forty times a
second. And because every point on the screen was written with the
name of the object that made it, when the pen sees a point of your
drawing, the program already knows which line that was."

## Chapter 6: Pictures inside pictures

Question answered: what is an instance?

Shows: an instance block: `IWHAT` names another picture, `IVAL` holds
R cos α, R sin α, X, Y. The display builder, meeting an instance, saves
its transform, multiplies in the instance's, and recurses into the
other picture's parts ring, then restores. Two levels deep. The culling
rules: too small, off screen, already being expanded.

Data: snapshots from `test:instance-figure` (instance block, nested
instance block, `MATM` to `MATD` statics); scope frames of the copies.

Narration draft: "A drawing can contain another drawing. Not a copy:
a reference, with a transform. When the display builder meets one, it
multiplies the transform in, walks the other picture as if it were
here, and backs out. It can do this inside itself. Change the master
and every instance changes, because there is only one master."

## Chapter 7: Constraints as objects

Question answered: how does the figure fix itself?

Shows: a constraint block on the same rings, with a type and the
variables it touches (`VCON` on each point). The solver walks the
constraints generically: for each variable, measure the error, nudge,
measure again, move. One point at a time, every tenth of a second.
The display sequence shows each move as it lands, which is why the
figure walks into shape.

Data: snapshots from `test:flange` (constraint blocks, `VCON` rings);
the `RELAX` motion trace from research log checkpoint 98; scope frames
of the correction.

Narration draft: "A constraint is just another block. It names the
points it cares about and the kind of relation it wants. The solver
does not know what perpendicular means. It knows how to ask a
constraint for its error, and how to move a point to make the error
smaller, one point at a time. And because the display runs on its own,
you watch the figure find its shape."

## Production notes

- Resolution 1920 by 1080, Manim Community with Pango text only (no
  LaTeX on the workstation). Monospace: Noto Sans Mono. Octal values
  shown exactly as the listing would print them.
- Memory views: a column of words with address, octal value, the field
  name from the equalities (`TYPE`, `BWHOS`, `LSP`, `LEP`, `PVAL`,
  `PLS`, ...), and links drawn as arcs between blocks. Half-words of a
  ring word colored as previous and next.
- Scope views: recorder frames composited as the scope, the phosphor
  decay as recorded.
- The data extraction is `data/extract.md`, one command per snapshot,
  all from existing regressions with `MEMORY_SNAPSHOT` and
  `SCOPE_RECORD`.
