#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
simulator_dir=${SKETCHPAD_TX2_SIMULATOR_DIR:-"$repo_dir/../TX-2-simulator"}
assembler="$simulator_dir/target/debug/tx2m4as"
disassembler="$simulator_dir/target/debug/tx2dis"
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

mkdir -p "$output_dir"

units=(2xmx oplw gx7a boo7)
for unit in "${units[@]}"; do
  output="$output_dir/sketchpad-$unit.tape"
  "$assembler" --output "$output" "$work_dir/$unit.tx2as"
  "$disassembler" "$output" >/dev/null
  echo "Built $output"
done

(
  cd "$output_dir"
  shasum -a 256 sketchpad-2xmx.tape sketchpad-oplw.tape \
    sketchpad-gx7a.tape sketchpad-boo7.tape > SHA256SUMS
  shasum -a 256 -c "$repo_dir/TAPE_SHA256SUMS"
)

echo "Wrote $output_dir/SHA256SUMS"
echo "Validated TX-2 reader leaders, blocks, and checksums"
echo "Verified expected tape checksums"
