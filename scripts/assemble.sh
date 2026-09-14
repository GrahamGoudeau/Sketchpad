#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
simulator_dir=${SKETCHPAD_TX2_SIMULATOR_DIR:-"$repo_dir/../TX-2-simulator"}
assembler="$simulator_dir/target/debug/tx2m4as"

if [[ ! -x "$assembler" ]]; then
  echo "Missing assembler: $assembler" >&2
  echo "Build it with: cd $simulator_dir && cargo build --workspace" >&2
  exit 2
fi

exec "$assembler" \
  --list \
  --output "$repo_dir/sk.tape" \
  "$repo_dir/sk.tx2as"

