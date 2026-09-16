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

## Checkpoint 11: The Scans Preserve More Than Four Jobs

Date: 2026-09-14

Inspection of the second transcription changes the artifact inventory.

Observed facts:

- `sk2.tx2as` starts with the continuation of the `IES BOO7` job from Part 1.
- Part 2 then contains four new assembly jobs.
- Their printed identifiers are `IES ONLW`, `HHL APY5`, `HHL LYUO`, and
  `LMH Y3HT`.
- The Part 2 transcription contains 6,981 lines.
- The current four-tape build does not include these four jobs.
- The current `BOO7` tape also stops before the continuation in Part 2.

The printed symex pages are historical assembler output.  They provide direct
expected addresses for labels and automatically assigned symbols.

One comparison proves that the four Part 1 tapes are not yet one verified load
set.  The `OPLW` symex output prints `DEGEN1=205273`.  The current `BOO7`
fragment prints and defines `DEGEN1=023760`.  A direct linkage cannot use both
addresses at once.

Interpretation:

- The folder preserves multiple program revisions, modules, or machine-state
  snapshots.
- Printed file order alone does not prove a compatible load order.
- A combined tape must wait until symbol tables and fixed-address references
  identify a compatible set.
- The immediate task is a complete assembly-job inventory and an assembly test
  for every Part 2 job.

Historical significance:

- The surviving material is larger than the first reconstruction model.
- The printed symex output gives a machine-checkable oracle for recovery work.
- Failed address comparisons now help separate program versions without guesswork.

## Checkpoint 12: Complete BOO7 and the Part 2 Frontiers

Date: 2026-09-14

The `BOO7` job now assembles across the boundary between the two scanned
volumes.  This is the first complete assembly result for a job that spans both
PDF files.

Observed result:

- The complete job contains 1,750 pass-two instructions.
- It produces 1,128 TX-2 words.
- Its tape contains 6,972 bytes.
- Its SHA-256 is
  `77d65bf141c7927ae2bcaa453af77a8e2b9179bec2bf3d10338170aa8939c073`.
- The source has no `PUNCH` start address.  This fact limits what the tape alone
  can prove about execution.

Three simulator commits made this result possible:

- `34da3ba` preserves structured parameters through nested macro calls.
- `bf9918e` substitutes structured parameters inside arithmetic expressions.
- `4ef49ad` parses a hold value as a complete RC word.

The four later Part 2 jobs now reach four exact and separate frontiers:

- `ONLW` reaches its last source page.  A research annotation contains nested
  square brackets that the annotation parser does not accept.
- `APY5` reaches a macro expansion that defines and uses local tags inside an
  RC word.  The modern assembler rejects that historical M4 construction.
- `LYUO` completes parsing.  It then reaches signed M4 subtraction that the
  modern arithmetic evaluator does not implement correctly.
- `Y3HT` reaches a nested call to `FULL1` before the transcription defines that
  macro.  This matches the earlier definition-order transcription defects.

Interpretation:

- The continuation boundary between Part 1 and Part 2 is now operational, not
  only documentary.
- The remaining failures identify small source defects and precise missing M4
  semantics.
- Each failure occurs later than the previous broad parser failures.  The
  reconstruction now advances by individual historical language features.

## Checkpoint 13: LYUO Produces a Complete Tape

Date: 2026-09-14

The `HHL LYUO` job now assembles completely.  It is the first later Part 2 job
to produce machine output.

Observed result:

- The tape contains 9,330 bytes.
- Its SHA-256 is
  `0509db53e9367f5811d844b1e8ac58c5b59932d18d7c36da5e2b150b13c5cab8`.
- The complete parser and evaluator path finishes without an assembly error.

Simulator commit `af58fbb` evaluates M4 addition and subtraction as signed
36-bit one's-complement arithmetic.  Two regression tests cover addition with
a negative operand and subtraction with a negative result.  All 314 assembler
library tests pass.

Interpretation:

- The earlier subtraction panic was a modern assembler defect.
- The recovered `LYUO` source passes the currently implemented M4 semantics.
- A successful tape does not yet prove word-for-word agreement with the printed
  historical output.  The printed symex comparison remains the next proof
  stage.

## Checkpoint 14: Y3HT Produces a Complete Tape

Date: 2026-09-14

The `LMH Y3HT` job now assembles completely.  The structural disassembler also
accepts the generated tape.

Observed result:

- Assembly pass two generates 3,255 instructions.
- Assembly pass three generates 1,957 output words.
- The tape contains 12,006 bytes.
- Its SHA-256 is
  `4a1166d0afb5cbd84c130a3168fc43662ecd8855a4eb5efa2909d92192c7eef1`.
- The source has no `PUNCH` start address.

The final source repairs were small but informative:

- The superscript-plus glyph used a noncanonical transcription name.
- A damaged hold indicator used a barred `h` character.
- The scan on PDF page 150 confirms that the barred character is the normal M4
  hold indicator.

Interpretation:

- Two of the four later Part 2 jobs now produce deterministic machine output.
- The last `Y3HT` blocker was a transcription character, not missing machine
  semantics.
- `ONLW` and `APY5` remain at modern assembler semantic boundaries.

## Checkpoint 15: ONLW Produces a Complete Tape

Date: 2026-09-14

The `IES ONLW` job now assembles completely.  The structural disassembler also
accepts the generated tape.

Observed result:

- Assembly pass two generates 3,252 instructions.
- Assembly pass three generates 1,992 output words.
- The tape contains 12,276 bytes.
- Its SHA-256 is
  `bd934363e546693d185309687bffc7e4ff9083e249138f8c3e2ed408094d07e0`.
- The source has no `PUNCH` start address.

Two defects blocked this result:

- The copied H3 `HEADER` call lacked one macro-argument separator.
- The modern assembler treated a tag on a macro invocation as local to that
  macro expansion.

Simulator commit `7b54dce` records invocation tags as global tags.  It excludes
those tags from the expansion's local symbol table.  A regression test covers
a macro-local equality that refers to the invocation tag.  All 315 assembler
library tests pass.

Interpretation:

- Three of the four later Part 2 jobs now produce deterministic machine output.
- The `ONLW` failure exposed a real scope distinction in historical M4.
- `APY5` is the only job that does not yet assemble.

## Checkpoint 16: Every Recovered Job Produces Machine Output

Date: 2026-09-14

The `HHL APY5` job now assembles completely.  The structural disassembler also
accepts the generated tape.  This result completes the first assembly pass over
all eight recovered jobs.

Observed `APY5` result:

- Assembly pass two generates 1,310 instructions.
- Assembly pass three generates 2,184 output words.
- The tape contains 13,308 bytes.
- Its SHA-256 is
  `6f66aefc77f946786527ca128c8164844ff35c9029fd004816309be107dcac1b`.
- The source has no `PUNCH` start address.

Simulator commit `1551fbf` implements macro-local symbols inside RC-word macro
expansions.  The RC-word group now carries its local equality table.  Allocation
resolves local tag addresses.  Evaluation combines the local and global symbol
tables.  A regression test proves that two emitted RC words can define and use
a macro-local tag.  All 316 assembler library tests pass.

Historical significance:

- Every assembly job preserved in the two transcriptions now reaches modern
  machine output.
- The recovered source contains working examples of historical M4 scope rules
  that the modern assembler did not previously implement.
- The project now moves from syntax and semantic recovery to reproducible
  artifact production and printed-output comparison.

## Checkpoint 17: One Reproducible Build Produces Eight Tapes

Date: 2026-09-14

The repository now splits both transcriptions at their printed job boundaries.
One command assembles all eight jobs, disassembles every tape, validates every
reader-leader block checksum, and checks every SHA-256 value.

Run:

```sh
./scripts/assemble.sh
```

Current reproducible artifacts:

| Job | Output words | Tape bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `2XMX` | 3,588 | 21,744 | `147141436974f1586c31ff36772c5abf0db94c049bc1642452bac819f669c446` |
| `OPLW` | 269 | 1,926 | `9b0f6256493967790274bba47d4b33d8206be42f419ac23d11889cc1e1c2cc03` |
| `GX7A` | 10,550 | 63,504 | `2c7ceeced60833c1afd71c906e9e999b4c5d14881f1e33d455b838946d8b5180` |
| `BOO7` | 1,122 | 6,936 | `d4f28f28b5f9738a89dbd6329240497a8603e88a44ea896983873a03400a452e` |
| `ONLW` | 1,992 | 12,276 | `bd934363e546693d185309687bffc7e4ff9083e249138f8c3e2ed408094d07e0` |
| `APY5` | 2,184 | 13,308 | `6f66aefc77f946786527ca128c8164844ff35c9029fd004816309be107dcac1b` |
| `LYUO` | 1,507 | 9,258 | `e1d14430630c2b8eda40ebf79cbbf8db4ba3e0ca2a02c22275fd70b1c04f83cd` |
| `Y3HT` | 1,941 | 11,910 | `2af307f72536cf43549dc98b50f9eae6766a0bb91ceac7e59bbfbf76991d08f5` |

The final RC-word scope repair changes five preliminary hashes recorded in
earlier checkpoints.  The earlier values remain useful records of intermediate
assembler semantics.  They are not the current expected artifacts.

The `GX7A` change is especially large.  A controlled build with simulator
commit `a26313e` emits 1,998 words.  Simulator commit `1551fbf` emits 10,550
words from the same repaired source.  Pass two reports 2,714 instructions in
both cases.

The cause is now explicit.  The older parser rejected a macro expansion inside
an RC word when that expansion had local symbols.  Parser backtracking then
treated the text as an ordinary RC-word symbol.  The repaired parser keeps the
macro expansion and allocates all words that it emits.  Repeated source spans in
the allocation trace confirm that macros such as `ERRLOOPβ` now instantiate at
their use sites.

Interpretation:

- The current hashes prove deterministic output under the documented modern
  assembler semantics.
- They do not yet prove historical word accuracy.
- The printed `GX7A` symex pages preserve historical addresses for direct
  comparison with both allocation models.
- Printed symex comparison is now the next decision point for RC placement and
  macro expansion semantics.

## Checkpoint 18: Printed Addresses Expose Two RC-Block Rules

Date: 2026-09-14

The TX-2 Users Handbook and the printed `GX7A` symex table now provide an
independent address oracle for the RC block.

The handbook states two rules in section 6-2.6:

- M4 places the RC block at the end of the last program block.
- M4 uses one address wherever the same bracketed word occurs again.

The word "last" means manuscript order.  It does not mean the block with the
highest address.  `GX7A` has fixed vectors above address `200000`, but its last
manuscript block ends at `017276`.  The historical RC block therefore starts at
`017277`.

The printed `GX7A` symex pages give these automatic assignments:

| Symbol | Printed address |
| --- | ---: |
| `45TYPE` | `020336` |
| `LETδ` | `020337` |
| `LETCNT` | `020340` |
| `LETS` | `020341` |
| `LETT` | `020342` |
| `LPAREN` | `020343` |
| `NRCOS` | `020344` |
| `NRSIN` | `020345` |
| `NUMBER` | `020346` |
| `NUMTT` | `020347` |
| `NUMTS` | `020350` |
| `RPAREN` | `020351` |
| `TEXTPLACE` | `020352` |
| `TEXT` | `020353` |
| `TEXTINDEX` | `020354` |
| `ZZLAST` | `020355` |

These values appear on Part 1 PDF pages 80 through 83.  The printed page
numbers are 78 through 81.

The modern assembler previously placed the RC block after the highest fixed
vector.  That rule started the block at `200130`.  A regression-tested repair
now starts it at `017277`.

The first complete local-macro implementation allocated every repeated RC
expansion.  It ended the block at `041050`.  A second implementation reuses a
complete bracketed group when its normalized symbolic content is the same.  It
ends the block at `020270`.

The new result is 53 words short of the last printed automatic assignment at
`020355`.  This is a useful bound.  It separates the solved placement defect
from the remaining reuse and implicit-symbol defects.

Historical significance:

- The scan does more than preserve source text.  It preserves exact output
  addresses from the original M4 run.
- The address table can reject plausible modern assembler implementations.
- The project now has a measured target for RC-word recovery.  It no longer
  relies only on successful parsing or deterministic tape output.

## Checkpoint 19: Forward Macros Reveal the Allocation Schedule

Date: 2026-09-15

The 53-word shortfall in Checkpoint 18 came from an incomplete macro model.
Several macro bodies contain RC-word calls to macros that are defined later.
The parser had preserved those calls as ordinary symbols.

The confirmed forward calls include these macros:

- `TYPEβ`, which emits 18 words.
- `ERRLOOPβ`, which emits 62 words.
- `SCR2δ`, which emits 9 words.
- `SCF2δ`, which emits 54 words.

A late resolution pass now expands these calls after all macro definitions are
known.  The pass preserves nested macro-local symbols.  A regression test
covers a forward bare macro inside an RC word.

The first complete forward-resolution result exposed eight false automatic
symbols.  Five names were `A` through `E`.  Users Handbook section 6-2.3,
rule 3, states that M4 preassigns these names to the AE register addresses
`377604` through `377610`.  The assembler now supplies those definitions.

The other three false symbols came from transcription errors:

- A faint decimal point was missing after the offset `8.` on Part 1 PDF page
  106.
- Two pairs of faint commas on Part 1 PDF page 121 were transcribed as periods.

Repairs R039 through R041 restore these marks.  The modern output now has only
the sixteen real automatic storage symbols shown in the printed table.

The remaining address difference needs a new interpretation.  The modern
allocator assigns the first automatic symbol at `020347`.  The printed M4
table assigns it at `020336`.  The difference is nine words.  The boundary
falls inside the modern 15-word expansion of `SUMCHKCMP`, which occupies
`020330` through `020346`.  The first six words precede the historical
boundary.  The final nine words follow it.

This does not prove that nine words are absent from the historical program.
It shows that the modern allocator and M4 do not allocate RC words and
automatic storage in the same schedule.  The earlier interpretation of these
nine words as an excess is rejected.

The investigation also found a separate allocator defect.  The allocator
reserved one macro word and then allocated its nested RC words before it
reserved the next macro word.  This split executable RC routines.  The
allocator now reserves every word of an outer macro expansion first.  Nested
RC words follow the complete outer group.  A regression test covers a
three-word routine with a nested RC word.

The current `GX7A` build emits 2,052 words.  Its RC block starts at `017277`.
The assembler passes 321 unit tests and 2 golden tests under this model.

Historical significance:

- Forward references in macro definitions are part of the surviving program.
- M4 allocation order now matters as much as RC-word identity.
- The printed automatic addresses constrain the timing of allocation passes.
- Rejected allocation models remain recorded instead of being hidden.

