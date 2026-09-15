# Sketchpad Reconstruction Research Log

## Purpose

This log records research checkpoints during the recovery of Ivan
Sutherland's Sketchpad program.  It supplements `RECONSTRUCTION.md`.

`RECONSTRUCTION.md` records each change to the assembly source.
This file records larger findings, failed paths, tool behavior, and open
interpretations.  Git commits preserve the exact implementation history.

## Record Rules

- Record a checkpoint when new evidence changes the project model.
- Separate an observed fact from an interpretation.
- Identify the primary source by file and printed page when possible.
- Record temporary results even when the project does not retain the output.
- Record negative results when they remove a plausible path.
- Link each code change to its Git commit.
- Do not silently strengthen an inferred result into a verified result.

## Checkpoint 1: Reproducible Baselines

Date: 2026-09-14

The work uses three pinned source states.

| Material | Pinned state |
| --- | --- |
| Sketchpad transcription | `1263829ba8561d03b5c364bf7e339e5dd2d400ed` |
| TX-2 simulator | `8757845b8aeb1777c73ee2b9ad2885dd66e26288` |
| Computer History Museum document repository | `31425aaad4268b6b225409b1e1b21c5c8076a0a6` |

The local repositories preserve the first two states with annotated Git tags.
The `sources/SHA256SUMS` file identifies the three downloaded PDF files.
The PDF files remain outside Git because their redistribution rights are not
clear.

Observed fact:

- The inherited plain-text transcription does not assemble with the pinned
  simulator.
- The first failure occurs at an unsupported compound character on source line
  451.

Interpretation:

- A failed modern assembly does not by itself prove an error in the historical
  listing.
- The cross-assembler lacks several forms that the historical M4 assembler
  accepted.

## Checkpoint 2: Evidence-Graded Source Repair

Date: 2026-09-14

The first source pass established four change classes: `mechanical`,
`verified`, `inferred`, and `speculative`.  The reconstruction log records each
source change under one class.

The work restored or corrected these significant items:

- An omitted zero operand in `INX`.
- Two faint bit positions in the `PAGE1` text and number masks.
- Three `READIT` indexes and two button selectors.
- The inferred `GARB3` control-flow target.
- The printed subscript pipe in `ORDGRPI`.
- The `HEADER` call in the H9.3 listing.
- Self-modified question-mark address slots that use the current location.

The exact evidence and source locations are in `RECONSTRUCTION.md` entries R001
through R011.

Research result:

- Source repair and assembler repair must remain separate.
- A source edit needs evidence from the scan or program constraints.
- An assembler edit needs evidence from the TX-2 Users Handbook or repeated M4
  usage in the listing.

## Checkpoint 3: Historical M4 Compatibility

Date: 2026-09-14

The pinned cross-assembler could parse only a subset of the forms in the
Sketchpad listing.  The simulator branch now has a sequence of small commits
that add the required M4 behavior.

The additions include nested macro expansion, macro redefinition, omitted
parameters, mixed scripts, tags on macro calls, hold and deferred-address bits,
RC-word macro calls, parenthesized word assembly, comment boundaries, and the
question-mark symex terminator.

Primary evidence:

- The November 1963 TX-2 Users Handbook describes M4 syntax and word assembly.
- Repeated forms in the Sketchpad listing show how the syntax is used in a real
  program.

Validation result:

- The assembler test suite passes 305 unit tests and 2 golden tests after the
  pass-three RC allocation and macro-local symbol work.
- Simulator commit `e6e8cd1` records that checkpoint.

## Checkpoint 4: The Listing Contains Four Assembly Jobs

Date: 2026-09-14

The full 6,728-line file now parses through macro expansion.  A first attempt to
assemble it as one program reported many duplicate global tags.

Observed facts:

- Four sections independently restart the symex, equality, macro, and main
  phases.
- Later sections reuse global names such as `RI`, `CL`, `ST`, and `LAST`.
- The printed page headers change between the sections.

The four input ranges are:

