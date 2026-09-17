# Getting Started

## Online Demo

If you just want to see the emulator running, the simplest way is to
use the [online Sketchpad](https://sketchpad.acyclic.sh/).  This runs
locally in your browser.

The rest of this document explains to build and run the emulator and
its associated tools yourself, but you don't need to do that just to
see it running.

## Components of the TX-2 Emulator

The TX-2 emulator repository includes several components:

- Command-line tools for assembling, disassembling and inspecting TX-2
  programs
- A TX-2 emulator which runs locally in your web browser
- A more limited command-line emulator

## Browsing the code

- See the parent directory in the repository for the source code
  itself.
- Generate local Rust documentation with `cargo doc --open`.

## Build Tools

Install [Rust](https://rustup.rs/). The build script installs its pinned
WebAssembly tool in the repository when necessary.

If these instructions seem not to work and the tips in [Build
Trouble](build-trouble.md) don't help, then please [raise a
bug](https://github.com/GrahamGoudeau/Sketchpad/issues/new).


## Building the Code

```sh
./build.sh
```

This command builds the command-line tools, recovered Sketchpad tape, and
browser release.

## Running the Emulator

To run the browser-based emulator:

```sh
cd tx2-web
npm run dev
```

The CLI-based emulator is more limited (some I/O devices are not
implemented in the CLI emulator).  You can run it like this:

```
cargo run --bin cli -- examples/hello.tape
```

See [Debugging Tips](debugging) for tips on how to troubleshoot and
debug the emulator.

## Using the Assembler

If you want to do more than try out the provided example programs, you
will need to use the assembler. See [Getting Started with the
Assembler](assembler/getting-started.md) for information on how to do
this.