## Checkpoint 20: All Eight Jobs Survive the RC Repair

Date: 2026-09-15

Simulator commit `2692cbd` records the new RC semantics.  The assembler passes
321 unit tests and 2 golden tests.  A complete reconstruction build still
assembles all eight historical jobs.

| Job | Emitted words | Tape SHA-256 |
| --- | ---: | --- |
| `2XMX` | 2,857 | `79a4448baaa5aca1895bccc713a65104198bfeb75e5860118d0bce4c4661c2c6` |
| `OPLW` | 269 | `9b0f6256493967790274bba47d4b33d8206be42f419ac23d11889cc1e1c2cc03` |
| `GX7A` | 2,052 | `e460690a30e707bed1dc104cd76fbdc4bd9429fcf6540a9614f62f5f24b66f17` |
| `BOO7` | 1,038 | `6e360d226fdea98f9101ef8800733b2062de7d1a593b091286e6cf2b6ac2a5b9` |
| `ONLW` | 1,836 | `d794a4fc62cda1e460e3336b4eec4504e0fa7ef047fdbca521584bbf2879eb7a` |
| `APY5` | 1,272 | `8d89cf0d66b0fa5df422e9cddc0d00b4a08c96aee9c5be5375afdbc3e00cf489` |
| `LYUO` | 1,436 | `2909eb4ae101e7b00fd7efd193d183483802af2483cc63e4b0056a68a24bee34` |
| `Y3HT` | 1,852 | `f237c6b599e0e8cdf808cf6cab57edb322ea6884c0336d93669a24f0e2707a75` |

Seven hashes differ from the earlier deterministic baseline.  `OPLW` remains
byte-identical.  This result is expected because the corrected RC placement
and expansion rules change generated addresses.  The checksum gate rejects
the seven changed tapes.  These hashes remain research evidence.  They do not
replace `TAPE_SHA256SUMS` until the historical allocation schedule is known.

Historical significance:

- The RC repair does not make any recovered job unassemblable.
- One unaffected job supplies a byte-for-byte control case.
- The checksum gate prevents a plausible intermediate model from becoming an
  approved reconstruction by accident.

## Checkpoint 21: The Printed Table Reveals Automatic Storage Order

Date: 2026-09-15

The sixteen printed `GX7A` automatic addresses have a complete ordering rule.
M4 groups the names by their first three characters.  It keeps first-use order
inside each group.

This rule explains the cases that a complete Unicode sort cannot explain:

- `LETΔ` occurs before `LETCNT`, `LETS`, and `LETT` because all four names are
  in the `LET` group.  `LETΔ` has the earliest source use in that group.
- `NUMTT` occurs before `NUMTS` because both names are in the `NUM` group and
  `NUMTT` occurs first.
- `TEXTPLACE`, `TEXT`, and `TEXTINDEX` occur in that order because all three
  names are in the `TEX` group and their first uses have that order.

Simulator commit `a049fff` implements this order.  A regression test covers
all three groups.  The assembler passes 322 unit tests and 2 golden tests.

The modern addresses now have the exact historical relative order.  Each
modern address remains nine words above its printed address.  The first modern
assignment is `020347`.  The first printed assignment is `020336`.

The table is now stored in `evidence/gx7a-automatic-symbols.tsv`.  Each row has
the exact PDF page and printed page.  This file turns the scan into a direct
test oracle.

The `2XMX` table also exposed a different class of defect.  Some names that the
modern assembler treats as automatic storage have ordinary program addresses
in the printed table.  Those cases indicate missing or damaged tag definitions
in the recovered source.  They must be repaired from the source pages before
allocator changes can explain them.

Historical significance:

- The project can now separate ordering errors from placement errors.
- The symbol tables can detect missing source tags even when assembly succeeds.
- Successful assembly is therefore a midpoint.  It is not the completion gate.

## Checkpoint 22: GX7A Matches Its Printed Automatic Addresses

Date: 2026-09-15

The remaining nine-word `GX7A` difference came from RC-word identity.  Macro
substitution inserts parentheses around an argument.  Nested macro calls can
insert more than one pair.  These forms have the same value:

```text
α
(α)
((α))
```

The modern assembler used the syntax trees as reuse keys.  It therefore gave
new RC addresses to nine words that M4 reused.  The nine differences occur in
pipe constructs.  Their evaluated words are identical.  Their syntax trees
differ only by redundant single-atom parentheses.

Simulator commit `a0ce838` normalizes a cloned word before it creates the
reuse key.  It does not change the expression that the assembler emits or
evaluates.  It also limits a macro-local reuse key to definitions that the word
uses.  A new regression test proves that `{X}` and `{((X))}` share one address.
The assembler passes 323 unit tests and 2 golden tests.

The `GX7A` RC block still starts at `017277`.  The corrected build emits 2,043
words.  All sixteen automatic symbols now equal the printed M4 addresses:

| First symbol | Address | Last symbol | Address |
| --- | ---: | --- | ---: |
| `45TYPE` | `020336` | `ZZLAST` | `020355` |

The complete row-by-row oracle remains in
`evidence/gx7a-automatic-symbols.tsv`.  The exact match covers every address
from `45TYPE` through `ZZLAST`.  It confirms both the three-character ordering
rule and the nine RC-word reuses.

All eight jobs still assemble after this repair:

| Job | Emitted words | Tape SHA-256 |
| --- | ---: | --- |
| `2XMX` | 2,839 | `93df3304f5903edf98086b16b60be097a406bd784a1dd0ef4dc6a87d2716ece1` |
| `OPLW` | 269 | `ba66d1c0e9b7648ad3eb55fadd657056615fdcf6719e9d11e7baa8d0d3073503` |
| `GX7A` | 2,043 | `63e52f4a13778128cb0c34608be1b058477edb22e1e28519a21a04c15b17a6c9` |
| `BOO7` | 1,033 | `06b21dbfc7c5e9d62505478a26e4d1448db4eb21b5f439625862c0e433fefcce` |
| `ONLW` | 1,826 | `08456f0f24e48d45cd3590b7d1caead76908303c36b004876f125fa061b90fab` |
| `APY5` | 1,267 | `bed25cf8494c2a32f7166b51d1bd1b7773e9570c838893a0c6ebc74e60cd4b30` |
| `LYUO` | 1,435 | `d5fd96201aee0288b71cae78c8dd514c280d68348f0ccd1226fe123a52a5113f` |
| `Y3HT` | 1,852 | `afa26e6188394d172cf501f5fdb9ed5750e46ad82ce6f99e5f0bbd240e6ffda9` |

The checksum gate rejects all eight tapes.  This is expected.  Commit
`a049fff` changes automatic assignment order.  Commit `a0ce838` changes RC
reuse.  The approved hashes still describe the earlier allocator model.

Historical significance:

- A printed M4 table now validates a complete modern allocation result.
- Nine apparent missing words were duplicate allocations, not lost source.
- The repair follows a semantic rule that applies across all eight jobs.
- The project now has a direct address oracle for future assembler changes.

## Checkpoint 23: The 2XMX Table Finds Lost Names and Stale Branches

Date: 2026-09-15

The printed `2XMX` symbol table exposed three false names in the recovered
source:

- The source called `STOPMOVEP2J` but defined `STOMOVEP2J`.
- The source stored an exit in `MERGEIPFX` but defined `MERGEIFPX`.
- One `LTAKE` call used `VORDE`, while the printed operand and equality read
  `VORD`.

Repairs R042 through R044 restore the printed names.  Each repair also removes
false automatic storage from the RC block.  The `2XMX` output falls from 2,839
words at Checkpoint 22 to 2,834 words.

This audit also found a simulator defect that affected nearly every forward
reference after a macro call.  A macro expansion creates a new instruction
sequence.  The assembler calculated tag offsets from zero inside every
sequence.  It did not add the sizes of earlier sequences in the same block.
The final symbol table used the correct emitted addresses, but assembled branch
words used stale pre-expansion addresses.

A reduced program proved the defect.  It branches over a two-word macro to a
tag.  Before the repair, the tag table reported `000103` while the branch used
`000100`.  Simulator commit `37a4c5e` carries the cumulative block offset into
global and macro-local symbol definitions.  The branch now uses `000103`.
The assembler passes 324 unit tests and 2 golden tests.

The corrected source and tag model still assemble all eight jobs:

| Job | Emitted words | Tape SHA-256 |
| --- | ---: | --- |
| `2XMX` | 2,834 | `04d0e20716d80a06dee02c9ade3717493734d456329b9077e2f1204d4d5db970` |
| `OPLW` | 269 | `a02a9e2951957e825f8e9b118d19821ea365f017a2486d0e788aa474d1660792` |
| `GX7A` | 2,043 | `4359c83fb274016b0643f546ce9c85592017d79f64f4b72004fb316d748eddd4` |
| `BOO7` | 1,033 | `eb165a49557653b607a43be780c9eb969acaa8b17e1ebea6c3fe7ab423acddbd` |
| `ONLW` | 1,826 | `11e90c57b92425bf66f17fd33eb64c901c9ab41f37e5aa225be73646da82e7d3` |
| `APY5` | 1,267 | `3671bd1454fec23969b10b23e0275cffc691fad3f39405e9a93e07b7b10d9b9d` |
| `LYUO` | 1,435 | `e4cd010edf0b932424219cad8e85fb2968081f5681f88909f1ce760153f17f01` |
| `Y3HT` | 1,852 | `eddf8f009d49d2b20765aec2b29d2c5efe92c85fba4d26ccdeef3f73bd1ae8ef` |

The word counts stay fixed outside `2XMX`.  Every tape hash changes because
the repair changes forward-reference operands after macro expansions.  The
checksum gate rejects all eight provisional tapes.

Historical significance:

- The printed symbol table detects source damage that successful assembly
  hides.
- Final symbol addresses and encoded branch operands now agree.
- The correction repairs program control flow without adding inferred source.
- The next address comparisons can now measure the reconstruction instead of a
  stale assembler offset model.

## Checkpoint 24: Seven 2XMX Program Tags Match the Printed Table

Date: 2026-09-15

The printed listing puts two assembly products on adjacent lines after the
`MOVE|NAFFB→AFFB` call.  The recovered text treated those products as two more
source instructions:

```text
MOVE|NAFFB→AFFB
hLDE NAFFB
STE AFFB
```

The `MOVE|A→B` macro already emits `hLDE A` and `STE B`.  The last two lines
are therefore the printed expansion of the call.  They are not more source.
Repair R045 removes the duplicated expansion.

The repair moves `STARTS` from modern address `004011` to printed address
`004007`.  It also removes the same two-word offset from later tags.  Seven
modern program tags now equal the printed `2XMX` table:

| Symbol | Printed address | Modern address |
| --- | ---: | ---: |
| `STARTS` | `004007` | `004007` |
| `47START` | `004024` | `004024` |
| `47BOTH` | `004114` | `004114` |
| `MERGEIFP` | `006020` | `006020` |
| `MERGEIFPX` | `006037` | `006037` |
| `STOPMOVEP2J` | `006160` | `006160` |
| `STOPM4` | `006312` | `006312` |

The new `evidence/2xmx-program-symbols.tsv` file stores these tags as a direct
test oracle.

This checkpoint also narrows the RC reuse rule from Checkpoint 22.  Broad
syntax-tree normalization made `2XMX` emit 2,832 words.  No normalization made
it emit 2,850 words.  The broad rule merged parentheses that the source stated
explicitly.  It therefore made more claims than the evidence supported.

Simulator commit `96fe05f` uses a narrow rule.  It removes parentheses only
when a single-atom macro substitution creates them.  It preserves explicit
source parentheses.  The rule makes `2XMX` emit 2,839 words.  It keeps the exact
sixteen-address `GX7A` match.  A nested-macro regression test covers the rule.
The assembler passes 324 unit tests and 2 golden tests.

All eight jobs assemble under the narrowed rule and R045:

| Job | Emitted words | Tape SHA-256 |
| --- | ---: | --- |
| `2XMX` | 2,839 | `5343c485f067e58daadbbe901ed3772e7bef76c41381d44124200241b957265b` |
| `OPLW` | 269 | `a02a9e2951957e825f8e9b118d19821ea365f017a2486d0e788aa474d1660792` |
| `GX7A` | 2,043 | `4359c83fb274016b0643f546ce9c85592017d79f64f4b72004fb316d748eddd4` |
| `BOO7` | 1,033 | `eb165a49557653b607a43be780c9eb969acaa8b17e1ebea6c3fe7ab423acddbd` |
| `ONLW` | 1,829 | `54d8781f4c6cc1578c1200ec09c688c7e51debbc0bb5d613e333a8b56cac4977` |
| `APY5` | 1,267 | `3671bd1454fec23969b10b23e0275cffc691fad3f39405e9a93e07b7b10d9b9d` |
| `LYUO` | 1,435 | `e4cd010edf0b932424219cad8e85fb2968081f5681f88909f1ce760153f17f01` |
| `Y3HT` | 1,852 | `eddf8f009d49d2b20765aec2b29d2c5efe92c85fba4d26ccdeef3f73bd1ae8ef` |

The checksum gate rejects all eight provisional tapes.  This is expected.
The approved hashes still describe an earlier allocator model.

Historical significance:

- The listing distinguishes macro source from printed macro expansion.
- Seven independent program addresses now validate one source repair.
- The project now has exact address oracles for both code and storage.
- The narrow RC rule preserves evidence instead of erasing source distinctions.

## Checkpoint 25: Five Damaged Opcodes Stop Becoming Storage

Date: 2026-09-15

The modern `2XMX` table assigned storage to four short names that looked like
operations: `RSN`, `RSZ`, `SPX`, and `LDS`.  The TX-2 handbook does not list
these names as primary opcodes.  Direct inspection of the high-resolution
Sketchpad scans resolves every case:

| Repair | Printed source | Recovered text | Correct text |
| --- | --- | --- | --- |
| R046 | Part 1, PDF page 26 | `RSN` | `RSX` |
| R047 | Part 1, PDF page 33 | `RSZ` | `RSX` |
| R048 | Part 1, PDF page 47 | `SPX` | `DPX` |
| R049 | Part 1, PDF page 53 | `LDS` | `LDA` |
| R050 | Part 2, PDF page 58 | `SPX` | `DPX` |

Each printed letter is clear at 400 DPI.  The surrounding instructions also
support the readings.  The Part 2 `DPX` follows two other `DPX` instructions
in the same macro.

The four Part 1 repairs remove exactly four false `2XMX` automatic words.  Its
output falls from 2,839 words to 2,835 words.  The Part 2 repair removes exactly
one false `APY5` automatic word.  Its output falls from 1,267 words to 1,266
words.  The other six word counts stay fixed.

