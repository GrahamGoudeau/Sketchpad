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

The machine starts automatically.  The browser changes each WASM batch size to
keep about 10 milliseconds of simulator work in one animation frame.  This
keeps the controls responsive on slower mobile devices.

The bundled tape is the compatible seven-job Sketchpad reconstruction.  Its
entry point is octal address `200140`.  Its SHA-256 is
`18b4a0f69853faf0a60aab0c0c7943d29dcb21c98c2426250e521706953badae`.

The browser runs the paper tape through the CPU and WebAssembly.  It draws the
unit-60 output on the canvas.  A held pointer over visible scope ink acts as
the unit-55 light pen.  Four sliders control the shaft encoders at address
`377620`.  Thirty-seven momentary buttons control the External Input Register
at address `377621`.  The application also accepts a local paper-tape file.

Deploy the current release:

```sh
./deploy/deploy.sh
```

The script builds WASM.  It creates an immutable release directory on the
Acyclic server.  It updates the `current` symlink.  It validates Caddy before
it reloads Caddy.
