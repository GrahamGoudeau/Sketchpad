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

The bundled tape is the compatible seven-job Sketchpad reconstruction.  Its
entry point is octal address `200140`.  Its SHA-256 is
`18b4a0f69853faf0a60aab0c0c7943d29dcb21c98c2426250e521706953badae`.

The browser runs the paper tape through the CPU and WebAssembly.  It draws the
unit-60 output on the canvas.  The application also accepts a local paper-tape
file.