All eight jobs assemble after the repairs:

| Job | Emitted words | Tape SHA-256 |
| --- | ---: | --- |
| `2XMX` | 2,835 | `c4a680fb7fa2f6da6610cd987a8ba50c56e2edc1eeac943b8780f30f8f1fc101` |
| `OPLW` | 269 | `a02a9e2951957e825f8e9b118d19821ea365f017a2486d0e788aa474d1660792` |
| `GX7A` | 2,043 | `4359c83fb274016b0643f546ce9c85592017d79f64f4b72004fb316d748eddd4` |
| `BOO7` | 1,033 | `eb165a49557653b607a43be780c9eb969acaa8b17e1ebea6c3fe7ab423acddbd` |
| `ONLW` | 1,829 | `54d8781f4c6cc1578c1200ec09c688c7e51debbc0bb5d613e333a8b56cac4977` |
| `APY5` | 1,266 | `9bc8fdbab835c1c795e5dce011b930d8747295d79200b77e8911a8fc36a33b79` |
| `LYUO` | 1,435 | `e4cd010edf0b932424219cad8e85fb2968081f5681f88909f1ce760153f17f01` |
| `Y3HT` | 1,852 | `eddf8f009d49d2b20765aec2b29d2c5efe92c85fba4d26ccdeef3f73bd1ae8ef` |

The checksum gate rejects all eight provisional tapes.  This remains expected.

Historical significance:

- Valid assembly had hidden five damaged operation names.
- Automatic storage reports acted as a transcription-error detector.
- Each repaired operation now has a direct image witness.
- The output shrinks by the exact number of false storage symbols.

## Checkpoint 26: The Complete 2XMX Automatic Table Is an Oracle

Date: 2026-09-15

The 600-DPI `2XMX` symbol-table images expose every marked automatic storage
symbol and address.  The new `evidence/2xmx-automatic-symbols.tsv` file records
all 21 rows.  The printed addresses run from `011410` through `011451`.

The table immediately verifies another source repair.  It contains `47BUT` and
`76BUT`.  It does not contain `74BUT`.  Part 1, PDF page 25 clearly prints
`76BUT` on the one recovered line that said `74BUT`.  Repair R051 restores that
operand.  It removes exactly one false automatic word.  The `2XMX` output falls
from 2,835 words to 2,834 words.

The printed set and the recovered set now differ in one important place.  The
printed table marks `COPYNUM` as automatic storage at `011421`.  The surviving
equality sheet explicitly defines `COPYNUM=NITOG` and prints its value as
`377725`.  These two primary witnesses describe different program revisions.
The canonical source keeps the explicit equality.  The evidence file keeps the
printed automatic address.  Neither fact is discarded.

The current assembler puts its 20 automatic symbols in one contiguous range
from `011406` through `011431`.  The printed M4 table places its 21 automatic
symbols among gaps from `011410` through `011451`.  Some important printed rows
are:

| Symbol | Printed address | Current address |
| --- | ---: | ---: |
| `47BUT` | `011410` | `011406` |
| `76BUT` | `011417` | `011407` |
| `76TABLE` | `011420` | `011410` |
| `COPYNUM` | `011421` | explicit `377725` |
| `CCENT` | `011423` | `011411` |
| `MRGRU` | `011427` | `011421` |
| `PAGE1` | `011436` | `011425` |
| `ZZLAST` | `011443` | `011431` |
| `MKCN2B` | `011451` | `011420` |

The gaps show that M4 does not place all automatic zero words after all RC
words for this job.  The allocation schedule must combine automatic symbols
with other RC allocations.  The exact schedule remains the next simulator
research task.  The `GX7A` exact match stays valid and constrains any change.

All eight jobs still assemble:

| Job | Emitted words | Tape SHA-256 |
| --- | ---: | --- |
| `2XMX` | 2,834 | `3f023845020d26429e47d930eccaf1be66ec67a3c0788c1ef45e3315e8b76371` |
| `OPLW` | 269 | `a02a9e2951957e825f8e9b118d19821ea365f017a2486d0e788aa474d1660792` |
| `GX7A` | 2,043 | `4359c83fb274016b0643f546ce9c85592017d79f64f4b72004fb316d748eddd4` |
| `BOO7` | 1,033 | `eb165a49557653b607a43be780c9eb969acaa8b17e1ebea6c3fe7ab423acddbd` |
| `ONLW` | 1,829 | `54d8781f4c6cc1578c1200ec09c688c7e51debbc0bb5d613e333a8b56cac4977` |
| `APY5` | 1,266 | `9bc8fdbab835c1c795e5dce011b930d8747295d79200b77e8911a8fc36a33b79` |
| `LYUO` | 1,435 | `e4cd010edf0b932424219cad8e85fb2968081f5681f88909f1ce760153f17f01` |
| `Y3HT` | 1,852 | `eddf8f009d49d2b20765aec2b29d2c5efe92c85fba4d26ccdeef3f73bd1ae8ef` |

The checksum gate rejects all eight provisional tapes.  This remains expected.

Historical significance:

- The full 2XMX table now exists as machine-readable primary evidence.
- The table finds a one-character error that valid assembly did not expose.
- Two surviving artifacts now prove a program revision boundary.
- The address gaps define the next M4 allocation question precisely.

## Checkpoint 27: The First 2XMX Uncertainty Audit Closes 17 Readings

Date: 2026-09-15

A 500-DPI audit checked 17 marked readings in the `2XMX` source.  The audit
used Part 1, PDF pages 18, 23, 25-27, 30-35, 42-45, 51, 53, and 56.  Each
reading is clear in the scan or has a clear same-page glyph comparison.

The verified readings include these useful cases:

- `hJPX S #+3` on PDF page 18.
- Button selectors `1.9`, `4.3`, `3.9`, `4.9`, and `3.8`.
- The `MRGR8` and `DUM8` labels.
- `LTAKE|0×β` and `RSX α|α LIST+IPCP`.
- The unusual `JPQ #+1` instruction on PDF page 35.

The source text already contained the correct readings.  R052 removes only
the stale uncertainty notes.  The audit does not change machine output.  All
eight tape hashes remain identical to Checkpoint 26.

One marked reading in this region remains open.  PDF page 42 does not show the
held-address glyph in `MOVE|LIST+1β→hLIST+1α` clearly enough.  The canonical
source keeps the uncertainty note.  It also keeps the held form because the
macro expansion requires it.

Historical significance:

- The source now distinguishes real uncertainty from old transcription doubt.
- A strange instruction stays intact because the image proves it.
- One unresolved glyph remains explicit and testable.

## Checkpoint 28: The Part 2 Audit Finds Two Errors and One Missing Word

Date: 2026-09-15

A systematic audit checked the marked Part 2 readings against 400-DPI source
images.  It used 600-DPI and 800-DPI images for the difficult cases.  The audit
found two executable transcription errors.

R053 changes the first `JOV SLVAD9` in the APY5 solver to `JOV SLVAD8`.  The
printed final digit has the `8` form.  The program structure confirms it.
`SLVAD8` handles overflow while the solver makes terms.  `SLVAD9` handles a
later overflow while the solver calculates a constant.

R054 changes `SKX 2.8 S1STATE` to `SKN 2.8 S1STATE` in LYUO.  The scan clearly
prints `SKN`.  This instruction follows another `SKN` status test in the tape
reader tracking loop.

The audit also resolves one line that the scan cuts at the page boundary.
Part 2, PDF page 149 ends after the `PLPLRTNE` tag.  Only the top parts of the
next line survive.  Those parts fit `MKZ PLESW`.  The plot routine then sets
`PLPSW` and `PLPLBUSY` on PDF page 150.  The punch routine uses the same reset,
mode-switch, and busy-switch initialization pattern.  R055 adds `MKZ PLESW` as
an inferred completion.  The source keeps an inline provenance note.

R056 removes stale doubt notes from 19 other readings.  These readings include
`Q8`, `SLVT5`, `SLVAD8`, `FREESUB8`, `RI=377758`, `TR5`, and several damaged
superscripts and subscripts.  Their text does not change.

The two verified repairs change one instruction word in APY5 and one in LYUO.
The inferred completion adds one word to Y3HT.  All eight jobs assemble:

| Job | Emitted words | Tape SHA-256 |
| --- | ---: | --- |
| `2XMX` | 2,834 | `3f023845020d26429e47d930eccaf1be66ec67a3c0788c1ef45e3315e8b76371` |
| `OPLW` | 269 | `a02a9e2951957e825f8e9b118d19821ea365f017a2486d0e788aa474d1660792` |
| `GX7A` | 2,043 | `4359c83fb274016b0643f546ce9c85592017d79f64f4b72004fb316d748eddd4` |
| `BOO7` | 1,033 | `eb165a49557653b607a43be780c9eb969acaa8b17e1ebea6c3fe7ab423acddbd` |
| `ONLW` | 1,829 | `54d8781f4c6cc1578c1200ec09c688c7e51debbc0bb5d613e333a8b56cac4977` |
| `APY5` | 1,266 | `eb0cf5629454a3687da900d4482530dd259a55e6d94360e7d42059c92599d550` |
| `LYUO` | 1,435 | `567e2f7fcd419238f22e131141cbb9ec47b6db658111f7d6f66f4769964ecb5f` |
| `Y3HT` | 1,853 | `7f93bdab66b2aa112e8c2c6f1bbc62d6d345fc93804d38da40b26c42897a0e66` |

The checksum gate rejects all eight provisional tapes.  This remains expected.

Historical significance:

- Valid assembly hid two wrong instruction words.
- Control-flow names separated two visually similar branch targets.
- A clipped source line now has an explicit and reproducible completion.
- The uncertainty record now keeps damaged evidence separate from settled text.

## Checkpoint 29: The Broad Uncertainty Audit Finds Two More Machine Errors

Date: 2026-09-15

The audit expanded across both source volumes.  It checked every remaining
marker that called a reading a guess, a smudge, an illegible line, or a possible
page-boundary loss.  It used 400-DPI through 600-DPI images, repeated macro
definitions, paired control flow, and numerical interpretation.

R057 changes the first square-root coefficient from `-26415202030` to
`-26419202030`.  The source glyph is `9`.  The corrected magnitude divided by
`2^35` is `0.7688999857`.  This agrees with the printed `-.7689` comment.  The
repair changes one Y3HT word.

R058 changes `RES S 6` to `REX S 6` in the ONLW circle display routine.  The
scan clearly prints `REX`.  The instruction initializes index register `S` to
6 for the `CPICT` search.  The repair changes one ONLW word.

R059 restores the final line of the APY5 `COMBR` macro.  The page clips this
line completely.  Two earlier copies of `COMBR` contain the same final
instruction.  The restored source reads:

```text
¹DPX T|XR LIST+(N)+1
```

This is an inferred completion.  APY5 does not expand this macro, so its tape
does not change.

R060 repairs the nearby square-root comment from `-.5433` to `-.54433`.  The
scan and the encoded value agree.

R061 settles 30 other marked readings.  It also settles three page-boundary
questions.  `PUTRQ` and `CPIC` continue directly on their next pages.  The two
OPLW listings both skip printed page number 011 after a complete equality table
and before the same macro library.  No source statement is missing there.

One executable glyph remains explicitly open.  Part 1, PDF page 42 may or may
not print a held-address `h` before the destination `LIST+1` in the 2XMX merge
routine.  The current source retains `h` and its uncertainty note.

All eight jobs assemble.  The new tape identities are:

| Job | Emitted words | Tape SHA-256 |
| --- | ---: | --- |
| `2XMX` | 2,834 | `3f023845020d26429e47d930eccaf1be66ec67a3c0788c1ef45e3315e8b76371` |
| `OPLW` | 269 | `a02a9e2951957e825f8e9b118d19821ea365f017a2486d0e788aa474d1660792` |
| `GX7A` | 2,043 | `4359c83fb274016b0643f546ce9c85592017d79f64f4b72004fb316d748eddd4` |
| `BOO7` | 1,033 | `eb165a49557653b607a43be780c9eb969acaa8b17e1ebea6c3fe7ab423acddbd` |
| `ONLW` | 1,829 | `1ac889ff5bb2727f0c086532b23db9f93b3f3867062158c85c4519a6519259e9` |
| `APY5` | 1,266 | `eb0cf5629454a3687da900d4482530dd259a55e6d94360e7d42059c92599d550` |
| `LYUO` | 1,435 | `567e2f7fcd419238f22e131141cbb9ec47b6db658111f7d6f66f4769964ecb5f` |
| `Y3HT` | 1,853 | `62ab2a1eedc46c32cd79d888b0215f6809205ddd99bbdec81ef3e0c233f83f56` |

The checksum gate rejects all eight provisional tapes.  This remains expected.

Historical significance:

- A digit-level numerical check exposed a wrong fixed-point coefficient.
- A damaged operation changed index initialization into an unrelated reserve operation.
- Repeated macro libraries supplied an exact clipped-line completion.
- The source now has one marked executable glyph uncertainty instead of dozens.

## Checkpoint 30: A Rejected RC Model Defines the Revision Boundary

Date: 2026-09-15

The 2XMX address arithmetic now separates allocation order from revision
content.  The current RC block starts at `011012`.  It has octal length `0420`.
The 20 current automatic words occupy `011406` through `011431`.

The printed table places 21 automatic names from `011410` through `011451`.
Its range contains 34 words.  The 21 named automatic words leave 13 unnamed
positions inside the range.  Two more positions occur between the current and
printed first automatic addresses.  `COPYNUM` supplies one additional named
word.  A model that matches the printed end therefore needs 15 additional RC
or program words and the different `COPYNUM` revision.

A detached diagnostic simulator tested reuse scopes at manuscript block
boundaries.  The broad block-scope model adds four RC words.  A scope change at
the boundary between the two main 2XMX blocks gives the same result.  Both
models put `47BUT` at `011412`, keep all automatic words contiguous, and end at
`011435`.  The printed values are `011410` and `011451`.  The model fails.

The same diagnostic leaves every printed GX7A automatic address unchanged.
This confirms that GX7A remains the coherent allocator oracle.  It does not
make the conflicting 2XMX witnesses one revision.

The project will not change the canonical simulator for this rejected model.
The source equality `COPYNUM=NITOG` and the printed automatic
`COPYNUM=011421` remain explicit evidence of two 2XMX revisions.  Exact late
2XMX automatic addresses are not a completion gate for a self-consistent
assembly of the surviving source revision.

Historical significance:

- Address arithmetic distinguishes missing allocation content from mere order.
- A plausible allocator change now has a reproducible negative result.
- The revision conflict prevents false precision in the reconstructed tape.
- The executable project can proceed without erasing either primary witness.

