# Sketchpad Web

This directory contains the Sketchpad-focused browser surface.  It is separate
from the general TX-2 browser demo.

Build the WebAssembly package:

```sh
npm run build
```

Serve the static application:

```sh
npm run dev
```

Open `http://localhost:8082`.

The machine starts automatically.  Each animation frame gives the simulator at
most 2.5 milliseconds of CPU time.  Each WASM call executes at most 32 ticks.
The canvas draws at most 768 scope spots per frame.  Hidden tabs stop executing
the machine.  The display runs at no more than 60 frames per second.  Each
canvas axis uses at most 1,024 pixels.  Three frames above the 20-millisecond
work budget pause the machine.  These limits keep the main thread and GPU
responsive.

The bundled tape is the compatible seven-job Sketchpad reconstruction.  Its
entry point is octal address `200140`.  Its SHA-256 is
`18b4a0f69853faf0a60aab0c0c7943d29dcb21c98c2426250e521706953badae`.

The browser runs the paper tape through the CPU and WebAssembly.  It draws the
unit-60 output on the canvas.  A held pointer over visible scope ink acts as
the unit-55 light pen.  Four sliders control the shaft encoders at address
`377620`.  Thirty-seven momentary buttons control the External Input Register
at address `377621`.  The application also accepts a local paper-tape file.

On a narrow screen, the scope and a five-tool HUD fill the viewport.  The PEN,
LINE, CIRCLE, and RECT tools draw persistent compatibility ink above the
recovered scope output.  ERASE removes a touched compatibility shape.  The
same gesture also drives the modeled light pen and holds the closest historical
External Input Register bit.  This gives a phone an immediate drawing surface
while the original input path keeps running below it.  The `MACHINE` drawer
keeps all original shaft and button inputs available.  Selection, callout,
page dragging, and scrolling gestures are disabled on the scope.

Deploy the current release:

```sh
./deploy/deploy.sh
```

The script builds WASM.  It creates an immutable release directory on the
Acyclic server.  It updates the `current` symlink.  It validates Caddy before
it reloads Caddy.
