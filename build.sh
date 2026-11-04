#!/bin/sh
# Builds the Rust reader into pkg/ (committed, so "Load unpacked" works without Rust).
set -eu
cd "$(dirname "$0")"
cargo build --manifest-path reader/Cargo.toml --release --target wasm32-unknown-unknown
wasm-bindgen --target no-modules --no-typescript --out-dir pkg \
  reader/target/wasm32-unknown-unknown/release/reader.wasm
