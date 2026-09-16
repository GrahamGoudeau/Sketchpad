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

The machine starts automatically in a dedicated worker.  One worker task has a
0.25-millisecond budget.  Each WASM call executes 16 ticks.  The main thread
does not execute TX-2 instructions.  The canvas draws at most 840 scope spots
per frame.  The display runs at no more than 60 frames per second.  Each canvas
axis uses at most 1,024 pixels.  Three frames above the 20-millisecond render
budget pause the machine.  A 2,048-point queue applies display backpressure.

Each unit-60 event includes its emulated TX-2 time.  The browser accelerates
the machine until the first scope event.  It then keeps execution aligned with
the real-time display clock.  The renderer
intensifies points in event order and applies a 120-millisecond phosphor
half-life.  A sampled blue-white beam head marks the newest point.  The beam
stays blank between programmed positions.  This models the TX-2 point-addressed
scope.  A one-second readout reports the displayed spot rate.  The renderer does
not add a raster scan or a false line between positions.

The scope maps both coordinate extremes to valid canvas pixels.  It does not
add a center graticule.  The TX-2 handbook describes four electronic origin
modes, but it does not show a fixed grid on the display.

The bundled tape contains seven compatible historical Sketchpad jobs and one
separate inferred initialization word.  Its entry point is octal address
`200140`.  Its SHA-256 is
`866d8854d86b899a5192711a73c1925b4c80c903f01c6be8847fc06c6fb70eb5`.

The browser runs the paper tape through the CPU and WebAssembly.  It draws the
unit-60 output on the canvas.  Pointer motion over the scope always sets the
physical pen position.  One click engages the unit-55 sensor.  Escape
disengages it.  Four sliders control the shaft encoders at address
`377620`.  Thirty-seven momentary buttons control the External Input Register
at address `377621`.  The application models the 24 manual toggle registers at
`377700` through `377727`.  The application also accepts a local paper-tape
file.

After reset, the operator first acquires the pen on a bright part of the
assembly-drawn `INK` label.  The photocell cannot detect blank glass.  After
the assembly draws its tracking pattern, the operator can move the pen into
blank space while the tracking pattern remains under it.

The light-pen readout reports the original `LPLOST` state.  The
selection readout decodes Sketchpad's own `ATBITS` word at `200044`.  These are
read-only diagnostics.  They do not change assembly state.  A pickup control
sets the modeled detector radius.  The original hardware had a manual
sensitivity dial whose correct setting depended on scope intensity and was set
by trial and error.  No exact historical dial setting is known.  The browser
starts at a 12-unit modeled radius.  This keeps the assembly tracker close to
the pointer.  The operator can raise it when acquisition is difficult.

Unit 55 reports a light detection.  It does not report pen coordinates.  The
assembly learns a coordinate from the unit-60 point that caused the detection.
A fast mouse jump can move beyond the assembly's tracker search pattern and
set `LPLOST`.  The original `47LOSTPEN` path can then complete a moving object.
The short perpendicular stroke at a moving endpoint is the original tracker
search pattern.  It is not a browser-drawn replacement line.

The desktop interface maps a `D` press to external button Q1.8 and the
recovered `STARTDRAW` routine.  A `D` release removes Q1.8 and holds Q1.6 for
the recovered `STOPMOVEP` routine.  The next `D` press removes Q1.6 before it
sets Q1.8 again.  This latch makes a keyboard release into two physical console
button states.  The original assembly still creates and completes the object.
The interface maps `T` to Q2.9 and `TRUEUP`.  It maps `F` to Q3.3 and `FIXIT`.
It maps `U` to Q2.7 and `UNFIX`.  These shortcuts only change the External
Input Register.  The complete Q4-Q1 button panel stays available.
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

A third regression enters `DESIGNATE`, `STARTDRAW`, and `STARTC`.  It proves
that the assembly allocates circle records and that unit 60 emits a quantized
circular arc.  The browser and Rust layers do not calculate the arc.

Production uses cross-origin isolation and a shared atomic pen record.  The
page reports the browser handler cost and the time from publication to the
worker's hardware setter.  These values measure input transport.  They do not
replace the original assembly timing of the visible tracking pattern.

The diagnostic recorder captures the scope canvas at 30 frames per second.
It adds a cyan recording-only input cursor and state label.  This makes a
pointer-to-tracker offset visible without adding host geometry to the live
scope or the emulated machine.
`MediaRecorder` stores one-second chunks.  The operator can stop the recorder
and download one intact, timestamped WebM file.  Recording does not change the
machine, pen, display stream, or canvas renderer.  Attach the downloaded file
to a defect report when a transient display fault cannot be described from a
still image.  The `R` key starts and stops the recorder.  Modified `R` shortcuts
remain available to the browser.

Run the browser-independent checks:

```sh
npm run test:display
npm run test:capture
npm run test:horizontal
npm run test:vertical
npm run test:jump-loss
npm run test:pen
npm run test:worker
npm run test:assembly
npm run test:circle
npm run test:constraint
npm run test:fix
```

Deploy the current release:

```sh
./deploy/deploy.sh
```

The script builds WASM.  It creates an immutable release directory on the
Acyclic server.  It updates the `current` symlink.  It validates Caddy before
it reloads Caddy.
