# Agent session provenance

This directory preserves the Codex session in which the executable Sketchpad
reconstruction was undertaken. Graham Goudeau started the session by asking
where Ivan Sutherland's source could be read. The session then progressed from
source discovery through transcription repair, assembly, TX-2 emulator work,
browser integration, debugging, and successful interactive drawing.

This is a contemporaneous process record. It is not, by itself, an independent
verification of the reconstruction. The repository's source, tests, evidence,
and reconstruction notes provide the reproducible technical record.

## Contents

- `conversation.md` is the readable transcript of the user and assistant
  messages.
- `conversation.jsonl` is the same transcript in a machine-readable form. Each
  record retains the original message ID and the SHA-256 digest of the original
  text.
- `tool-ledger.jsonl.gz` records every tool call and a digest for every tool
  result. Decompress it with `gzip -cd tool-ledger.jsonl.gz`.
- `session-metadata.json` records the session, model, export boundaries, counts,
  and source-log digests.
- `assets/` contains the three user-supplied images referenced by the
  transcript. Two document mobile-input failures. The final image shows a
  drawing made through the browser interface while the reconstructed assembly
  was running.
- `MANIFEST.sha256` authenticates the committed archive files.

## Scope

The export starts at `2026-09-14T22:44:53.193Z`, Graham's first Sketchpad
request. It ends before `2026-09-16T04:29:31.174Z`, when the same long-running
session moved to unrelated G-language work.

The recorded model is `gpt-5.6-sol` with high reasoning effort. The Codex CLI
version is `0.148.0`. The raw session ID is
`01a0a218-34bd-7b81-9c36-dfff1cd53265`.

## Raw-record integrity

The local raw JSONL file was 913,007,339 bytes when exported. Its SHA-256 digest
was:

`d273a8aad312ead573bd90b7bf0b40c418a58a0f0f9477aec48d7c761b2ac777`

The exact in-scope sequence of raw JSONL records was 877,812,843 bytes. Its
SHA-256 digest was:

`593b1ffce58f2a397f63e272637cfe7305905288dde0dd18f0eaacf9a8541a71`

The raw log is not committed. It contains internal instructions, encrypted
reasoning records, repeated interface telemetry, large binary image payloads,
and unrelated later work. It can also contain material that is unsuitable for a
public repository.

The public export keeps all human-visible user and assistant messages. It keeps
tool-call inputs. It replaces each tool result with the byte length and SHA-256
digest of its canonical JSON value. This preserves ordering and gives each
result an integrity anchor without republishing credentials, scan pixels, or
large binary payloads. Internal system and developer messages, model reasoning,
encrypted reasoning, telemetry events, and duplicate interface events are not
included.

Four records received a public transformation. Three expiring attachment paths
were replaced with stable relative paths under `assets/`; one of those paths
also appeared in a tool call. No credential-shaped string required redaction in
the exported conversation or tool-call inputs.

## Reproduction

If the original local session log is available, regenerate the export from the
repository root with:

```sh
ruby scripts/export_codex_session.rb \
  /path/to/rollout-2026-09-14T18-44-50-01a0a218-34bd-7b81-9c36-dfff1cd53265.jsonl \
  provenance/agent-session-2026-09-14
```

The original temporary file for `assets/browser-drawing-2026-09-16.jpg` was
still available and was copied without modification. Its SHA-256 digest is
`af05e3750e801ba2f492ac5485a79b3c8ac84a7841f30ae4b56f52adbd642318`.
The two earlier temporary files were no longer present. Their surviving JPEG
model-input derivatives were recovered from the raw session log. The manifest
records their digests.