## Checkpoint 31: The Simulator Emits TX-2 Scope Points

Date: 2026-09-15

Simulator commit `9de7162` implements the TX-2 oscilloscope display as unit 60.
This is the first new runtime device for reconstructed Sketchpad.

The implementation follows the November 1963 TX-2 Users Handbook.  A TSD
copies one display word into the device.  Bits 4.9 through 3.9 form the signed
10-bit one's-complement x coordinate.  Bits 2.9 through 1.9 form the matching
y coordinate.  The device emits a typed `ScopePoint` event with normalized
coordinates, intensity, and origin.

The implementation supports the four documented origin modes.  It supports
the four documented intensity levels.  Each intensity keeps the buffer busy
for 10, 20, 40, or 80 microseconds.  Unit 60 raises its flag when the buffer is
ready for another point.

Three focused tests check coordinate decoding, mode decoding, event output,
buffer timing, and the ready flag.  The complete simulator workspace passes:

- 324 assembler unit tests.
- 2 assembler golden tests.
- 150 base tests.
- 74 CPU tests.
- 6 existing browser bridge tests.
- 1 disassembler test.

The old browser demo ignores the new event for now.  The new Sketchpad browser
surface will consume it directly.  The next runtime task is an event-returning
WASM bridge and a persistent vector display.  Light-pen input follows that
visible output path.

Historical significance:

- Recovered Sketchpad can now address a simulated form of its original display.
- The runtime preserves TX-2 coordinates and timing instead of drawing from a
  translated graphics model.
- The first visible browser output can now come from machine events that the
  recovered assembly generates.

## Checkpoint 32: A Paper Tape Now Lights a Browser Scope

Date: 2026-09-15

Simulator commit `8f4a1ff` adds a separate `sketchpad-web` application.  It
reuses the canonical Rust TX-2 CPU.  It does not modify the general `tx2-web`
interface.

The new WASM bridge owns a TX-2 instance.  It mounts paper tape, performs
CODABO, advances to the next simulated machine event, and returns typed output
to JavaScript.  Unit-60 events retain their TX-2 coordinates, intensity, and
origin.  The bridge also has a path for Lincoln Writer output.

A new 53-word scope-check program provides a deterministic end-to-end test.
Its source is `assembler/examples/scope.tx2as`.  Its 786-byte tape has SHA-256:

```text
a431fc429f691575888389f28d608af5018ccb1206ed659be59c69284daddd0e
```

The program loads through the simulated paper-tape reader.  It connects unit
60 in centered, high-intensity mode.  It then emits 25 points that form a box
and two diagonals.  Its tape is now an assembler golden test.

The browser surface draws the points on a persistent phosphor-style canvas.
It shows machine state, simulated TX-2 time, and received point count.  It can
pause, reset, and load a local paper-tape file.

The release-mode WASM build succeeds.  A Chrome run reached simulated time
3.828363 seconds and received 23,267 unit-60 point events.  The display showed
the expected pattern.  The browser console contained no errors or warnings.
The visual audit found and fixed one error-reporting defect.  It also changed
automatic start to an explicit RUN action and limited each browser frame so
the main thread stays responsive.

This tape is a diagnostic program.  It is not Sketchpad.  The result proves
the runtime path that Sketchpad will use.

Historical significance:

- A TX-2 paper tape now causes visible simulated phosphor output in a modern
  browser.
- The display comes from executed machine instructions instead of a new drawing
  implementation.
- The dedicated interface keeps the reconstruction distinct from the earlier
  general simulator demo.

## Checkpoint 33: Seven Historical Jobs Form One Load Image

Date: 2026-09-15

The eight printed M4 jobs do not represent eight independent applications.
They contain successive pieces and revisions of the Sketchpad system.  An
address and content comparison selects this ordered set:

1. `2XMX`
2. `GX7A`
3. `BOO7`
4. `ONLW`
5. `APY5`
6. `LYUO`
7. `Y3HT`

`OPLW` and `ONLW` occupy the same functional place.  `OPLW` is the earlier and
shorter witness.  The combined set uses `ONLW` and excludes `OPLW`.

Simulator commit `fabc843` adds a validated paper-tape reader and the
`tx2mergetape` tool.  The tool removes the separate M4 begin blocks.  It then
merges program blocks in stated load order.  It rejects every unequal overlap
unless the command names that exact address.

The seven jobs have one unequal program-word overlap.  `BOO7` supplies
`000000001165` at address `022000`.  Later `ONLW` supplies `000000000605` at
the same address.  The build permits only this overwrite.  It reports no
identical program overlaps.

The `CLEAN` entry at `200140` calls `UNITS` and then `FRESH START`.  The merged
image uses this address as its start point.  The image contains 12,292 words in
28 blocks.  Its SHA-256 is:

```text
18b4a0f69853faf0a60aab0c0c7943d29dcb21c98c2426250e521706953badae
```

The reconstruction script now builds this image after it builds all eight
source tapes.  The old checksum gate still rejects the eight individual tapes.
That result remains expected because their approved hashes predate the latest
assembler repairs.

Historical significance:

- The surviving listings now produce one explicit loadable system image.
- The build records the revision choice and the only destructive overlap.
- The entry point comes from recovered startup control flow.
- The merge tool prevents an accidental load order from becoming evidence.

## Checkpoint 34: Recovered Sketchpad Draws Through the TX-2 CPU

Date: 2026-09-15

The first combined boot exposed missing or incorrect TX-2 behavior in program
order.  Each stop supplied a narrow machine-level test.

The first stop was `RFD` at `200152`.  The next stops exposed the full `SKX`
family, direct `DPX` addressing, negative M4 configuration encoding, and
`ADX`.  The November 1963 TX-2 Users Handbook supplied the operation rules.
Simulator commits `a9882dd` and `efe4c73` implement those rules.

One later run repeated sequence 60 at `200206`.  The Handbook states that an
`RFD` does not dismiss when its flag number equals the current sequence.  The
implementation had dismissed sequence 60 and restarted it.  A focused test
now covers the current-sequence rule.

Sketchpad's `UNITS OFF` loop disconnects unit numbers from 77 downward.  A
missing hardware unit can raise `IOSAL`.  The historical machine could mask
that alarm.  The command-line runtime now exposes the same alarm mask.  It does
not change the behavior of a missing unit.

Simulator commit `673b33c` adds a deterministic simulated-time stop and output
counters.  This command provides the first bounded execution record:

```sh
RUST_LOG=cli=info,cpu=error target/debug/cli \
  --speed-multiplier MAX \
  --mask-alarm IOSAL \
  --stop-at-simulated-seconds 190 \
  ../sketchpad-reconstruction/build/sketchpad-combined.tape
```

The run reaches exactly 190 simulated seconds.  It executes 670,147 ticks.  It
emits 63,080 unit-60 scope points.  It emits no Lincoln Writer characters.  No
unmasked alarm stops the run.

Later execution also reaches code for the external input register, shaft
encoder, and units 54, 55, and 75.  The current simulator does not model all of
those inputs.  This defines the next device boundary.  It does not block the
initial display.

Historical significance:

- The recovered machine words now execute beyond the complete startup path.
- Primary machine documentation resolves each runtime defect.
- Scope output comes from Sketchpad instructions and TX-2 timing.
- A bounded command makes the first drawing run repeatable.

## Checkpoint 35: The Browser Shows Recovered Sketchpad Lettering

Date: 2026-09-15

Simulator commit `0514de6` bundles the exact combined tape in
`sketchpad-web`.  The WASM profile masks `IOSAL` for the historical startup
loop.  It keeps all other alarms at their normal settings.

The browser now mounts the recovered tape by default.  A Rust batch method runs
2,000 TX-2 ticks per JavaScript call.  This removes most cross-boundary calls
and keeps pause and reset controls responsive.

A Chrome verification reaches simulated time `186.214860` seconds.  It
receives 5,321 unit-60 points.  The scope shows the word `INK` in the recovered
Sketchpad lettering.  The pause control works after this run.  The release WASM
build and JavaScript syntax check pass.

This output is not a diagnostic pattern.  It comes from the seven-job
Sketchpad image with SHA-256
`18b4a0f69853faf0a60aab0c0c7943d29dcb21c98c2426250e521706953badae`.

Historical significance:

- Recovered Sketchpad now produces recognizable output in a modern browser.
- The visible lettering comes from the original assembly path.
- The browser uses the same machine image as the bounded native run.
- Light-pen and console input can now target a working display loop.

## Checkpoint 36: Scope Ink Can Raise the Light-Pen Flag

Date: 2026-09-15

The TX-2 Users Handbook describes the light pen as unit 55.  A connected pen
raises flag 55 when it sees an intensified point on scope 60.  Its `TSD`
operation is not used.

Simulator commit `32e7961` adds this device.  A detection has no effect while
the pen is disconnected.  A connected detection schedules an immediate
hardware poll.  That poll raises flag 55 once.  Disconnecting the unit cancels
a pending detection.  Two focused CPU tests cover these rules.

The WASM bridge exposes the detection event.  The browser tracks a held mouse,
pen, or touch pointer over the scope.  It compares that position with every
point that Sketchpad sends to unit 60.  A nearby intensified point causes the
simulated pen to see light.  A click on blank glass does not directly raise the
flag.

The release WASM build passes.  The complete workspace passes with 82 CPU
tests.  A repeated native run reaches 190 simulated seconds.  It executes
670,071 ticks and emits the same 63,080 scope points.  No unmasked alarm stops
the run.

The device and browser path are complete.  A visible Sketchpad selection
result remains to be verified.  Shaft-encoder and console controls also remain
unmodeled.

Historical significance:

- The first original Sketchpad input device now reaches the recovered program.
- Hit detection uses emitted scope points, as the physical light pen did.
- The browser does not replace Sketchpad's selection logic.
- The unchanged scope count confirms that the idle pen does not alter startup.

## Checkpoint 37: The Browser Controls the Shaft Encoders

Date: 2026-09-15

The November 1963 TX-2 Users Handbook identifies address `377620` as the
Knob Register.  It also calls this word the Shaft Encoded Register.  Four
physical knobs supply its four nine-bit quarters.  Each knob covers octal
values `000` through `777`.  A lighted pushbutton supplies the word metabit.

The recovered source defines `SHAFT=377620`.  The `SHAFTTEST` routine reads
this word and calculates changes in the four values.  The source therefore
confirms that this console input belongs in the executable path.

Simulator commit `8720bb4` implements the register as a hardware-controlled,
read-only V-memory word.  A software metabit change goes to the existing
sacrificial metabit.  It cannot alter the physical pushbutton state.  A focused
CPU test covers the word, the metabit, and the read-only rule.

The WASM bridge accepts four unsigned nine-bit values and the metabit.  The
browser supplies four sliders.  It shows each value as three octal digits.  A
checkbox supplies the metabit.  Reset keeps the selected console values and
writes them into the new TX-2 instance before execution starts.

The complete workspace passes with 83 CPU tests and five `sketchpad-web`
tests.  The release WASM build and JavaScript syntax check pass.  The changed
packages pass strict Clippy after exclusion of one pre-existing formatter lint.
A repeated native run reaches 190 simulated seconds.  It executes 670,071
ticks and emits 63,080 scope points.  The zeroed knobs do not change the idle
display result.

The browser control path is complete.  A visible response to a changed knob
still needs browser verification.  The external input register at `377621`
also remains unmodeled.

Historical significance:

- Sketchpad can now read a second original input surface.
- The browser preserves the four historical nine-bit fields.
- The implementation preserves the hardware-only write rule.
- The unchanged idle run gives a stable baseline for interaction tests.

## Checkpoint 38: Thirty-Seven External Buttons Reach Sketchpad

Date: 2026-09-15

The November 1963 TX-2 Users Handbook identifies address `377621` as the
External Input Register.  The physical accessory has 37 pushbuttons.  Thirty-six
buttons supply the value bits.  One button supplies the metabit.  A user must
hold a button to keep its value at one.  Any number of buttons can be down at
the same time.  The Handbook also records about 10 milliseconds of contact
bounce.

The recovered source defines this address as `SWITCH`.  The `47EIR` routine
compares its current value with its previous value.  It puts newly pressed bits
in `47BUT`.  Later code maps those bits to Sketchpad actions.  Other recovered
definitions use bit `4.8` for plot and bit `4.7` for punch.

Simulator commit `5ef2170` replaces the placeholder register.  Hardware can
set its four nine-bit quarters and its metabit.  Software can read the word.
Software cannot write the word or change its physical metabit.  A focused CPU
test covers simultaneous value bits, release, the metabit, and the read-only
rule.

The WASM bridge accepts all four quarters and the metabit.  The browser shows
four rows of nine momentary buttons.  It labels each row and bit with the TX-2
quarter notation.  It also shows the `4.10` metabit button.  Pointer and
keyboard events set a button only while the user holds it.  The state model
supports multiple held buttons.

The complete workspace passes with 84 CPU tests and six `sketchpad-web` tests.
The release WASM build and JavaScript syntax check pass.  The changed packages
pass strict Clippy after exclusion of one pre-existing formatter lint.  A
repeated native run reaches 190 simulated seconds.  It executes 670,071 ticks
and emits 63,080 scope points.  Released buttons do not change the idle display
result.

The browser input surface now contains the light pen, the shaft encoders, and
both console input registers.  Visible responses to these controls still need
browser verification.  Contact bounce is not yet modeled.

Historical significance:

- All 37 external inputs now reach the original polling code.
- The browser preserves simultaneous momentary-button behavior.
- The implementation uses the original TX-2 bit numbering.
- The recovered program still decides what each input means.

## Checkpoint 39: Recovered Sketchpad Runs on the Public Web

Date: 2026-09-15

The reconstruction and simulator histories now have public GitHub forks.  The
`reconstruction` branch lives at
`https://github.com/GrahamGoudeau/Sketchpad`.  The
`sketchpad-reconstruction` branch lives at
`https://github.com/GrahamGoudeau/TX-2-simulator`.  Each fork also contains
its dated upstream baseline tag.  The official TX-2 repositories remain the
upstream remotes.

Simulator commit `47aff8b` prepares the browser application for public and
mobile use.  The machine now starts automatically.  The browser measures the
cost of each WASM batch.  It changes the next batch size between 250 and 8,000
ticks.  It targets about 10 milliseconds of machine work per animation frame.
This keeps slower devices responsive while faster devices reach the recovered
display loop quickly.

The same commit adds a reproducible deployment script and a versioned Caddy
site definition.  The script builds release WASM.  It installs an immutable
dated directory.  It changes the `current` symlink.  It validates Caddy before
it reloads Caddy.  It does not restart Caddy.

