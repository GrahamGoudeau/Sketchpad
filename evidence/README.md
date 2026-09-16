# Machine-Readable Historical Oracles

These files transcribe small facts from the primary listing scans.
They do not replace the scans.

Each row identifies its source PDF page and printed document page.
Use the exact source hashes in `sources/SHA256SUMS` when you verify a row.

`gx7a-automatic-symbols.tsv` records every automatic storage address in the
printed `GX7A` symbol table.  The order of its rows is address order.

`2xmx-program-symbols.tsv` records selected program tags from the printed
`2XMX` symbol table.  These tags span the repaired two-word offset.  The order
of its rows is address order.

`2xmx-automatic-symbols.tsv` records every marked automatic storage address in
the printed `2XMX` symbol table.  The order of its rows is address order.  The
table and the surviving equality sheet disagree about `COPYNUM`.  Keep that
version difference visible during comparison.

## Operator visual records

`visual/sketchpad-visual-2026-09-16T14-22-45.569Z.webm` is the first retained
operator recording from the browser diagnostic recorder.  It has 486 decoded
VP9 frames at 1024 by 1024 pixels.  Its SHA-256 is
`436d7d809e37e78941cf58223b6821ec90b25db9b5e5227824e7ad74d5ced654`.

The cyan crosshair and bottom text are recording-only input evidence.  All
other light comes from unit-60 output from the running Sketchpad assembly.
