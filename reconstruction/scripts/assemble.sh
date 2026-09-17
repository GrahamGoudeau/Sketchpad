#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
simulator_dir=${SKETCHPAD_TX2_SIMULATOR_DIR:-"$repo_dir/.."}
assembler="$simulator_dir/target/debug/tx2m4as"
disassembler="$simulator_dir/target/debug/tx2dis"
merger="$simulator_dir/target/debug/tx2mergetape"
output_dir="$repo_dir/build"

if [[ ! -x "$assembler" ]]; then
  echo "Missing assembler: $assembler" >&2
  echo "Build it with: cd $simulator_dir && cargo build --workspace" >&2
  exit 2
fi

if [[ ! -x "$disassembler" ]]; then
  echo "Missing disassembler: $disassembler" >&2
  echo "Build it with: cd $simulator_dir && cargo build --workspace" >&2
  exit 2
fi

if [[ ! -x "$merger" ]]; then
  echo "Missing tape merger: $merger" >&2
  echo "Build it with: cd $simulator_dir && cargo build --workspace" >&2
  exit 2
fi

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/sketchpad-assembly.XXXXXX")
trap 'rm -rf -- "$work_dir"' EXIT

awk -v output_dir="$work_dir" '
  BEGIN {
    unit = "2xmx"
  }
  /pdf_page=59 .*type=symex/ {
    unit = "oplw"
  }
  /pdf_page=80 .*type=symex/ {
    unit = "gx7a"
  }
  /pdf_page=136 .*type=symex/ {
    unit = "boo7"
  }
  {
    print >> (output_dir "/" unit ".tx2as")
  }
' "$repo_dir/sk.tx2as"

awk -v output_dir="$work_dir" '
  BEGIN {
    unit = "boo7"
  }
  /pdf_page=8 .*type=symex/ {
    unit = "onlw"
  }
  /pdf_page=52 .*type=symex/ {
    unit = "apy5"
  }
  /pdf_page=79 .*type=symex/ {
    unit = "lyuo"
  }
  /pdf_page=113 .*type=symex/ {
    unit = "y3ht"
  }
  {
    print >> (output_dir "/" unit ".tx2as")
  }
' "$repo_dir/sk2.tx2as"

mkdir -p "$output_dir"

units=(2xmx oplw gx7a boo7 onlw apy5 lyuo y3ht)
for unit in "${units[@]}"; do
  output="$output_dir/sketchpad-$unit.tape"
  "$assembler" --output "$output" "$work_dir/$unit.tx2as"
  "$disassembler" "$output" >/dev/null
  echo "Built $output"
done

"$assembler" --output "$output_dir/sketchpad-2xmx-runtime-init.tape" \
  "$repo_dir/2xmx-runtime-init.tx2as"
"$disassembler" "$output_dir/sketchpad-2xmx-runtime-init.tape" >/dev/null
echo "Built $output_dir/sketchpad-2xmx-runtime-init.tape"

"$merger" \
  --output "$output_dir/sketchpad-combined.tape" \
  --entry 200140 \
  --allow-overwrite 011413 \
  --allow-overwrite 022000 \
  --relocate-input-range 3:022000:022000:032000 \
  --relocate-input-range 4:022001:022440:032001 \
  --relocate-input-range 3:022441:023165:032441 \
  "$output_dir/sketchpad-2xmx.tape" \
  "$output_dir/sketchpad-gx7a.tape" \
  "$output_dir/sketchpad-boo7.tape" \
  "$output_dir/sketchpad-onlw.tape" \
  "$output_dir/sketchpad-apy5.tape" \
  "$output_dir/sketchpad-lyuo.tape" \
  "$output_dir/sketchpad-y3ht.tape" \
  "$output_dir/sketchpad-2xmx-runtime-init.tape"
"$disassembler" "$output_dir/sketchpad-combined.tape" >/dev/null
echo "Built $output_dir/sketchpad-combined.tape"

(
  cd "$output_dir"
  shasum -a 256 sketchpad-2xmx.tape sketchpad-oplw.tape \
    sketchpad-gx7a.tape sketchpad-boo7.tape sketchpad-onlw.tape \
    sketchpad-apy5.tape sketchpad-lyuo.tape sketchpad-y3ht.tape \
    sketchpad-2xmx-runtime-init.tape sketchpad-combined.tape > SHA256SUMS
  if shasum -a 256 -c "$repo_dir/TAPE_SHA256SUMS"; then
    echo "Generated historical-job tapes match the recorded comparison set"
  else
    echo "Generated historical-job tapes differ from the recorded comparison set" >&2
    echo "This comparison records provenance. It does not reject the build." >&2
  fi
)

echo "Wrote $output_dir/SHA256SUMS"
echo "Validated TX-2 reader leaders, blocks, and checksums"