| Unit | Source lines | PDF pages | Printed header identifier |
| --- | ---: | ---: | --- |
| 1 | 1-2726 | 2-58 | `IES 2XMX` |
| 2 | 2727-3609 | 59-79 | `IES OPLW` |
| 3 | 3610-6318 | 80-135 | `LMH GX7A` |
| 4 | 6319-6728 | 136-152 | `IES BOO7` |

Interpretation:

- The repository file is one transcription container.
- It is not one M4 assembly job.
- Each range needs its own assembler invocation and machine tape.

This result explains the duplicate tags without changing the historical source.

## Checkpoint 5: First Component Tape

Date: 2026-09-14

Unit 4 assembled after the cross-assembler learned pass-three RC allocation and
macro-local tag evaluation.  The assembler emitted a tape of approximately 2.4
KB in a temporary directory.

Observed limitations:

- The unit has no `PUNCH` directive, so the assembler reports no start address.
- The project did not retain the temporary tape.
- No simulator run has verified the tape.

Historical significance:

- This is the first known machine output from this reconstruction branch.
- It proves that one complete historical compilation unit survives in a form
  that the repaired cross-assembler can encode.

## Checkpoint 6: Signed M4 Arithmetic Frontier

Date: 2026-09-14

Units 1 and 3 now reach final expression evaluation.

The two failing expressions have these octal operands:

```text
Unit 1: 777777777776 × 000000004036
Unit 3: 777777777776 × 000000014415
```

Observed fact:

- `777777777776` is negative one in 36-bit one's-complement notation.
- The cross-assembler currently applies unsigned checked multiplication.
- The November 1963 handbook says that M4 forms the address syllable as a
  36-bit integer with normal integer arithmetic.

Interpretation:

- M4 multiplication must interpret both operands as signed one's-complement
  integers.
- These two expressions do not represent arithmetic overflow.

Open work:

- Implement signed multiplication and add regression tests.
- Determine the intended overflow behavior for results outside the signed
  36-bit range.
- Resolve the separate `≡` syntax form in Unit 2.
- Emit and retain all four tapes with reproducible names and checksums.

## Checkpoint 7: Second Component Tape

Date: 2026-09-14

Simulator commit `8a0a2e0` adds checked signed multiplication to the 36-bit
one's-complement type.  The M4 evaluator now uses that operation for `×`.

Validation result:

- The base and assembler crates pass 456 unit tests and 2 golden tests.
- Unit 3 completes all assembly passes.
- Unit 3 emits 1,998 words of binary output before the reader leader.
- Its temporary tape contains 12,192 bytes.

The Unit 1 arithmetic failure also disappears.  Unit 1 now reaches the unknown
symbol `DUMEX` during default symbol assignment.

Interpretation:

- The matching negative-one failures in Units 1 and 3 came from one incorrect
  unsigned implementation rule.
- Unit 3 is the second complete compilation unit to emit machine output.
- A successful assembly does not yet prove that the binary matches the printed
  octal listing or runs correctly.

## Checkpoint 8: Verified DUMMEX Repair

Date: 2026-09-14

Unit 1 reached an unknown symbol named `DUMEX`.  That spelling occurs only in
one transcribed macro call.  The surrounding program defines and uses
`DUMMEX`.

Primary evidence:

- Sketchpad part 1, PDF page 43, prints `DUMMEX` as the final `LGORR` argument.
- Sketchpad part 1, PDF page 44, prints the `DUMMEX` target label.

Repair R012 restores the missing second `M`.

Validation result:

- Unit 1 completes all assembly passes.
- Unit 1 emits 3,607 words of binary output before the reader leader.
- Its temporary tape contains 21,858 bytes.
- Units 1, 3, and 4 now emit machine output.

Interpretation:

- The prior unknown-symbol error was a transcription defect.
- The direct scan makes this repair verified rather than inferred.

## Checkpoint 9: Four Deterministic Component Tapes

Date: 2026-09-14

The final Unit 2 path required three changes.

- Mechanical repair R013 puts `ERROR1` before the `ERROR` macro that invokes it.
- Verified repair R014 restores the printed `≡` separator in the H3 `HEADER`
  call.
- Simulator commit `5c5b46f` records undefined symbols that appear inside
  equality values.  This lets Unit 2 allocate external address `DEGEN1` by the
  documented M4 automatic-assignment rule.

