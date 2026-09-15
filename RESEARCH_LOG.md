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

## Current Research State

The canonical historical artifact remains `sk.tx2as`.
It contains four Part 1 assembly jobs in printed-listing order.
The `sk2.tx2as` file contains a continuation and four more assembly jobs.

All four Part 1 fragments now assemble into deterministic tapes.
The complete cross-volume `BOO7` job also assembles into deterministic output.
All eight recovered assembly jobs now have deterministic machine output.
One reproducible command builds all eight tapes.  The checksum gate currently
rejects seven changed tapes and accepts the unaffected `OPLW` control tape.
The `GX7A` RC block now has a printed historical address oracle.
The forward-macro shortfall and its false automatic symbols are resolved.
The next goal is to recover the historical RC allocation schedule and the
automatic-symbol ordering from the printed `GX7A` addresses.
Successful simulator loading follows compatible-set identification.
The browser target will run that simulator through WebAssembly.
The readable C translation will remain a separate explanatory artifact.
