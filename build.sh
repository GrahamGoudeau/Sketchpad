#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
tool_dir="$repo_dir/.tools"
wasm_pack_version=0.15.0

if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust is required: https://rustup.rs" >&2
  exit 2
fi

if command -v rustup >/dev/null 2>&1; then
  rustup target add wasm32-unknown-unknown >/dev/null
fi

wasm_pack=$(command -v wasm-pack || true)
if [[ -z "$wasm_pack" ]] || [[ $("$wasm_pack" --version) != "wasm-pack $wasm_pack_version" ]]; then
  mkdir -p "$tool_dir"
  CARGO_INSTALL_ROOT="$tool_dir" cargo install wasm-pack --locked --version "$wasm_pack_version"
  wasm_pack="$tool_dir/bin/wasm-pack"
fi

cd "$repo_dir"
cargo build --locked --workspace
./reconstruction/scripts/assemble.sh
cmp reconstruction/build/sketchpad-combined.tape \
  sketchpad-web/rust/assets/sketchpad-combined.tape

cd "$repo_dir/sketchpad-web"
"$wasm_pack" build --target web --out-dir web/pkg --release
