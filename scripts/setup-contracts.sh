#!/usr/bin/env bash
# Restore the Foundry test dependency (forge-std) without git submodules, so the
# repo builds from a clean clone. sourceRef: foundry-rs/forge-std releases.
set -euo pipefail

FORGE_STD_VERSION="v1.16.2"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB_DIR="${ROOT_DIR}/contracts/lib"
TARGET="${LIB_DIR}/forge-std"

if [ -f "${TARGET}/src/Test.sol" ]; then
  echo "[setup-contracts] forge-std already present at ${TARGET}"
  exit 0
fi

mkdir -p "${LIB_DIR}"
TARBALL="$(mktemp)"
echo "[setup-contracts] downloading forge-std ${FORGE_STD_VERSION}"
curl -fsSL "https://github.com/foundry-rs/forge-std/archive/refs/tags/${FORGE_STD_VERSION}.tar.gz" -o "${TARBALL}"
tar -xzf "${TARBALL}" -C "${LIB_DIR}"
rm -f "${TARBALL}"
rm -rf "${TARGET}"
mv "${LIB_DIR}/forge-std-${FORGE_STD_VERSION#v}" "${TARGET}"
echo "[setup-contracts] forge-std installed at ${TARGET}"