All four units now assemble from one command.

The hashes in this table identify the first deterministic output.  Checkpoint 10
shows that these tapes stopped after their begin blocks.  The project preserves
the hashes here as a record, but `TAPE_SHA256SUMS` no longer accepts them.

| Tape | Binary words | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `sketchpad-2xmx.tape` | 3,607 | 21,858 | `cffd8122997a0d01f11a77be4fdf2cea33a2ae6f78597f0040cf7f61a7db3aa2` |
| `sketchpad-oplw.tape` | 269 | 1,926 | `19c77f993b2fc87566ea8d4224750c22a08cadfce4f08c5cbb48ca54f076b792` |
| `sketchpad-gx7a.tape` | 1,998 | 12,192 | `e0f34e7d727e58f2b3a4056d23a2299e3d19e52128f28cf2b97024a92857bf5c` |
| `sketchpad-boo7.tape` | 383 | 2,490 | `5002ab9fd947d39b789a397012dfa4953b95311a5dadc2e54e4ebcd4b43fcb7b` |

Reproducibility result:

- Two consecutive complete builds produced identical SHA-256 values.
- `scripts/assemble.sh` now splits on stable PDF metadata instead of mutable
  source line numbers.
- The script verifies generated files against committed expected checksums.

Observed limitations:

- Each assembler run still reports that its unit has no `PUNCH` start address.
- Assembly success does not prove that every transcribed word matches the
  printed octal output.
- The project has not loaded the four tapes as one running Sketchpad system.

Historical significance:

- The complete surviving transcription now has deterministic modern machine
  output.
- The next research question changes from "Can this listing assemble?" to
  "Does this output reproduce and run the historical program?"

## Checkpoint 10: Loadable Tape Structure

Date: 2026-09-14

The first structural disassembly found a valid reader leader and a valid
two-word begin block on every tape.  It also found that the begin block marked
itself as the final block.  The remaining program bytes followed that marker as
unreachable trailing data.

Observed cause:

- The tape writer passed `!empty_program` as the `last` flag for the begin block.
- A nonempty program therefore set the final-block address `27`.
- The correct continuation address is `3`.

Simulator commit `b7f2c33` corrects the flag.  It adds tests for empty and
nonempty tapes.  It also regenerates the two example tapes that contained the
same invalid marker.

The corrected large tapes then exposed a separate disassembler defect.  The
reader assumed that one `Read::read` call always filled a six-byte TX-2 word.
Simulator commit `a26313e` uses exact reads and adds a one-byte-at-a-time reader
test.

Structural validation result:

| Tape | Blocks | Valid TX-2 block checksums | Final markers | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `sketchpad-2xmx.tape` | 7 | 7 | 1 | `f3363b1df0f7c7dd56fcbd24f2a84daaedf25f314d2037d25275b1f5c06aabce` |
| `sketchpad-oplw.tape` | 15 | 15 | 1 | `9b0f6256493967790274bba47d4b33d8206be42f419ac23d11889cc1e1c2cc03` |
| `sketchpad-gx7a.tape` | 6 | 6 | 1 | `4ecb87e91f2ea987543d2a14d4f53dfae05f1063517b4cfb45f8c88db5b267d0` |
| `sketchpad-boo7.tape` | 5 | 5 | 1 | `977c0b0b64d0eacc2ca2042dd064685dde0c6ba4cef912101e7bdc33afc6445a` |

Each tape has a valid standard reader leader.  The disassembler reaches every
program block.  It reports no trailing data.

Interpretation:

- The new tapes are structurally loadable by the standard reader leader.
- This validation does not yet prove the correct multi-tape load order or entry
  address.
- This validation does not yet compare each generated word with its printed
  octal witness.

## Current Research State

The canonical historical artifact remains `sk.tx2as`.
It contains all four assembly jobs in printed-listing order.

All four historical units now assemble into deterministic tapes.
The next goal is printed-octal comparison and successful simulator loading.
The browser target will run that simulator through WebAssembly.
The readable C translation will remain a separate explanatory artifact.
