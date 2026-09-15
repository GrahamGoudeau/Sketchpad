# Sketchpad Reconstruction

## Objective

Produce a complete plain-text TX-2 M4 assembly listing for Ivan
Sutherland's Sketchpad.  The listing must assemble with a documented
cross-assembler and reproduce the printed octal words where those words
survive.  A readable C translation is a later deliverable.

## Runtime Target

Run the recovered TX-2 machine image in a web browser through WebAssembly.
The simulator already contains the `tx2-web` WASM crate and browser
interface.  Extend that runtime with the display, light pen, switches, and
other devices that Sketchpad requires.  Keep the recovered assembly and
its assembled machine image authoritative.  Use the later C translation
as a readable reference implementation and an optional second WASM build.

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

Repairs R001 through R007 and validator commits `d3d1d9b`, `4d6bf6c`,
`81e83f9`, `5b2e5c0`, `2e15acd`, `5e2c77b`, and `8d7b8da` move the
first diagnostic to line 1259.

```text
sk.tx2as:1259:21
found `@hamb@` after the tag `MKCN2@arr@` and macro name `MAKA`
```

The tagged line invokes `MAKA@hamb@TPVALS@arr@@gamma@`.  Untagged calls of
the same macro already parse.  The scan is clear.  Extend tagged macro
invocation support before changing the source.

## Validator Changes

The sibling TX-2 simulator checkout uses branch
`sketchpad-reconstruction`.  Commit `d3d1d9b` expands simple macros inside
RC words and treats an omitted pipe address as zero.  Commit `4d6bf6c`
adds the M4 exclusive-OR operator as `@xor@`.  Commit `81e83f9` accepts
bare zero-parameter macros.  Commit `5b2e5c0` accepts omitted macro
parameters and arithmetic-looking macro terminators.  Commit `2e15acd`
accepts arithmetic expressions in origins.  Commit `5e2c77b` accepts macro
substitution in pipe indexes and a nested macro as a parameter.  Commit
`8d7b8da` accepts mixed-script macro parameters.  The assembler test suite
passes.

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
| R003 | `sk.tx2as:484` | verified | Later `GORR` copies at `sk.tx2as:3112` and `sk2.tx2as:691,3809` | Explicit zero preserves the printed blank address and satisfies the parser. |
| R004 | `sk.tx2as:492-504` | mechanical | The source invokes `ERROR1` only after both definitions; validator uses one-pass macro lookup | Move `ERROR1` before `ERROR` without changing either definition. |
| R005 | `sk.tx2as:657,678,696,718,3189,4157,4178,4196,4218` | mechanical | Printed compound XOR glyph; Users Handbook section 6-2.7 | Markup `@xor@` replaces the unsupported compound-glyph name `@circled_v@`. |
| R006 | `sk.tx2as:830,832` | inferred | High-resolution view of Sketchpad part 1, PDF page 23; matching faint glyphs; nearby bit-position pattern | Read both missing bit numbers as `8`. |
| R007 | `sk.tx2as:886,888,889,892,920` | verified | High-resolution views of Sketchpad part 1, PDF pages 24 and 25; repeated `α` glyph shape; handwritten button map | Restore three `α` subscripts, draw selector `1.8`, and constraint selector `2.8`. |

## Publication Gate

The upstream Sketchpad repository has no license file.  The Computer
History Museum also limits reuse of its scans.  Confirm publication rights
before a public fork or release.  Keep downloaded scans outside Git.
