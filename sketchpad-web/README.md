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
The canvas draws at most 840 scope spots per frame.  Hidden tabs stop executing
the machine.  The display runs at no more than 60 frames per second.  Each
canvas axis uses at most 1,024 pixels.  Three frames above the 20-millisecond
work budget pause the machine.  These limits keep the main thread and GPU
responsive.

Each unit-60 event includes its emulated TX-2 time.  The browser accelerates
the machine until the first scope event.  It then keeps execution 25
milliseconds or less ahead of the real-time display clock.  The renderer
intensifies points in event order and applies a 120-millisecond phosphor
half-life.  A sampled blue-white beam head marks the newest point.  The beam
stays blank between programmed positions.  This models the TX-2 point-addressed
scope.  A one-second readout reports the displayed spot rate.  The renderer does
not add a raster scan or a false line between positions.

The bundled tape is the compatible seven-job Sketchpad reconstruction.  Its
entry point is octal address `200140`.  Its SHA-256 is
`18b4a0f69853faf0a60aab0c0c7943d29dcb21c98c2426250e521706953badae`.

The browser runs the paper tape through the CPU and WebAssembly.  It draws the
unit-60 output on the canvas.  A held pointer over visible scope ink acts as
the unit-55 light pen.  Four sliders control the shaft encoders at address
`377620`.  Thirty-seven momentary buttons control the External Input Register
at address `377621`.  The application also accepts a local paper-tape file.

The browser does not create geometry.  Every visible scope point comes from a
unit-60 event emitted by the emulated TX-2.  Pointer input drives only the
modeled unit-55 light pen.  The shaft encoders and External Input Register are
the program's other interactive inputs.

Deploy the current release:

```sh
./deploy/deploy.sh
```

The script builds WASM.  It creates an immutable release directory on the
Acyclic server.  It updates the `current` symlink.  It validates Caddy before
it reloads Caddy.
