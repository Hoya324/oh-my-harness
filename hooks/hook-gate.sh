#!/bin/bash
# hook-gate.sh — 2-stage pre-filter for oh-my-harness hooks.
#
# Stage 1 (this script): Resolve feature flags through the same config loader
#   used by the hooks, including defaults and user-global fallback.
#
# Stage 2: If any listed feature is enabled, `exec node` with stdin
#   still intact for the real hook to consume.
#
# Usage:  bash hook-gate.sh <hook-script> <feature1> [feature2 ...]
#   e.g.  bash hook-gate.sh ./hooks/pre-prompt.mjs autoPlanMode ambiguityDetection

set -euo pipefail

HOOK="${1:-}"
shift

ROOT="${PROJECT_PATH:-.}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FEATURE_GATE="$SCRIPT_DIR/lib/feature-gate.mjs"

# Global kill-switch
if [ "${DISABLE_HARNESS:-}" = "1" ]; then
  echo '{"continue":true,"suppressOutput":true}'
  exit 0
fi

# Status 0 means enabled; only status 10 is a resolved disabled result.
# Missing/corrupt config, helper failures, and unexpected statuses run the real
# hook so safety-sensitive hooks can apply their own fail-closed behavior.
if node "$FEATURE_GATE" "$ROOT" "$@" 2>/dev/null; then
  exec node "$HOOK"
else
  GATE_STATUS=$?
fi

if [ "$GATE_STATUS" -eq 10 ]; then
  echo '{"continue":true,"suppressOutput":true}'
  exit 0
fi

exec node "$HOOK"