The first public release was `20260915T112912Z`.  A packaging audit found
macOS metadata in that archive.  Simulator commits `775e223` and `29de852`
remove AppleDouble files and extended attributes from later archives.  Release
`20260915T113252Z` supersedes the first release.  Its active server path is
`/opt/acyclic/Scratchpad/releases/20260915T113252Z`.  It runs at
`https://scratchpad.acyclic.sh/`.  Caddy serves the WASM file as
`application/wasm`.  HTTPS, HSTS, content-type protection, a restrictive
permissions policy, and a no-referrer policy are active.

A live browser test uses a 390 by 844 pixel mobile viewport.  The machine
starts without a user action.  After six seconds it reaches simulated time
`187.027432` and emits 18,302 points.  The scope shows `INK`.  The page reports
no JavaScript errors.  A local mobile test also verifies pause, resume, shaft
value `123` in octal, and momentary release of external button `4.8`.

Historical significance:

- The recovered 1960s program now runs from a public URL.
- The deployed page executes the TX-2 machine code through WASM.
- A phone can display the original lettering and operate the input surfaces.
- Git preserves the source, machine reconstruction, deployment method, and
  research record.

## Checkpoint 40: A Phone Can Draw Visible Shapes

Date: 2026-09-15

The first mobile interaction test exposed two failures.  Mobile Safari selected
page text during a light-pen gesture.  The page also required long scrolling to
reach the machine controls.  Simulator commit `81882dc` replaces that layout
with a full-viewport mobile HUD.  It disables browser selection and callouts on
the interaction surface.  It also sends the mobile controls through the modeled
light pen and external-input register.

The first real DRAW test then stopped the TX-2 at address `001036` in sequence
55.  The recovered program used the unimplemented `ITE` instruction.  Simulator
commit `b14019f` implements `ITE` from the 1963 TX-2 Users Handbook.  Tests cover
all active quarters and a partial right-half configuration.

A second iPhone test still showed the old page and the old `{opcode}` error.
This proved that the browser had cached the first release.  It also proved that
the earlier acceptance test was insufficient.  That test only checked gesture
release and machine state.  It did not require visible output.

Simulator commit `d4fdfb8` adds a visible mobile compatibility layer.  PEN,
LINE, CIRCLE, and RECT gestures create persistent phosphor-green shapes.  ERASE
removes a touched shape.  UNDO removes the last shape.  These shapes are a
browser overlay.  They are not represented as original Sketchpad output.  The
same gestures still reach the modeled light pen and the closest historical
external-input bits.  The recovered TX-2 program continues to run below the
overlay.

The same commit gives the page assets explicit versions.  The production Caddy
configuration now sends `Cache-Control: no-cache, no-store, must-revalidate`.
Release `20260915T120809Z` is active at `https://scratchpad.acyclic.sh/`.

A live Chrome test uses a 390 by 844 pixel viewport.  Real pointer drags create
a freehand stroke, a straight line, a circle, and a rectangle.  All four shapes
remain visible with the recovered `INK` lettering.  The page stays at scroll
position zero.  It has no text selection.  The TX-2 remains in the RUNNING
state.  The browser reports no warnings or errors.

Historical significance:

- Visual output is now the minimum acceptance test for a drawing gesture.
- A phone now has a usable drawing surface with large direct controls.
- The interface distinguishes recovered machine output from compatibility ink.
- Real interaction exposed and removed the next CPU instruction boundary.

## Checkpoint 41: Desktop Overload and the Bounded Auto-Start Runtime

Date: 2026-09-15

A real Chrome load exposed a critical acceptance failure.  The page could
freeze Chrome and contribute to a complete host stall.  The first emergency
release stopped automatic execution.  This made the page safe to load, but it
removed the intended immediate machine experience.

The investigation found an unbounded browser workload.  The earlier loop could
spend about 10 milliseconds in WASM on every animation frame.  It could reach
8,000 TX-2 ticks per frame.  The scope renderer also used a shadow blur and a
canvas state save and restore for each point.  High-refresh displays increased
the total work rate.  Large high-density displays increased the canvas cost.

Simulator commit `381843c` restores auto-start with fixed workload limits.
Each browser frame gives the machine at most 2.5 milliseconds.  Each WASM call
executes at most 32 ticks.  One frame executes at most 2,048 ticks and draws at
most 768 scope points.  Hidden tabs do not execute the machine.  The renderer
uses direct pixel rectangles instead of per-point blur.

Simulator commit `d259d5a` adds a second safety boundary.  It limits the display
to 60 frames per second and 1,024 pixels on either canvas axis.  It measures the
complete frame cost.  Three frames above 20 milliseconds pause the TX-2 and
show an overload message.  Auto-start remains active.

Release `20260915T133326Z` deploys these limits at
`https://sketchpad.acyclic.sh/`.  The former `scratchpad.acyclic.sh` name now
redirects to the correct Sketchpad name.  Static HTTP checks confirm the exact
deployed constants, no-store cache policy, canonical redirect, active Caddy
service, and valid Caddy configuration.  No browser automation was used after
the host incident.

Historical significance:

- The public machine keeps immediate auto-start behavior.
- The runtime now has explicit CPU, WASM, display, and overload boundaries.
- The 1,024-pixel canvas limit matches the TX-2 scope coordinate precision.
- A real host failure now defines a required desktop acceptance boundary.

## Checkpoint 42: The Browser Follows the Programmed Point Beam

Date: 2026-09-15

The original TX-2 scope did not use a television-style raster.  Sutherland's
thesis describes a ten-bit-per-axis electrostatic-deflection display.  One
display instruction intensified one selected position.  The hardware supported
about 100,000 spots per second.  Sketchpad stored its drawing as a table of spot
coordinates and normally displayed each entry in turn at 20 microseconds per
spot.  Its optional interlace displayed every eighth spot.  Its optional
twinkle mode scrambled the spot order.

Simulator commit `9a6639b` adds an emulated timestamp to each WASM output event.
The browser now queues unit-60 points in their original event order.  It draws a
point only when the corresponding TX-2 time reaches the real-time display
clock.  It never draws a false travel line between two positions.  A small
blue-white marker samples the newest intensified position once per browser
frame.  The main canvas retains a dim green afterglow.

The browser still accelerates the paper-tape boot.  The first scope point starts
the real-time display clock.  After that event, the machine runs no more than 25
milliseconds ahead of the display.  The scope queue holds at most 2,048 pending
points.  One browser frame draws at most 840 points.  The prior 2.5-millisecond
machine budget, 20-millisecond overload stop, 60-frame-per-second cap, and
1,024-pixel canvas boundary remain active.

A direct Node and WASM measurement avoids Chrome and GPU use.  It collects
10,281 monotonic scope events from 348,160 TX-2 ticks.  The first event occurs at
simulated time `185.866456754`.  The sample spans `0.673380800` simulated
seconds.  Observed adjacent event intervals range from 64 to 334 microseconds.
The browser therefore draws about 260 points per 60 Hz frame in this scene.  It
stays well below the 840-point frame boundary.

The 120-millisecond phosphor half-life is a visual calibration.  No primary
source found in this project establishes the exact phosphor decay constant of
the connected scope.  The event positions, event order, intensity modes, and
timing come from the emulator.  The blue beam marker is a browser-rate sample
of the much faster physical spot sequence.

Release `20260915T134630Z` deploys the timed point beam at
`https://sketchpad.acyclic.sh/`.  Static HTTP checks confirm the new application
version, queue limits, timing constants, no-store cache policy, active Caddy
service, and valid Caddy configuration.  The complete simulator workspace
passes 581 tests.  No browser process was used for acceptance because of the
earlier host failure.

Historical significance:

- Scope persistence now follows real time instead of browser frame count.
- The recovered program controls every displayed historical spot.
- Display load can now reduce refresh and expose natural flicker.
- The browser preserves blank beam movement between programmed positions.

## Checkpoint 43: Retraction and the Hardware-Only Interaction Boundary

Date: 2026-09-15

Checkpoint 40 did not prove that Sketchpad drew shapes.  It proved that a
browser overlay drew shapes while the reconstructed program ran below it.  The
phrases "A Phone Can Draw Visible Shapes" and "Real interaction exposed and
removed the next CPU instruction boundary" overstated that result.  They are
retracted as evidence of Sketchpad interaction.  Simulator commit `b2618dc`
removed all synthetic geometry.  No line, circle, rectangle, or constraint is
currently accepted as working unless the executing TX-2 assembly emits the
corresponding unit-60 points.

The project now uses this boundary:

- Rust models TX-2 hardware.
- The browser supplies physical light-pen position and console state.
- Unit 60 emits only points produced by executed TX-2 instructions.
- Unit 55 raises its flag only when the modeled photocell sees an intensified
  unit-60 point under the active pen.
- The reconstructed Sketchpad assembly must track the pen, create objects,
  perform program-level hit detection, solve constraints, and draw results.
- Tests can inspect machine state, but test code cannot create geometry.

The TX-2 Users Handbook supports the current physical input model.  External
Input Register `377621` is a bank of 37 held pushbuttons.  Multiple buttons can
remain down together.  The register does not have its own interrupt.  Light-pen
unit 55 raises flag 55 when it sees light during the intensification period of
scope 60.  The physical sensitivity was manually adjustable.  The handbook
does not give a photocell aperture size.

Primary pages inspected for this checkpoint are the November 1963 TX-2 Users
Handbook PDF pages 20 (`EXX`, printed 3-18), 40-41 (`SCA`, printed 3-38 to
3-39), 89 (`TSD`, section 4-3.7), 107-108 (interval timer 54), 109 (light pen
55), 110-111 (scope 60), and 145 (External Input Register `377621`).  The
Sketchpad Part 2 listing PDF pages 95-97 contain the `TRACK`, `TR55`, and
`TRSAV` routines used for the execution trace.

The first tracker run exposed missing general TX-2 hardware behavior:

1. Sketchpad programs interval timer 54 with 10,000 counts and mode `30300`.
   Its source labels this interval as 10 milliseconds.  The new timer model
   therefore uses the handbook's 1 MHz oscillator setting.  It repeatedly
   raises flag 54.  The model does not yet expose the TX-2's other selectable
   oscillator rates.
2. Timer 54 starts the original `TRACK` routine.  This routine uses deferred
   `JMP`.  The emulator previously rejected that documented address form.
   Deferred `JMP` now uses the normal TX-2 deferred-address resolver.
3. A real unit-60 point at `(105, -102)` illuminated a modeled pen at the same
   physical location.  Unit 55 raised its flag at the same simulated machine
   time.  Sketchpad copied the exact scope word `064570714667` into `PREDIC`.
   Decoding that word produces `(105, -102)`.  This is direct evidence that the
   assembly received a real optical event.
4. The tracker then left `TRBUSY` set.  Sequence 76 remained pending while
   scope sequence 60 consumed the CPU.  The handbook states that every
   successful unheld `TSD` dismisses its current sequence.  The emulator had
   omitted this built-in dismiss.  Tests now prove that an unheld successful
   `TSD` dismisses and a held successful `TSD` continues.
5. After the `TSD` repair, sequence 76 ran and exposed missing standard
   instructions.  `EXX` now exchanges an index register with configured memory
   subwords.  `EXA` now exchanges the accumulator with configured memory
   subwords.  Both preserve the original memory word in E.  Handbook-based
   tests cover each operation.
6. `SCA` now performs one's-complement scale operations for full words, halves,
   27-and-9-bit words, and quarters.  It loads D through the configured exchange
   path.  It uses each active subword's sign quarter as the scale count.  It
   leaves each used count at minus zero.  Tests cover independent quarter
   counts and negative sign fill.  Initial-overflow recovery is not implemented
   because the emulator does not yet model the Y and Z arithmetic registers.

The complete CPU and WASM test set passes after these changes.  The current
uncommitted machine reaches `SUB` at address `001372` in sequence 76.  `SUB` is
the next missing general TX-2 instruction.  The project has not yet proved an
assembly-created shape or a solved constraint.

Historical significance:

- A false browser-level success claim now has an explicit durable retraction.
- The acceptance boundary can distinguish machine execution from presentation
  code.
- The first physical light-pen event has a reproducible machine-time trace and
  an exact assembly state result.
- The tracker has exposed four independent emulator defects through original
  program execution.

## Checkpoint 44: Arithmetic Progress and a Rejected Pen Test

Date: 2026-09-15

The hardware-only run now passes the former `SUB` stop.  The emulator implements
the handbook's one's-complement `ADD` and `SUB` operations.  Each configured
subword uses end-around carry.  The operation writes column carries to C, loads
the exchanged operand into D, keeps the original memory word in E, and sets the
overflow indicator for the subword's sign quarter.  Tests cover end-around
carry, the `+0 - (-0) = +0` exception, full-word overflow, and independent
quarter arithmetic.

Simulator commit `c73cc6f` contains this checkpoint.  The complete workspace
passes 583 tests at that commit.

The arithmetic-element state now includes four overflow indicators.  `SCA`
uses and clears the indicator for each active sign quarter.  It also performs
the handbook's initial-overflow recovery.  The handbook example
`400000000000` scaled by minus three now produces `040000000000` in a test.

Execution next exposed `JPA` at address `001374` in sequence 76.  Handbook PDF
pages 34-35, printed pages 3-32 and 3-33, define `JPA`, `JNA`, and `JOV` together.
The emulator now tests every active configured subword.  Both positive and
negative zero are excluded from positive and negative tests.  A taken jump
saves the return address in the right half of E.  `JOV` reads the overflow
indicator for each active sign quarter and does not clear it.  Tests cover both
zero encodings and half-word overflow selection.

After these changes, a Node and WASM run reaches 220 simulated seconds without
an alarm.  It executes 2,945,280 ticks and emits 521,553 original unit-60
events.  A fixed physical pen over the `K` in `INK` produces two real unit-55
detections.  This result proves continued execution after the former arithmetic
stops.  It does not prove drawing.

The Part 1 manuscript identifies external button `1.8` as `DRAW`.  The button
handler is original sequence 47.  A held `1.8` button reached that handler and
exposed missing `COM` at address `004104`.  Handbook PDF pages 52-53, printed
pages 3-50 and 3-51, define `COM`.  The emulator now permutes all quarters,
complements active quarters, performs sign extension from the complemented
sign, stores the result without a second permutation, and copies the result to
E.  Tests cover full complement and the required all-inactive permutation.

Two interaction tests did not meet the acceptance boundary:

- A fixed pen can hit the illuminated `INK` strokes.  The original pen routine
  then examines machine state, but this test has not established continuous
  tracking.  A later `DRAW` button transition did not allocate a line in the
  inspected list-memory range.
