# Sketchpad Reconstruction

## Objective

Produce a complete plain-text TX-2 M4 assembly listing for Ivan
Sutherland's Sketchpad.  The listing must assemble with a documented
cross-assembler and reproduce the printed octal words where those words
survive.  A readable C translation is a later deliverable.

## Preserved Baselines

| Material | Upstream commit | Local marker |
| --- | --- | --- |
| TX-2/Sketchpad | `1263829ba8561d03b5c364bf7e339e5dd2d400ed` | `upstream-baseline-2026-09-14` |
| TX-2/TX-2-simulator | `8757845b8aeb1777c73ee2b9ad2885dd66e26288` | `sketchpad-reconstruction-baseline-2026-09-14` |
| CHM Historical Highlights Documents Repository | `31425aaad4268b6b225409b1e1b21c5c8076a0a6` | Pinned source URLs in `sources/README.md` |
| TX-2 Users Handbook, November 1963 | Internet Archive item `tx-2-users-handbook-nov-63` | SHA-256 in `sources/SHA256SUMS` |

The reconstruction branch starts at the unmodified Sketchpad baseline.
The simulator remains in a separate sibling checkout.  Changes to the
simulator must use their own branch and commits.

## Toolchain Baseline

- Host: macOS 15.7.3 on x86_64.
- Cargo: 1.98.1 (`797e8a9bc`, 2026-08-05).
- Rust: 1.98.1 (`48a229cea`, 2026-09-01).
- Simulator workspace build: successful.

Build the simulator:

```sh
cd ../TX-2-simulator
cargo build --workspace
```

Run the Sketchpad assembly check:

```sh
./scripts/assemble.sh
```

## Unmodified Assembly Baseline

The unmodified `sk.tx2as` file fails before it emits a tape.

```text
sk.tx2as:451:23
'@rect_dash@' is not a recognised glyph name
```

The failing token is a compound character used as a macro name.  The
upstream assembler documents compound characters as unsupported.  This
failure is an assembler compatibility problem.  It is not evidence of a
bad transcription.

## Current Assembly Frontier

The mechanical repairs R001 and R002 move the first diagnostic to line
484.

```text
sk.tx2as:484:35
found newline; expected a middle dot or program instruction
```

The failing line ends with the subscript sequence `@sub_pipe@@sub_alpha@`.
This line remains unchanged while its printed form and M4 meaning are
checked.

## Evidence Order

Use the strongest available evidence first:

1. Printed octal output beside the original source line.
2. A second occurrence in either surviving Sketchpad listing.
3. M4 syntax and TX-2 instruction encoding.
4. Local symbol, macro, control-flow, and data-flow constraints.
5. Behavior described in Sutherland's thesis and related primary records.
6. A semantic reconstruction with no direct textual witness.

## Change Classes

Every source change must have one class in the Git commit message and in
the reconstruction log.

- `mechanical`: The change preserves known source meaning and only changes
  representation or assembler compatibility.
- `verified`: Printed octal output or another primary copy proves the
  reconstructed text.
- `inferred`: Program constraints select one reading, but no direct copy
  proves it.
- `speculative`: More than one reading remains plausible.

Do not place speculative text in the canonical assembly file unless the
file marks it clearly and the log records the alternatives.

## Reconstruction Log

| ID | File and location | Class | Evidence | Result |
| --- | --- | --- | --- | --- |
| R000 | `sk.tx2as:451` | baseline | Assembler diagnostic and upstream limitation documentation | Compound macro glyph blocks parsing. |
| R001 | `sk.tx2as:451`, calls, and redefinition | mechanical | Sketchpad part 1, PDF page 16; Users Handbook section 6-4.3; parameter order | Named macro `GETIX` preserves the compound macro's terminators and parameters. |
| R002 | `sk.tx2as:453-461`, `2988`, and `3054` | mechanical | Printed logical-AND glyph; Users Handbook section 6-4.5; assembler glyph table | Markup `@and@` replaces the unsupported ASCII caret transcription marker. |

## Publication Gate

The upstream Sketchpad repository has no license file.  The Computer
History Museum also limits reuse of its scans.  Confirm publication rights
before a public fork or release.  Keep downloaded scans outside Git.
