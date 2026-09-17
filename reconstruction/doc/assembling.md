# Assembling the Sketchpad Code

## The "tx2m4as" Cross-Assembler

We do not have a copy of the TX-2's assembler, "M4".

This repository contains the compatible `tx2m4as` cross-assembler and the
recovered Sketchpad source.

From the repository root, run:

```sh
./build.sh
```

The command builds the assembler, assembles all eight historical jobs, checks
the combined runtime tape, and builds the browser release. The assembly script
splits `sk.tx2as` and `sk2.tx2as` at stable PDF metadata markers. It writes:

```
build/sketchpad-2xmx.tape
build/sketchpad-oplw.tape
build/sketchpad-gx7a.tape
build/sketchpad-boo7.tape
build/sketchpad-onlw.tape
build/sketchpad-apy5.tape
build/sketchpad-lyuo.tape
build/sketchpad-y3ht.tape
build/sketchpad-combined.tape
build/SHA256SUMS
```

The script checks each generated tape against `TAPE_SHA256SUMS`.  A changed
source file, assembler, or assembly rule can change these checksums.  Review the
cause before you accept a new checksum.

The script also runs `tx2dis` on each tape.  This check validates the standard
reader leader, every TX-2 block checksum, the final-block marker, and the end of
the file.