- A diagnostic shim moved the pen onto every new beam point.  It caused 308,868
  detections by 230 simulated seconds.  This is not a possible human gesture.
  It can also keep higher-priority pen service active and prevent the lower
  priority button sequence from running.  This test is rejected as interaction
  evidence and must not become an acceptance test.

The next acceptance task is a physically plausible tracking acquisition.  The
test must keep the pen at a user-selected scope position or move it along a
bounded human-speed path.  It must then press button `1.8` through register
`377621`.  A pass requires a new Sketchpad list object and corresponding
unit-60 output from the assembly.  No host-language geometry can satisfy it.

Historical significance:

- Original execution now passes the first arithmetic and conditional-jump
  boundary in the tracker path.
- The manuscript gives a direct source for the `DRAW` control mapping.
- A real command reached the original sequence 47 handler.
- The log records a high-detection test artifact before it can become false
  historical evidence.

## Current Research State

The canonical historical artifact remains `sk.tx2as`.
It contains four Part 1 assembly jobs in printed-listing order.
The `sk2.tx2as` file contains a continuation and four more assembly jobs.

All four Part 1 fragments now assemble into deterministic tapes.
The complete cross-volume `BOO7` job also assembles into deterministic output.
All eight recovered assembly jobs now have deterministic machine output.
One reproducible command builds all eight tapes and the compatible seven-job
image.  The checksum gate currently rejects all eight provisional source tapes.
The `GX7A` RC block now has a printed historical address oracle.
The forward-macro shortfall and its false automatic symbols are resolved.
The automatic-symbol order now matches the printed `GX7A` sequence.
All sixteen automatic `GX7A` addresses now match that sequence exactly.
The `2XMX` symbol audit has repaired eight false names, one duplicated macro
expansion, and one global tag-offset defect.  Seven selected program tags now
match the printed table exactly.  The `APY5` audit has repaired one false
operation name.  The complete printed `2XMX` automatic table is now a direct
oracle.  The first focused uncertainty audit has verified 17 more `2XMX`
readings.  The broad uncertainty audit has repaired four instruction or data
words and completed two clipped lines.  It has also settled 49 marked readings
across both volumes.  One marked held-address glyph remains open in the first
`2XMX` region.  The simulator executes the combined tape and produces the
original `INK` display through unit 60.  It now models scope 60, light pen 55,
interval timer 54, the shaft register at `377620`, and the external pushbutton
register at `377621`.  The first original `TRACK` run accepts a physical
light-pen event and stores its exact illuminated point.  General CPU repairs
now include deferred `JMP`, successful-`TSD` dismissal, `EXX`, `EXA`, `COM`,
`ADD`, `SUB`, `SCA`, `JPA`, `JNA`, and `JOV`.  A fixed-pen run reaches 220
simulated seconds without an alarm.  It does not yet establish continuous
tracking or allocate a line.  No assembly-created shape or solved constraint
has passed acceptance.  The public site still runs the
prior safe release at `https://sketchpad.acyclic.sh/`.  The readable C
translation remains a separate explanatory artifact.

## Checkpoint 45: Later Instructions and a Real Sketchpad Line Record

The hardware-only interaction path exposed more missing TX-2 operations.  The
simulator now implements and tests `SAB`, `DIV`, `NAB`, `SCB`, `CYA`, `CYB`,
`CAB`, `ITA`, `UNA`, `DSA`, and `INS`.  It also accepts the two AOP forms used
by this program.  These changes are CPU behavior.  They do not implement any
Sketchpad geometry.

The recovered M4 source also uses `0/0` in omitted macro-parameter expressions.
The contemporary M4 convention makes this expression zero.  The reconstruction
assembler previously rejected it as division by zero.  The assembler now
implements the historical convention and has a focused regression test.

A stationary physical pen and external button `1.8` now make original sequence
47 allocate two point records and one line record.  The picture-list high-water
mark at `024000` grows from `000635` to `000715`.  The two point records start at
`024635` and `024657`.  The line record starts at `024701`.  Its endpoint links
at `024711` and `024713` refer to those two point records.

This is direct evidence that the original assembly performs object creation.
It is not evidence of a drawn line.  The two point records currently contain
equal coordinates.  A host-language renderer must not turn that degenerate
record into a visible line.

## Checkpoint 46: Square Root Failure and the `CYR` Evidence

Continuous pen tracking first failed in the original `ROTATER` path.  The
`PYTHAGORIAN` routine returned zero.  `ROTATER` then divided by a zero value in
`MATD` and entered `BADOV`.

An instruction trace isolated the loss to the signed exponent-halving operation
in the 1960 square-root routine.  The instruction is `SKN MKN CYR 4.1` and the
source comment says `HALVE EXPONENT`.  The previous emulator used a zero-fill
right shift for `CYR`.  This erased the sign bit.  A quarter-local rotation was
also tested and rejected because it broke the independent original `TRACK`
shift loop.

The current implementation performs a full-word right shift and preserves the
left sign bit.  This choice is an evidence-based reconstruction.  The User
Handbook calls `CYR` a right cycle.  The Volume 2 technical manual states that
the Exchange Element cycles or shifts E into M.  The two independent original
code paths constrain the remaining ambiguity: `TRACK` requires movement across
quarter boundaries and eventual zero, while the square-root routine requires
signed halving.  No consulted sentence explicitly says "arithmetic full-word
right shift."  This inference therefore remains documented as an inference.

After this change, the square-root result remains nonzero.  The traced run does
not enter `BADOV`.  Focused tests preserve the exact square-root input case and
the sign-extending `CYR` behavior.

## Checkpoint 47: `SQ60SEE` Index-Register Transcription Repair

A slow physical pen path next reached an invalid word at `003417`.  The alarm
originated at `SQ60SEE`, address `001020`.  The first inspection misread the
four operands in this routine as the M4 pipe construct `S|α`.  A named loop
target appeared to pass the immediate alarm, but the next run copied one word
over thousands of memory locations.  This overwrite happened during the fourth
pen movement.  It happened before any later button input.

Closer inspection of source PDF page 93 shows `S1α`, not `S|α`, on all four
instructions.  The equality table defines `S1α=34`.  The scope-display job
also uses that dedicated index register throughout `SQ60A`.  In contrast, the
false pipe form used index register `α=1` to index the address of `LPSEEN`.
When `X1` held one, deferred `RSX` read `LPSTATE` instead.  The right half of
that valid unit-55 report word is `040000`.  It became the loop count in `X7`.
The following `STE` and `JPX` instructions then caused the broad overwrite.

The transcription now uses `S1α` on all four instructions.  A local name still
identifies the printed `#-2` loop target.  This name changes no machine
instruction.  It avoids an unrelated ambiguity in relative expression handling.

Before this repair, the tracker followed the first three small physical pen
movements.  `PREDIC` changed from `000000034000` through `777777035600` and
`004000041600` to `005400043600`.  This behavior corrects the earlier statement
that the prediction did not follow the path.  A new run must now prove that the
`S1α` repair removes the overwrite and permits continued tracking.  No drawing
or constraint claim passes until that test succeeds.

## Checkpoint 48: `LMAG5` Return-Arrow Transcription Repair

The first real line record reached the original `LMAG` and `LMDRAW` display
path.  Two `SCNORM` calls at `LMAG5` did not return to their named error exits.
Instead, the generated instructions stored into the numerical difference
between two labels.  This damaged an unrelated low-memory address.

Source PDF page 141 shows a return arrow between each normalized result and its
error exit.  The transcription had a minus sign in both places.  The source now
uses the printed return arrow in these calls:

```
SCNORM|LMSTART+1→1=²² LMSST→LMAG5A
SCNORM|LMEND+1→1=²² LMSEND→LMAG5B
```

After this repair, `SCNORM` writes packed endpoint values to `LMSST` and
`LMSEND`.  A traced test produced `000111000111` and approximately
`000203000204`.  These values follow the physical pen path.  The display path
still emits only the origin point.  Therefore this repair proves correct
control flow and normalization.  It does not yet prove a displayed line.

## Checkpoint 49: Rejected Screen-Scale Inference

The TX-2 User Handbook says that scope coordinates occupy the high ten bits of
each 18-bit half-word.  The normalized endpoint values above occupy lower bits.
This mismatch suggested that the omitted optional factor in the printed
`SCNORM` macro could supply a nine-bit scale.

A temporary experiment supplied a factor of `-9` to both `SCNORM` definitions.
The experiment caused a `QSAL` alarm during original tracker execution.  It
also changed every expansion of this shared macro.  No primary source supports
that specific factor.  The experiment was rejected and removed.  The combined
tape and WASM package were rebuilt from the unmodified macro.

This negative result narrows the fault.  The remaining candidates include an
incorrect arithmetic register alignment, a missing TX-2 arithmetic detail, or
another transcription error near the display path.  No host-language scaling
or geometry was added.

## Checkpoint 50: First Assembly-Created Line on Scope 60

Date: 2026-09-15

The display failure was isolated to the paired `PSEUDO` coordinate transform.
The surviving listing gives both shift counts as `10.`.  That value returns
coordinates eight bit positions below the documented scope format.  A focused
experiment changed both counts to `18.`.  This restores the inverse pair used
by the program and puts each ten-bit scope coordinate in the high ten bits of
its 18-bit half-word, as required by the TX-2 User Handbook.

This change contradicts the readable listing.  It is an evidence-based
reconstruction inference.  It is not a confirmed transcription repair.  The
source marks the inference at both changed instructions.

With this change, the original assembly creates a non-degenerate line.  Its
point records start at `024635` and `024657`.  Its line record starts at
`024701`.  The endpoint links at `024711` and `024713` refer to those point
records.  The assembly builds an 85-word display file at `100000`.  During one
simulated second, it emits 18,556 unit-60 points at 76 distinct positions.
Those positions run from approximately `(584,584)` to `(643,643)` and follow
the 64-step physical light-pen path used by the test.

This is the first accepted drawing result in this reconstruction.  The browser
does not create the line.  The test only supplies a physical light-pen path and
the `DRAW` console button.  The original program creates the point and line
records, rasterizes the line into its display file, and sends the points through
the emulated scope-60 interface.

## Checkpoint 51: Real Line Selection and Two Scan Repairs

Date: 2026-09-15

The first attempt to select the displayed line entered an invalid operation at
address `001016`.  A high-resolution inspection of Part 1 PDF page 24 and the
corresponding display routine shows `hLDE`, not `hLDQ`.  `LDQ` is not a TX-2
operation.  The source now uses the printed `hLDE` instruction.

Selection then reached three point-selection flag expressions in `PSAL`.
Their logical operator was transcribed as exclusive OR.  The high-resolution
listing shows logical AND.  The independent related source in `sk.tx2as` also
uses AND for the same class of mask.  The exclusive-OR form assembled into a
word that executed as `SUB` and corrupted A.  The three expressions now use
the printed AND operator.

After these repairs, the original selection code identifies the real line.
`ATBITS` becomes `000004000001`.  `ATBITS+1` becomes `000201000701`.
Type `000201` is the `LINES` master.  Address `000701` refers to the line record
at `024701`.  This proves original assembly hit testing against an
assembly-created line.  It does not yet prove constraint creation or solving.

## Checkpoint 52: NOA and the Sequence 47 ITE Conflict

Date: 2026-09-15

The line-selection distance calculation required the missing TX-2 `NOA`
operation.  The emulator now normalizes each active configured subword in A.
It records the prior count minus the leading sign bits in the corresponding D
sign quarter.  It clears active overflow and loads E by the documented load
path.  Focused tests cover full-word and independent active-subword behavior.
The original nearest-line calculation completes after this hardware repair.

The next test holds console button `2.9`, which the original `READIT` table maps
to `TRUEUP`.  The external input register at `377621` contains the expected
`000000400000` value.  Sequence 47 sees the change, but its queue initially
receives no `2.9` event.

The cause is a conflict between two primary descriptions of `ITE`.  The August
1963 User Handbook example table describes an intersection between memory and
A whose result enters E.  The March 1961 Volume 2 Technical Manual describes
the actual register transfer: during ITE, zeroes from M transfer into E and
ones do not.  That circuit computes `E AND M`.  The surviving Sketchpad input
sequence independently requires the same behavior.  It complements the old
switch state into E and then applies ITE to the new switch state to compute
`new AND NOT old`.

The emulator's first ITE implementation followed the handbook example and used
A.  An experimental implementation now follows the circuit manual and uses E.
Focused tests describe that experimental behavior.  It makes the `2.9` edge
enter `TRUEUP`, but it changes the state used by the light-pen selection path.
The conflict is not resolved.  Neither behavior is accepted only because one
integration path advances farther.

## Checkpoint 53: Correct Scope-to-Pen Timing Exposes a Selection Regression

Date: 2026-09-15

The emulator previously selected the next sequence before the caller could
deliver a scope output event to the light pen.  This order cannot model the
documented TX-2 behavior.  A visible scope spot could raise the light-pen flag
and transfer control from the display sequence before the next instruction.

The control unit now returns a scope output before it makes the next sequence
choice.  The machine delivers that output to the light pen.  The following
instruction fetch then sees the light-pen flag.  No instruction executes
between the output and this fetch.  The complete CPU test suite passes with
this order.

This repair changes the interrupted display state recorded by the original
light-pen handler.  The handler now records sequence 55 with display positions
`000303` and `000304`.  These positions are consistent with the active scope
display loop.  The previous run recorded position `000261` after the display
sequence had already yielded.

The more accurate timing invalidates the current end-to-end selection result.
The assembly-created line still exists and still emits real scope points.  The
light pen still detects those points and enters the original handler.  However,
the first `PENSEE` record is present at the second word of its array while the
selection scan reads the first word.  It therefore reads zero and does not set
the line bit in `ATBITS`.

The immediate research question is the indexed store in `LPSEES4` and the
following indexed scan in `PSEUDO`.  The source intends `PENSEE-1` plus an index
value of one to address the first `PENSEE` word.  The observed run addresses the
second word.  Candidate causes are TX-2 address indexation, the exact `INX` and
`JPX` update order, or the recorded interrupted program counter.  No source or
emulator change is accepted until a primary description and a focused machine
test identify the cause.

The earlier Checkpoint 51 trace remains useful evidence that the repaired
selection expressions can identify the line.  It is not a current acceptance
result because it used the old scope scheduling order and the A-based ITE
implementation.  Current acceptance requires line selection with the corrected
scope scheduling order and one historically supported ITE behavior.

The current local integration run fails at the explicit assertion that the
original selection code must identify a line before `TRUEUP`.  It does not fail
with a CPU alarm.  All 125 CPU unit tests pass.  This checkpoint intentionally
preserves a narrow, reproducible integration failure instead of hiding it with
host-language selection logic.

