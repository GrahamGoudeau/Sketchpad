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

Repairs R001 through R041 and the validator changes let the complete source
parse, expand, and assemble.  The two files contain eight separate historical
M4 assembly jobs.  They are not one assembly job.

All eight jobs emit deterministic machine tapes.  The build checks their SHA-256
values against `TAPE_SHA256SUMS`.  The next phase compares emitted words with
the printed octal output.  It then identifies compatible jobs and loads them
into the simulator.

## Validator Changes

The sibling TX-2 simulator checkout uses branch
`sketchpad-reconstruction`.  Commit `d3d1d9b` expands simple macros inside
RC words and treats an omitted pipe address as zero.  Commit `4d6bf6c`
adds the M4 exclusive-OR operator as `@xor@`.  Commit `81e83f9` accepts
bare zero-parameter macros.  Commit `5b2e5c0` accepts omitted macro
parameters and arithmetic-looking macro terminators.  Commit `2e15acd`
accepts arithmetic expressions in origins.  Commit `5e2c77b` accepts macro
substitution in pipe indexes and a nested macro as a parameter.  Commit
`8d7b8da` accepts mixed-script macro parameters.  Commit `ebf7800` accepts
tags on macro invocations.  Commit `8d07d2d` accepts hold bits in macro
parameters.  Commit `b7f4f9d` treats an omitted pipe index as zero.  Commit
`94f536d` accepts the hold indicator as an arithmetic value.
Commit `28208eb` preserves the deferred-address indicator in macro parameters.
Commit `69769eb` permits macro redefinition and restores the prior definition
after parser backtracking.  Commit `39ba1e7` accepts a parenthesized comma-built
word as an arithmetic atom.
Commit `3648200` expands nested macro calls after substituting their outer
parameters.  Commit `d6f6c85` recognizes comment markers that follow source
text.  Commit `e2e8fa3` accepts the M4 question-mark symex terminator.  Commit
`fcac3ab` applies macro parameter elevation at the parameter use site.  Commit
`e6e8cd1` completes RC allocation for equality values and evaluates macro-local
tags in their expansion scope.  Commit `8a0a2e0` evaluates M4 multiplication as
signed 36-bit one's-complement arithmetic.  Commit `5c5b46f` records undefined
symbols that occur inside equality values.  Commit `b7f2c33` lets nonempty tapes
continue from the loader block to their program blocks.  Commit `a26313e` makes
the disassembler read complete six-byte words.  Commits `34da3ba`, `bf9918e`,
and `4ef49ad` preserve structured nested macro values and complete hold-word
parsing.  Commit `af58fbb` evaluates M4 addition and subtraction as signed
one's-complement arithmetic.  Commit `7b54dce` keeps tags on macro invocations
in global scope.  Commit `1551fbf` supports local symbols in RC-word macro
expansions.  Commit `2692cbd` places the RC block after the last manuscript
block, reuses complete bracketed groups, preserves contiguous RC routines,
resolves forward macros inside RC words, and preassigns the standard `A`
through `E` register names.  The assembler package passes 321 unit tests and
2 golden tests.

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
| R008 | `sk.tx2as:2352` | inferred | Enhanced view of Sketchpad part 1, PDF page 51; same-page `3` glyph; `SED` branch and garbage-collector control flow; no `GARB8` definition | Read the final label character as `3`, producing `JPQ GARB3`. |
| R009 | `sk.tx2as:2444` | verified | High-resolution view of Sketchpad part 1, PDF page 53; repeated `META|α LIST` forms at lines 2542, 2557, and 2584; Users Handbook section 6-2.8 | Preserve the printed subscript position of the pipe with `@sub_pipe@`. |
| R010 | `sk.tx2as:3430` | verified | Printed octal output and explicit expansion on Sketchpad part 1, PDF page 75; the `HEADER` definition at line 3251; ten neighboring `HEADER` calls; no `HEADERS` definition | Correct the printed `HEADERS` typo to `HEADER`. |
| R011 | `sk.tx2as:3938` and self-modified addresses at former lines 5888-6199 | inferred | Users Handbook section 6-2.3 makes `?` a symex terminator; the equality was an explicit creative addition absent from the scan; equivalent self-modified exit slots use `#` | Remove the invented `?=#` equality and use current-location `#` for standalone question-mark address placeholders. |
| R012 | `sk.tx2as:1928` | verified | Sketchpad part 1, PDF page 43; the printed macro argument and its target label at line 1982 both read `DUMMEX` | Restore the omitted second `M` in the `LGORR` exit argument. |
| R013 | `sk.tx2as:3132-3145` | mechanical | The printed Unit 2 order matches the original Unit 1 order; `ERROR` expands `ERROR1` inside an RC word; the validator resolves nested macro names in one pass | Move `ERROR1` before `ERROR` and preserve both macro bodies. |
| R014 | `sk.tx2as:3364` | verified | Sketchpad part 1, PDF page 74; adjacent `HEADER` calls; the printed expansion directly below H3 | Restore the omitted `@hamb@` separator before the `HOLDERS` argument. |
| R015 | `sk2.tx2as:89` | inferred | Sketchpad part 2, PDF page 3; paired `β` and `γ` setup and value-location reads; the preceding `PYTH LISTβ` call | Restore the damaged second operand as `LISTγ`. |
| R016 | `sk2.tx2as:566-5182` | mechanical | Printed XOR glyph; repeated forms in Part 1; Users Handbook section 6-2.7 | Replace 26 ASCII caret transcription markers with `@xor@`. |
| R017 | four macro blocks in `sk2.tx2as` | mechanical | Each `ERROR` macro expands `ERROR1`; the validator resolves nested macro names in one pass | Put `ERROR1` before `ERROR` in `ONLW`, `APY5`, `LYUO`, and `Y3HT`. |
| R018 | `sk2.tx2as:766,2648,2665,2682,2704` | mechanical | Printed compound XOR glyph; Users Handbook section 6-2.7; Part 1 repair R005 | Replace `@circled_v@` with `@xor@`. |
| R019 | four definitions and calls in `sk2.tx2as` | mechanical | Printed compound getter macro; parameter order; Part 1 repair R001 | Name the compound macro `GETIX` and preserve both operands as explicit parameters. |
| R020 | `sk2.tx2as:4435` | verified | Sketchpad part 2, PDF page 103; the adjacent `PS2P` branch and target label | Restore uppercase `S` in `JPQ PS2P`. |
| R021 | `sk2.tx2as:1006` | verified | The printed H9.3 expansion; ten adjacent `HEADER` calls; Part 1 repair R010 | Correct the printed `HEADERS` typo to `HEADER`. |
| R022 | the `APY5` `SOLVE` macro | mechanical | `SOLVE` expands `SOLVEM` and `SOLVEM1`; the validator resolves nested macro names in one pass | Put `SOLVE` after both unchanged helper definitions. |
| R023 | the `Y3HT` `PYTH` macro | mechanical | `PYTH` expands `PYTH1`; the validator resolves nested macro names in one pass | Put `PYTH` after the unchanged `PYTH1` definition. |
| R024 | `sk2.tx2as:2502` | inferred | Sketchpad part 2, PDF page 60; the paired `DPX` index-packing pattern in `CCCROSS` and `LLCROSS` | Read the clipped configuration on the second `ADCON` deposit as `2`. |
| R025 | `sk2.tx2as:3790` | verified | Sketchpad part 2, PDF page 90; the only invocation and the printed macro name | Remove the extra transcribed `P` from macro name `LLCROSS`. |
| R026 | `sk2.tx2as:2184` | mechanical | The annotation parser treats the first closing square bracket as the annotation end | Replace the nested-bracket page-header description with equivalent plain text. |
| R027 | the `Y3HT` `FULL` macro | mechanical | `FULL` expands `FULL1`; the validator resolves nested macro names in one pass | Put `FULL` after the unchanged `FULL1` definition. |
| R028 | `sk2.tx2as:5425` | mechanical | The printed logical-disjunction glyph and other recovered M4 XOR glyphs have the same word-combination role | Normalize the four logical-disjunction glyphs to `@xor@`. |
| R029 | `sk2.tx2as:5997`, `6349` | mechanical | The assembler glyph table names the superscript plus glyph `add` | Normalize the two ad hoc `@sup_+@` spellings to `@sup_add@`. |
| R030 | `sk2.tx2as:6719` | verified | Sketchpad part 2, PDF page 150; the adjacent held `TSD` spelling | Read the transcribed barred `h` as the M4 hold indicator `h`. |
| R031 | `sk2.tx2as:939` | verified | The duplicate Part 1 line; ten adjacent `HEADER` calls; the printed expansion below H3 | Restore the omitted `@hamb@` separator before the `HOLDERS` argument. |
| R032 | `sk.tx2as:4330` | verified | Sketchpad part 1, PDF page 91; valid TX-2 opcode spelling | Read `JQP` as `JPQ`. |
| R033 | `sk.tx2as:4414` | verified | High-resolution view of Sketchpad part 1, PDF page 99; the local `XSETKβ` tag in the same macro | Read `XSETXβ` as `XSETKβ`. |
| R034 | `sk.tx2as:4659-4660` | verified | Sketchpad part 1, PDF page 104; the adjacent `TAPEK1` through `TAPEK4` equalities | Read both `TAPER3` occurrences as `TAPEK3`. |
| R035 | `sk.tx2as:4964` | verified | The `MOVINGS` equality and the printed `GX7A` symex table | Read `MOVING` as `MOVINGS`. |
| R036 | `sk.tx2as:5721` | verified | High-resolution view of Sketchpad part 1, PDF page 124; the `45IT1` tag and printed address `016457` | Read `45SIT1` as `45IT1`. |
| R037 | `sk.tx2as:6153` | verified | The nearby `45RWSW` uses and equality; the printed source line | Read `45RSW` as `45RWSW`. |
| R038 | `sk.tx2as:6263` | verified | TX-2 opcode spelling and the printed source line | Read `JNK` as `JNX`. |
| R039 | `sk.tx2as:4793` | verified | High-resolution view of Sketchpad part 1, PDF page 106; adjacent decimal offsets use the same suffix | Restore the faint decimal point after `8`. |
| R040 | `sk.tx2as:5518` | verified | High-resolution view of Sketchpad part 1, PDF page 121; the two marks match the comma-built coordinate words around them | Read the two faint marks as commas. |
| R041 | `sk.tx2as:5520` | verified | High-resolution view of Sketchpad part 1, PDF page 121; repeated coordinate words on the same page | Read the two faint marks as commas. |

## Publication Gate

The upstream Sketchpad repository has no license file.  The Computer
History Museum also limits reuse of its scans.  Confirm publication rights
before a public fork or release.  Keep downloaded scans outside Git.
