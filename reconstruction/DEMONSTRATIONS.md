# Demonstration Register

This register lists what the surviving films show Sketchpad doing and
what the reconstruction has proven. Its purpose is feature parity with the
recorded demonstrations. Timestamps are in the transfers named in
checkpoint 86 of the [Research Log](RESEARCH_LOG.md). The films are not
in this repository. The film readings below come from contact sheets
sampled every two to five seconds; each row still needs frame-level
verification before it is cited as evidence.

Status values:

- `proven`: an assembly-level regression in `sketchpad-web/tests` drives
  the original code through the operation with modeled hardware inputs
  only.
- `exposed`: the browser exposes the console input the operation needs,
  but no regression has driven the original code through it.
- `not exercised`: neither.

## Lincoln Laboratory film, February 1963

Transfers: YouTube `57wj8diYpgY` (the film) and `5RyU50qbvzQ` (the same
film under Alan Kay's 1986 commentary; timestamps in parentheses).

| Film time | Operation shown | Original path | Status |
| --- | --- | --- | --- |
| 1:27 (0:20) | `INK` label and pen acquisition | `STARTS`, tracker in LYUO | proven |
| 1:33 to 1:48 (0:22 to 0:38) | Six-edge polyline drawn with the pen and the draw button | `STARTDRAW`, `STOPMOVEP`, `MERGER` | proven |
| 1:48 to 1:51 (0:38 to 0:41) | Corners made "mutually perpendicular" in one visible correction | `MAKECONS` with code octal 37, `RELAX`, `PRLCOMP` | proven; timing compared in checkpoint 86 |
| 1:54 to 2:36 (0:46 to 1:30) | Additional lines drawn across the flange and made parallel or perpendicular | same | proven for the P constraint; the exact figure is not reproduced |
| 2:36 to 2:42 (1:30 to 1:36) | Flange detail with repeated short dashes | not identified | not exercised |
| 2:45 to 3:45 (1:38 to 2:36) | A second drawing: circular arc over a crossed box (the rivet) | `DESIGNATE`, `STARTC`, lines | proven for arcs and lines; the complete rivet figure is not reproduced |
| 3:45 to 4:30 (2:38 to 3:20) | Rivet placed on the flange as an instance and moved into position | `SUBPIC`, `MAGI`, the ONLW moving transform, `STOPMOVEP` | proven with a one-line master by `npm run test:instance`; the rivet figure is not reproduced |
| 4:30 to 5:10 (3:20 to 3:58) | Instances resized and repositioned; pen drags instance | `SHAFTINS`, `ΔROT`, `ΔSIZE`, `76MOVI` | proven for rotation and size while moving |
| 5:10 to 6:27 (4:00 to 4:14) | Several small copies of the flange made at reduced scale | instance and copy routines; the scope scale knob is proven by `npm run test:knobs` | not exercised |

## MIT Science Reporter, "Computer Sketchpad", 1964

Transfer: archive.org `sketchpad19632of3` (2D demonstration). Part 1 is
an interview; part 3 shows Timothy Johnson's Sketchpad III, a different
program on the same machine, and is outside this reconstruction.

| Film time | Operation shown | Original path | Status |
| --- | --- | --- | --- |
| 1:05 to 1:50 | `INK`, pen acquisition, first line | `STARTS`, `STARTDRAW` | proven |
| 1:50 to 3:35 | Lines drawn, endpoints dragged with the pen, lines joined at points | `MOVEPOINT`, `MERGER` | proven |
| 3:40 to 4:10 | Circular arc drawn from a designated centre | `DESIGNATE`, `STARTC` | proven |
| 4:15 to 5:05 | A triangle closed and adjusted | lines, `MERGER` | proven for the primitives |
| 5:25 to 6:35 | A rough quadrilateral made into a rectangle by constraints | `MAKECONS`, `RELAX` | proven for the P constraint; the four-sided figure is not reproduced |
| 6:55 to 7:45 | A smaller figure placed inside the rectangle and moved | instances or moving a subpicture | not exercised |
| 7:50 to 8:45 | A figure with a vertical member and a trapezoid, apparently a truss, adjusted | constraints, possibly fixed points (`FIXIT`) | `FIXIT` and `UNFIX` proven; the figure is not reproduced |
| 9:10 to 9:50 | Picture enlarged until lines leave the scope | `SHAFTTEST`, `SCSZ`, `SCCEN` | proven by `npm run test:knobs` |

## Capabilities the films show that need a regression

- Instances of a figure with several parts; the one-line instance is
  proven, and TIE plus the instance-point constraint structure are proven
  under `INSTANCE_ATTACHER=1`, with the image point's coordinates open
  (checkpoint 92).
- Copying a figure.
- Deleting a line through `ERASE` and the unattached points through
  `POINTSOUT` are both proven by `npm run test:delete`.
- Constraint types beyond horizontal-or-vertical and parallel-or-
  perpendicular that the thesis lists and the films may use, for example
  equal length.

Each of these must be driven through the original assembly by the
existing hardware boundaries: the light pen, the external input register,
the toggle registers, and the shaft encoders.