## Checkpoint 54: The Missing `hLDE LPα 0` Instruction

Date: 2026-09-15

A new high-resolution inspection of Part 2 PDF page 93 found an omitted
instruction in `LPSEES`.  The printed sequence is:

```
LPSEES→ REX LPα*{60 777777}
         hLDE LPα 0
         hITE {377,,377}
```

The transcription went directly from `REX` to `hITE`.  This omission explains
the apparent conflict between E-based `ITE` and light-pen selection.  `REX`
computes the address of the display instruction that emitted the visible point.
The missing indexed `hLDE` loads that display word into E.  `hITE` then masks E
to obtain the identifying fields stored in `LPTT`.

Without the `hLDE`, the first light-pen entry sometimes retained the sequence
change word in E.  Later entries used unrelated values left in E by setup code.
Those false entries included zero.  The buffer indexes and indexed stores were
working as documented.  The earlier off-by-one diagnosis in Checkpoint 53 is
therefore rejected.

The same E-based `ITE` behavior now fits both independent Sketchpad uses.  The
external-input routine complements the old switch word into E and intersects it
with the new switch word.  The light-pen routine loads the displayed word into E
and intersects it with a field mask.  This is also consistent with the March
1961 circuit description.  The August 1963 handbook example that describes A as
the input remains a primary-source conflict, but the restored instruction means
Sketchpad itself no longer requires two incompatible behaviors.

## Checkpoint 55: The Combined Tape Had Erased the Constraint Masters

Date: 2026-09-15

The first successful `TRUEUP` entry failed inside `BLOCKMAKER`.  The runtime
`HOVS` master at relocated model address `032561` was zero.  This made the
allocator use a zero block size.  It then cleared memory backward through the
list header and stopped with an alarm.  The fault was in the reconstruction
script.  It was not a TX-2 instruction fault.

The `BOO7` job contains the complete constraint-model extension.  Its model
starts at `022000`.  Its length word covers masters from `IPCONS` through
`CNLAST`.  The `ONLW` job contains the base model through `NUMBERS`, but it does
not contain the later constraint masters.  The old combined-tape command moved
the complete `ONLW` range to `032000`.  The merger filled the absent tail with
zero words.  Those zero words overwrote the real `BOO7` constraint masters.

The combined tape now composes the model in three ranges.  `BOO7` supplies the
length word at `032000`.  `ONLW` supplies base masters `032001-032440`.
`BOO7` supplies constraint masters `032441-033165`.  The resulting tape has
12,926 words in 29 blocks and occupies 78,048 bytes.  The runtime `HOVS`
master is no longer zero.

This correction is a tape-linking repair.  It adds no host geometry and no
host constraint logic.  All eight individual provisional tape checksums still
differ from the expected historical checksums.  That separate provenance gap
remains open.

## Checkpoint 56: First Original Constraint and First Solver Motion

Date: 2026-09-15

The March 1961 TX-2 Technical Manual, section 11-7.2, specifies toggle-switch
storage as 24 manual registers of 37 bits each.  The registers occupy three
groups of eight.  The reconstructed Sketchpad source reads the third group at
`377720-377727`.  The emulator previously returned its unknown-V-memory
sentinel for these addresses.  It now models the full bank as read-only program
memory whose 36 data bits and metabit are set by the emulated operator.

Two physical console switches are necessary for this interaction.  Sketchpad
names `377720` bit `4.9` `DRAWASFIX`.  It returns the main program to the
display cycle after `READIT`.  Sketchpad names `377725` bit `4.9` `SHOWBLKS`.
The source comment calls it `SHOW NON DRAW JUNK`.  With this display switch
off, the line can be selected once, but `ATBITS` clears before the queued
`TRUEUP` command arrives.  With this switch on, the light pen refreshes the
selection until the original command routine starts.  A diagnostic run first
reproduced the old sentinel pattern.  Register isolation then reduced the
required state to these two named bits.  The final test does not depend on the
sentinel.

The test draws a line with the physical light pen.  The original `PSEUDO`
routine selects it.  The test then holds external-input button `2.9`, which the
original `READIT` table sends to the routine at `005420`.  That routine calls
the original `MAKA`, `BLOCKMAKER`, and `PUT` code.  The list high-water mark
moves from `001275` to `001313`, a block size of octal `16`.  The new object at
`025275` has master pointer `000561`, the relocated `HOVS` master.  No host code
creates this object.

The test next sets the metabit of physical toggle register `377720`.  The main
assembly loop executes `hJPQ RELAX` through vector `200060`.  One original
solver pass changes the selected endpoint coordinate from `000012254000` to
`000012254100`.  The corresponding HOV residual falls from `000026114000` to
`000026113700`.  The other coordinate is unchanged.  This is the first
verified geometry change made by the recovered Sketchpad constraint solver.

The regression test now requires all of these facts:

- original line selection sets the line bit in `ATBITS`;
- `TRUEUP` allocates exactly one octal-`16` block;
- the new block points to the `HOVS` master at `000561`;
- the hardware `FIX` toggle causes execution through `RELAX`;
- assembly execution changes an endpoint; and
- the selected HOV coordinate residual decreases.

The browser and test supply only console-switch and light-pen state.  Rust
models the documented toggle hardware.  Rust and JavaScript do not create the
constraint, choose a point, change a coordinate, or solve the constraint.

## Checkpoint 57: `FIX` Must Stay Off During Tape Boot

Date: 2026-09-15

A deployment-condition test set the metabit of toggle register `377720` before
`CODABO`.  This is the physical switch that Sketchpad names `FIX`.  The
original main loop entered `RELAX` before the model was ready.  Sequence 76 then
raised an unmasked `OCSAL` after it fetched invalid instruction
`000000000040` at address `004147`.

The same run succeeds when `FIX` is clear during boot and set after the HOV
constraint exists.  The desktop interface therefore starts the machine with
`FIX` off.  The operator turns it on after creating a constraint.  This is an
observed assembly behavior.  It is not a browser performance rule or a host
safety condition.

## Checkpoint 58: First Original `FIXIT` and `UNFIX` Operations

Date: 2026-09-15

The recovered `READIT` dispatch table maps external-input button Q3.3 to
`FIXIT` and Q2.7 to `UNFIX`.  A new machine test draws and selects a line with
the same physical input path used by the constraint test.  It then presses
Q3.3 through register `377621`.

The executing assembly enters `FIXIT` at octal address `005277`.  The picture
list high-water word stays at `001275`, so this operation allocates no new
block.  Instead, the original linked-list code changes three words.  It changes
the `FIXEDS` list header at `024100`, the selected line's `VORD` link at
`025267`, and the list link at `025270`.

The test next presses Q2.7.  The assembly enters `UNFIX` at octal address
`005326`.  It restores all three words to their exact earlier values.  The
final comparison finds no remaining change in the inspected picture-list
range.  JavaScript supplies only the two external-register edges.  It does not
modify a list word.

The browser now gives these verified inputs direct keyboard bindings.  `F`
presses Q3.3.  `U` presses Q2.7.  The full external panel names routines from
the recovered dispatch table.  A name on that panel proves only source routing.
The interface marks the smaller set of end-to-end verified workflows
separately.

A probe of Q2.8, `MAKECONS`, while an ordinary line was selected reached the
invalid word `000000000040` at address `004147` and raised `OCSAL`.  The source
expects `MAKECONS` to work from a constraint-template selection.  The current
probe did not provide that state.  This result is an open workflow question.
It is not accepted as evidence of a missing CPU instruction or a working
general-constraint path.

## Checkpoint 59: First Public Desktop Release With Original Constraint Solving

Date: 2026-09-15

Simulator commit `821c417` and reconstruction commit `077ec0a` were pushed
before deployment.  The static release `20260915T221307Z` was installed at
`/opt/acyclic/Scratchpad/releases/` on the Acyclic server.  Caddy validated the
complete configuration before its reload.

The old host `https://scratchpad.acyclic.sh/` redirects to the canonical host
`https://sketchpad.acyclic.sh/`.  Read-only public checks returned HTTP 200 for
the final HTML, JavaScript, and WebAssembly files.  The WebAssembly file is
593,792 bytes.  Its deployed SHA-256 is
`fea15c9c4b7b383179d12e7203f22dc331aadfe5c8a6d49026a3141de8b62868`.
The deployed HTML contains the physical Sketchpad toggle controls.  The
deployed JavaScript contains `set_toggle_register`, `KeyD`, and `KeyT`.

No graphical browser was opened for this production check.  This avoids the
host failure previously associated with loading an earlier build in Chrome.
The release had already passed Node and WebAssembly interaction tests.  The
public check verified the deployed static artifacts and redirect path only.

After the `FIXIT` and `UNFIX` regression passed, reconstruction commit
`06ea20f` and simulator commit `6b8fc88` were pushed.  Static release
`20260915T222217Z` then replaced the public symlink.  Caddy again validated and
reloaded.  Public checks returned HTTP 200 for the canonical page, versioned
JavaScript, and WebAssembly.  The page contains the advanced command status
guide.  The JavaScript contains the Q3.3 and Q2.7 keyboard routes.  The WASM
file remains 593,792 bytes.

## Checkpoint 60: `DESIGNATE` Exposes the Next Input-Timing Boundary

Date: 2026-09-15

The next experiment started the historical circle workflow.  The recovered
dispatch table maps Q1.7 to `DESIGNATE`.  The source uses a designated point as
`CCENT`.  A later `STARTDRAW` call then takes the circle branch instead of the
line branch.

The first probe held the light pen over the middle of the assembly-created
line.  The original selection code identified the line.  Q1.7 entered
`DESIGNATE` at `005555`.  `DESIGNATE` called the original `MACAP` path to make
a point on the line.  The probe kept the light pen over refreshed scope ink
while it waited for the command to return.  Repeated light-pen events filled
the sequence-47 input queue.  Its indexed store eventually wrote the event word
`000000000040` over program address `007643`.  Execution later reached that
address and raised `OCSAL`.

The combined tape contains the valid word `001101024072` at `007643`.  A trace
proved that sequence 47 changed it while it executed the queue store following
`LDE 011406` at address `004115`.  The invalid word was not present in the
tape.  This failure is therefore an overlong test gesture.  It is not evidence
for a source repair or a missing CPU operation.

A second probe aimed at the line endpoint.  The original selection code then
identified a point, `000275001237`.  Q1.7 again entered `DESIGNATE`.  Moving
the physical pen away after entry prevented the queue overwrite.  The picture
list did not change, and no alarm occurred.  However, sequence 76 did not reach
the self-modified `DESIGNATEND` return at `005574`, did not set the
`DESIGNATED` metabit in `PAGE1`, and did not set `CCENT` during 200 simulated
seconds.  Scope sequence 60 continued to run.

No emulator or assembly change follows from this result.  The next experiment
must resolve the exact light-pen and pushbutton release timing expected by
`DESIGNATE`.  It must also inspect the sequence-76 run flag and the sequence-47
queue at the point where Q1.7 transfers control.  Circle creation remains
unverified.

## Checkpoint 61: Browser Scope Clock and Light-Pen Acquisition Repair

Date: 2026-09-15

A desktop operator could create lines, but the light pen appeared to work only
in a very small area.  The assembly-drawn tracker also followed the pointer
with a large delay.  Inspection found a browser timing error.  The emulator
could execute and test the light pen up to 25 milliseconds ahead of the scope
image that the browser showed.  The operator therefore aimed at old phosphor
while the emulated photocell tested newer unit-60 points.

The browser now uses one scope-clock function for both execution and display.
It no longer adds the 25-millisecond lead.  This change does not alter the TX-2
clock, unit 55, unit 60, or Sketchpad assembly.  A focused test requires the
execution target and display time to be identical.

The same inspection found two presentation defects.  A maximum coordinate
mapped to canvas coordinate `width` or `height`, which is outside the last
valid pixel and clipped half of an edge spot.  All four hardware origin modes
now map both coordinate extremes to valid pixels.  A CSS graticule also drew a
vertical and horizontal line through the exact center.  That decoration matched
the reported center seam.  It was not unit-60 output, so it was removed.

The primary source is `sources/TX-2_UsersHandbook_Nov63.pdf`, PDF pages 111 and
112, unit 60, "OSCILLOSCOPE DISPLAY."  It specifies a 7-by-7-inch,
point-addressed display with 10-bit signed one's-complement coordinates.  It
states that each point must be specified separately and that the display must
repeat points for continuous viewing.  It specifies center, bottom-center,
left-center, and lower-left origin modes.  It explains that moved origins use
automatic sign-bit complementation.  It does not show a fixed center
graticule.

The preceding handbook page for unit 55 states that the light pen responds
only during scope-60 intensification.  It also describes a manual sensitivity
dial.  The proper setting depended on scope intensity and was set by trial and
error.  The browser now exposes the modeled pickup radius instead of hiding a
fixed value.  The default radius is 40 of 1022 physical scope units.  This is a
model parameter.  It is not claimed as a recovered historical dial setting.

Two read-only operator diagnostics were added.  The light-pen readout combines
unit-55 detection count with Sketchpad's original `LPLOST` metabit.  The
selection readout decodes object-type bits from the original `ATBITS` word at
`200044`.  Neither readout writes emulator or program state.  They make the
real acquisition sequence visible: touch active scope ink, wait for tracking,
wait for `LINE` selection, and then press the physical command input.

The display mapping test passes.  The full WebAssembly regression still draws
and selects an assembly-created line.  It enters `TRUEUP`, creates an HOV
constraint, enters `RELAX`, changes an endpoint, and reduces the residual.  A
second regression still enters `FIXIT`, links the selected line into `FIXEDS`,
enters `UNFIX`, and restores every changed list word.  No Rust CPU or assembly
source changed in this checkpoint.

Simulator commits `811187c`, `f8de9e4`, and `ec05e12` were pushed.  The first deployment
check caught a missing `scope-model.js` file in the release archive before
handoff.  The deployment script was repaired and pushed.  Static release
`20260915T232812Z` then became current.  Caddy validated before reload.  Public
checks returned HTTP 200 for the new scope-clock module and the 593,792-byte
WebAssembly file.  The former `scratchpad.acyclic.sh` name still redirects to
the canonical `sketchpad.acyclic.sh` host.  No graphical browser was opened.

## Checkpoint 62: First Successful `DESIGNATE` Requires an Explicit Initial Sentinel

Date: 2026-09-15

The first complete Q1.7 probe entered the original `DESIGNATE` routine.  It
then passed object zero to `DELETE`.  `DELETE` treated zero as a list object and
damaged the dead-object ring.  This was not an emulator alarm or a browser
gesture defect.

