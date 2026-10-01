# Extracting the data for the film

Every snapshot and every scope frame comes from an existing regression
in `sketchpad-web`, run with two opt-in environment variables that read
the machine's state and output without changing what it does.

## Chapter 2: the first line

```sh
cd sketchpad-web
MEMORY_SNAPSHOT=../video/data/first-line.json SCOPE_RECORD=/tmp/first-line npm run test:first-line
```

`first-line.json` holds the list area (24000 to 26000) before and after
the line, the display file, and the statics at 200000. The scope frames
are 512 by 512 gray8 at 30 frames per second of simulated time; the
line is drawn in the last seconds of the run. The scene reads PNG
frames from `video/build/first-line-frames/`, cropped to the drawn
area:

```sh
ffmpeg -f rawvideo -pix_fmt gray -s 512x512 -r 30 -i /tmp/first-line.gray \
  -vf "select='gte(t,194)',crop=224:128:232:160,scale=896:512:flags=neighbor" -r 15 \
  video/build/first-line-frames/%04d.png
```

(The storyboard's pilot used a change-based frame selection over the
same range; either gives the drawing of the line.)

## Rendering

```sh
cd video
manim -qh scenes/chapter2.py Chapter2
```

Manim Community 0.18 or later with Pango text; no LaTeX is needed.

## The gestalt: all rings of the solved flange

```sh
cd sketchpad-web
MEMORY_SNAPSHOT=../video/data/flange.json npm run test:flange
cd ../video/data
python3 rings.py flange.json > ../build/flange-rings.json
python3 layout.py ../build/flange-rings.json flange.json > ../build/flange-layout.json
cd .. && manim -qh scenes/gestalt.py Gestalt
```

`flange.json` is taken after `RELAX`, over the whole list area (24000
to the allocation pointer held in word 24000). `rings.py` finds every
ring word by mutual links, every ring as a cycle, every block from its
hen back-offsets, every tie from a hen's right half, and every type
from the `TYPE` word's master; it needs no knowledge of block layouts
beyond the master block table. `layout.py` places the blocks with a
small force-directed relaxation so rings stay compact.
