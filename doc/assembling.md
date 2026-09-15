# Assembling the Sketchpad Code

## The "tx2m4as" Cross-Assembler

We do not have a copy of the TX-2's assembler, "M4".

The TX-2 project is in the process of writing a compatible
cross-assembler ("tx2m4as") which runs on modern computer which
generates binaries suitable for running on the TX-2 (or at least an
emulator, since the original TX-2 machine no longer exists).

To assemble the Sketchpad code, you will need two git repositories
checked out at the same time: the TX-2-Simulator repository containing
the assembler and this repository, containing the Sketchpad code.

## Example

Here is an example terminal session that builds the assembler and the four
Sketchpad compilation units.

### Building the Assembler

The assembler's [Getting
Started](https://github.com/TX-2/TX-2-simulator/blob/main/docs/assembler/getting-started.md)
guide gives more detailed instructions on how to build it, but here we
will simply show an example of doing so.


```
mkdir assembling-sketchpad
cd assembling-sketchpad
git clone https://github.com/TX-2/TX-2-simulator.git
git clone https://github.com/TX-2/Sketchpad.git
( cd TX-2-simulator && cargo build --workspace )
```


### Running the Assembler

```
cd Sketchpad
./scripts/assemble.sh
```

The printed listing contains four separate M4 assembly jobs.  The script splits
`sk.tx2as` at stable PDF metadata markers.  It writes these files:

```
build/sketchpad-2xmx.tape
build/sketchpad-oplw.tape
build/sketchpad-gx7a.tape
build/sketchpad-boo7.tape
build/SHA256SUMS
```

The script checks each generated tape against `TAPE_SHA256SUMS`.  A changed
source file, assembler, or assembly rule can change these checksums.  Review the
cause before you accept a new checksum.

The script uses the sibling simulator checkout by default.  Set
`SKETCHPAD_TX2_SIMULATOR_DIR` to use a different checkout.