The printed listing gives the relevant sequence.  `STARTS` clears
`DESIGNATED` and `CCENT`.  `DESIGNATE` exchanges the old `CCENT` value into
alpha.  It calls `DELETE` unless bit 1.1 of `DESTS` is one.  The printed
`DELETE` routine has no object-zero guard.  `DESTS` is automatic storage.  The
surviving pages do not show an initializer for it.  The relevant evidence is
in Part 1 PDF pages 8, 23, 35, and 49-50.

The reconstruction now has a separate file named
`2xmx-runtime-init.tx2as`.  It writes one to the current reconstructed `DESTS`
address, `011413`.  The combined tape loads this one-word file last.  The
scanned source stays unchanged.  The emulator contains no Sketchpad-specific
list repair.

This is an inferred runtime completion.  It is not a verified transcription.
The printed automatic-symbol table gives `DESTS` as `011444`.  The current
reconstruction gives `011413` because automatic and RC allocation is still not
bit-for-bit identical to the historical assembler.  The initialization tape
must follow that address if later allocator work changes it.

With the sentinel present, `DESIGNATE` returns through its original path.  It
sets `CCENT` and the `DESIGNATED` metabit.  It does not damage the `DEADS`
header.

## Checkpoint 63: An Omitted Interior Macro Parameter Had Removed the Circle Radius

Date: 2026-09-15

The historical circle code calls this macro form:

```text
NORMALIZE|CMRAD/SCSZ×BSFAC=CMRAD→CMDAL
```

The definition has six parameters:

```text
NORMALIZE|P→C/S×F=R→Q
```

The call omits `C`.  The earlier cross-assembler could omit a leading
parameter.  It could not preserve an omitted parameter in the middle of this
terminator sequence.  It bound `CMRAD/SCSZ×BSFAC` to `P`.  The expanded code
then loaded zero and removed the circle radius.

The macro parser now records an empty parameter slot when a later terminator
matches.  It binds `P=CMRAD`, leaves `C` empty, and binds the later parameters
to `SCSZ`, `BSFAC`, `CMRAD`, and `CMDAL`.  A focused regression uses the exact
terminator pattern.  All 330 assembler library tests and all assembler tool
tests pass.

This change repairs M4 source semantics in the cross-assembler.  It does not
add circle logic to the emulator.

## Checkpoint 64: One's-Complement Negative Zero Restores Real Circle Points

Date: 2026-09-15

The repaired radius let the circle generator run.  Unit 60 still emitted only
the center spot.  A trace reached the circle coordinate mask:

```text
{-0,400,,-0,400}
```

The earlier evaluator implemented unary minus through a host signed integer.
That conversion collapsed one's-complement negative zero into positive zero.
The assembler emitted mask `000400000400`.  It removed nine of ten coordinate
bits from each axis.

In one's-complement arithmetic, negation is bitwise complement.  The evaluator
now applies that operation directly.  The same source emits
`777400777400`.  A regression assembles the complete comma expression and
checks this exact word.

The circle interaction test now performs the following operations through the
real input and assembly paths:

- Q1.7 enters `DESIGNATE`.
- Q1.8 enters `STARTDRAW` and then `STARTC`.
- The assembly allocates 77 changed picture words.
- The display builder changes 179 display-file words.
- `STOPMOVEP` completes the moving endpoint.
- Unit 60 emits 44 new unique visible points.

The visible result is an arc for this gesture.  It is not a complete circle.
A least-squares circular-locus test fits those points with radius 108.61 scope
units.  The maximum radial error is 0.73 scope units.  The root-mean-square
error is 0.34 scope units.  This bound includes the display coordinate
quantization.

No browser or Rust geometry creates these points.  The reconstructed assembly
builds the circle records and the unit-60 display file.

## Checkpoint 65: The Physical Pen State Leaves the Browser Render Loop

Date: 2026-09-15

The previous browser executed up to 2.5 milliseconds of WASM CPU work inside
one animation-frame callback.  Pointer events had to wait behind that work and
the phosphor renderer.  The light-pen position also changed only while the
mouse button stayed down.  This architecture caused avoidable lag.

The browser now uses this input model:

- Pointer motion over the scope always updates the physical pen position.
- One click engages the light-pen sensor.
- Mouse-button release does not remove the pen.
- Escape disengages the sensor.
- The original unit-55 detection path decides whether an intensified unit-60
  point reaches the photocell.
- The original assembly performs tracking, selection, and geometry work.

The WebAssembly machine now runs in a dedicated worker.  The main thread no
longer executes TX-2 instruction batches.  Production response headers enable
cross-origin isolation.  The two threads then share a small atomic pen record.
The input handler uses a cached scope rectangle, coordinate arithmetic, and
atomic stores.  The worker reads the record before and between 16-tick batches.
One worker task has a 0.25-millisecond work budget.  Display backpressure stops
new machine output at 2,048 queued scope points instead of allowing an
unbounded browser queue.

The page reports two measurements.  `INPUT HANDLER` is the time from entry to
the browser handler through publication of the physical state.  `PEN APPLY` is
the measured time from that publication to the worker's call into the emulated
hardware.  These values do not include mouse polling before the browser event.
They also do not claim that the visible assembly tracking crosshair moves in
the same interval.  That crosshair remains subject to authentic program and
scope timing.

A local Node/WASM timing probe measured a 16-tick batch over 1,000 samples.
The median was 0.015 milliseconds.  The 95th percentile was 0.028
milliseconds.  The 99th percentile was 0.063 milliseconds.  One maximum
sample was 0.530 milliseconds.  This is a batch-cost measurement.  It is not a
browser input guarantee.  The live page exposes the relevant browser values
instead of making such a guarantee.

The worker fast-forwards tape loading and machine startup until the first
unit-60 point.  It then locks machine execution to the point-beam clock.  This
preserves the earlier fast startup without putting CPU work back on the main
thread.  A Node worker integration test reached 173.42 simulated seconds and
received 50 real scope points in less than one wall-clock second.  It then
changed the shared pen record while the machine ran.  The worker applied that
sample in 0.027 milliseconds.  This proves the transport and worker wiring in
the test environment.  It is still not a guarantee for all browsers or mice.

The same work found one important command condition.  `FIXIT` exits if the
`LPLOST` metabit is set.  A line-type value can remain in `ATBITS` after the
pen is lost.  A valid test must see a current line selection and clear
`LPLOST` at the same instant.  With that condition, Q3.3 changes the original
`FIXEDS` links and Q2.7 restores every word.

## Checkpoint 66: First Public Worker Build With Assembly-Generated Circle Geometry

Date: 2026-09-15

Reconstruction commit `f2cb278` and simulator commit `8a25961` were pushed
before deployment.  Static release `20260916T005534Z` became the current
production release.  Caddy validated the complete configuration before reload.

The final pre-deployment run passed these checks:

- all 330 assembler library tests and all assembler tool tests;
- all six `sketchpad-web` Rust tests;
- scope coordinate and display-clock tests;
- atomic pen transport and machine-worker integration tests;
- real assembly line creation;
- real `DESIGNATE`, `STARTC`, and circle-arc display output;
- real line selection, `TRUEUP`, constraint allocation, and `RELAX` movement;
- real `FIXIT` and `UNFIX` list changes.

Static HTTPS checks returned HTTP 200 for the page, worker, JavaScript, and
WebAssembly.  The old `scratchpad.acyclic.sh` name returned HTTP 301 to
`sketchpad.acyclic.sh`.  The page, worker, and WASM responses include
`Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: require-corp`, and
`Cross-Origin-Resource-Policy: same-origin`.  These headers enable the atomic
shared pen record in a compatible browser.

The deployed WASM is 593,936 bytes.  Its SHA-256 is
`71a51f3c4fb4afd6a00477e78281c0099af3125ec79fc504c0ada5abd0e56134`.
Static source checks confirm the versioned worker, shared buffer, raw pointer
updates, Escape release, 0.25-millisecond worker budget, 16-tick batch, and
direct `set_light_pen` call.  No graphical browser was opened on the host.

## Checkpoint 67: Raw Scope Coordinates Remove False Axis Bars

Date: 2026-09-15

A desktop report identified three related symptoms.  Drawn geometry developed
horizontal and vertical discontinuities.  A moving endpoint could appear to
flip into a pathological shape.  Releasing the `D` shortcut did not always
finish the line.

The first two symptoms came from the modeled unit-60 origin circuit.  The
emulator decoded each ten-bit one's-complement coordinate into a host signed
integer before it applied the selected scope origin.  This destroyed the
difference between positive zero and negative zero.  The browser and light pen
then treated a moved origin as a multiplication by two.  Negative coordinates
collapsed against the left or lower scope edge.

The November 1963 TX-2 Users Handbook, unit 60, states that moved origin modes
automatically complement the applicable coordinate sign bit.  The output event
now preserves both raw ten-bit coordinates.  The hardware model applies that
sign-bit operation before it maps the illuminated point to the physical
1023-position scope axis.  The renderer and unit 55 consume the same physical
coordinate.  Focused tests cover both zero encodings, both physical extremes,
all four origin modes, and a real assembly tracker path that crosses both scope
axes.

The `D` symptom had a separate cause.  Original sequence 47 records new button
presses with `new AND NOT old`.  It does not queue button releases.  The earlier
guide therefore described behavior that the original program cannot perform.
Cases that appeared to finish on `D` release had also lost the light pen.  The
original `47LOSTPEN` path then inserted Q1.6 and called `STOPMOVEP`.

The browser keyboard bridge now maps a `D` press to Q1.8 `STARTDRAW`.  It maps
the release to the real Q1.6 `STOPMOVEP` button.  Q1.6 stays held until the next
`D` press.  This gives sequence 47 enough time to observe the physical input.
The original assembly still finishes the moving object.  A new integration
test keeps the light pen active and proves that Q1.6 enters `STOPMOVEP` and
completes the line without the lost-pen fallback.

The external-input surface now tracks independent owners for pointer and
keyboard holds.  Releasing one source no longer clears a button that another
source still holds.  Window blur releases every source and disengages the
physical pen.  The default modeled pickup radius changed from 40 to 12 of 1022
scope units.  This reduces the maximum tracker-to-pointer offset.  The operator
can still raise the radius for difficult acquisition.  The exact historical
sensitivity setting remains unknown.

Validation result:

- 128 CPU tests and 6 Sketchpad Web Rust tests pass.
- Scope mapping, input ownership, atomic pen transport, and worker tests pass.
- A real assembly path tracks across both physical axes without losing unit 55.
- A real Q1.6 edge completes `STOPMOVEP` while `LPLOST` remains clear.
- Line, circle, `TRUEUP`, `RELAX`, `FIXIT`, and `UNFIX` regressions pass.

No host code creates geometry, selects an object, or changes a constraint.

Simulator commits `9062a00` and `b3201f8` contain this repair.  Both commits
were pushed before the final deployment.  The first deployment attempt,
release `20260916T024136Z`, exposed a packaging fault.  The explicit release
manifest did not include the new `external-input.js` module.  Static checking
returned HTTP 404 for that module, and a browser stayed at `INITIALIZING`.
Commit `b3201f8` adds the module to the release manifest.

Release `20260916T024326Z` is the corrected production release.  Caddy
validated the complete configuration before reload.  The new module, page,
worker, and WebAssembly return HTTP 200 with the required cross-origin
headers.  A fresh production browser reached `RUNNING`, generated more than
400,000 original scope points, used the 12-unit pickup radius, and acquired
the original assembly tracker as `TRACKING`.  A live `D` key cycle left Q1.8
released and Q1.6 held while the machine remained `RUNNING` and the pen
remained `TRACKING`.  The failed release remains an immutable record, but the
current symlink points only to the corrected release.

## Checkpoint 68: Fast Pen Loss and the Perpendicular Tracker Stroke

Date: 2026-09-15

A desktop report identified two remaining effects.  A rapid mouse movement
changed the browser readout from `TRACKING` to `SEEKING`.  A moving line could
also appear briefly as a short horizontal or vertical stroke.

The light pen is not a coordinate device.  Unit 55 reports that its photocell
saw a unit-60 flash.  The assembly learns the position from the scope word that
caused the interrupt.  The original `TRACK` routine scans a small pattern
around its predicted position.  A pen movement beyond that pattern can produce
no interrupt.  `TRLOST` then sets `LPLOST`, and sequence 47 can enter the
original `47LOSTPEN` path.

Three new real-assembly traces separate this behavior from a coordinate or
line-rasterization failure:

- A 160-step horizontal path produced a unit-55 detection at every step.
  Q1.6 completed `STOPMOVEP` while `LPLOST` stayed clear.  The stable output
  extended 330 scope units horizontally and stayed inside a 31-unit vertical
  band.
- A 160-step vertical path produced a unit-55 detection at every step.
  Q1.6 completed `STOPMOVEP` while `LPLOST` stayed clear.  The stable output
  extended 176 scope units vertically and stayed inside a 31-unit horizontal
  band.
- One instantaneous 160-unit horizontal jump produced no unit-55 detection.
  The assembly set `LPLOST` on that first step and completed the moving object
  through the lost-pen path.

The 31-unit perpendicular band comes from the original tracker search pattern.
On a phosphor display, its current scan can briefly be brighter than an older
line trace.  This can look like a moving line changed into a short
perpendicular line.  The slow-path traces do not show a changed stored line or
a wrong stable line locus.  This evidence does not rule out a separate visual
fault in a gesture that the current traces do not reproduce.

The browser had added a misleading state.  It displayed `SEEKING` when either
`LPLOST` was set or no recent detection arrived within a browser-defined 400
milliseconds.  That state did not exist in the assembly.  Simulator commit
`4c7fb86` removes it.  The display now reports `UP`, `TRACKING`, or `LOST`
directly from sensor engagement and the original `LPLOST` bit.

The same commit sends a worker wake message after every shared pen update.
The worker still reads the atomic physical state and calls the emulated unit-55
setter.  A worker test applied the new state in 0.041 milliseconds.  Chrome now
uses `pointerrawupdate` without also processing its duplicate `pointermove`
stream.  No host code supplies coordinates to Sketchpad, edits `PREDIC`,
creates geometry, or suppresses the original tracker pattern.

Simulator commit `4c7fb86` was pushed before deployment.  Release
`20260916T025940Z` became the current production release after Caddy validation.
A fresh production browser reached `RUNNING`, generated 99,995 original scope
points, and acquired the pen as `TRACKING`.  That live input reported 0.030
milliseconds in the browser handler and 0.050 milliseconds to the worker
hardware setter.  A clean reload again reached `RUNNING` with the pen `UP`.
