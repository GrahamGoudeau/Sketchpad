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

The initial scope-check tape is not Sketchpad.  It verifies the complete path
from a TX-2 paper tape through the CPU, output sequence 60, WebAssembly, and the
browser canvas.  The application also accepts a local paper-tape file.

