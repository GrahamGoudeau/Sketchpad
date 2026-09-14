#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_dir="$repo_dir/sources"
chm_commit=31425aaad4268b6b225409b1e1b21c5c8076a0a6
base_url="https://raw.githubusercontent.com/computerhistory/Historical-Highlights-Documents-Repository/$chm_commit"

mkdir -p "$source_dir"

curl --fail --location --retry 3 \
  --output "$source_dir/Sketchpad Pt 1 102726903-05-01-acc.pdf" \
  "$base_url/Sketchpad%20Pt%201%20102726903-05-01-acc.pdf"

curl --fail --location --retry 3 \
  --output "$source_dir/Sketchpad Pt 2 102726903-05-02-acc.pdf" \
  "$base_url/Sketchpad%20Pt%202%20102726903-05-02-acc.pdf"

cd "$source_dir"
shasum -a 256 --check SHA256SUMS
