#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENV_DIR="${SKILL_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Python interpreter not found: ${PYTHON_BIN}" >&2
  exit 1
fi

if [[ ! -d "${VENV_DIR}" ]]; then
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

"${VENV_DIR}/bin/python3" -m pip install --upgrade pip
"${VENV_DIR}/bin/python3" -m pip install --upgrade -r "${SCRIPT_DIR}/requirements.txt"

echo "Math tooling environment ready at ${VENV_DIR}"
echo "Use ${VENV_DIR}/bin/python3 to run the helper scripts."
