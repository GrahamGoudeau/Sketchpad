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
`4403118be008c8b4eb93b771bba537bd589df2d9bf587bb445078ee98a746e8a`.

The browser runs the paper tape through the CPU and WebAssembly.  It draws the
unit-60 output on the canvas.  A held pointer over visible scope ink acts as
the unit-55 light pen.  Four sliders control the shaft encoders at address
`377620`.  Thirty-seven momentary buttons control the External Input Register
at address `377621`.  The application models the 24 manual toggle registers at
`377700` through `377727`.  The application also accepts a local paper-tape
file.

The desktop interface maps `D` to external button Q1.8 and the recovered
`STARTDRAW` routine.  It maps `T` to Q2.9 and `TRUEUP`.  It maps `F` to Q3.3
and `FIXIT`.  It maps `U` to Q2.7 and `UNFIX`.  These shortcuts only change
the External Input Register.  The complete Q4-Q1 button panel stays available.
Its button titles name every routine found in the recovered `READIT` dispatch
table.

`DRAWASFIX` at `377720` bit 4.9 and `SHOWBLKS` at `377725` bit 4.9 are on by
default.  They keep interactive display and light-pen selection active.  `FIX`
is off during boot.  Turning it on before the model is ready makes the original
program enter `RELAX` too early and raise `OCSAL`.  Turn on `FIX` after a
constraint exists.

The browser does not create geometry.  Every visible scope point comes from a
unit-60 event emitted by the emulated TX-2.  Pointer input drives only the
modeled unit-55 light pen.  The shaft encoders and External Input Register are
the program's other interactive inputs.  A regression run now proves the full
path from an assembly-created line, through original light-pen selection and
`TRUEUP`, to an assembly-created HOV constraint and a residual-reducing pass of
the original `RELAX` solver.

A second regression presses Q3.3 on the selected assembly-created line.  The
original `FIXIT` routine links that line into Sketchpad's `FIXEDS` list without
allocating a new object.  The regression then presses Q2.7.  The original
`UNFIX` routine restores every changed list word.

Deploy the current release:

```sh
./deploy/deploy.sh
```

The script builds WASM.  It creates an immutable release directory on the
Acyclic server.  It updates the `current` symlink.  It validates Caddy before
it reloads Caddy.
