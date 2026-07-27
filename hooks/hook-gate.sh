#!/bin/bash
# hook-gate.sh — 2-stage pre-filter for oh-my-harness hooks.
#
# Stage 1 (this script): Ultra-cheap bash grep to check if the feature
#   flag is enabled in harness.config.json.  Avoids spawning a Node.js
#   process (~40-80ms V8 startup) when the feature is disabled.
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
PROJECT_CONFIG="$ROOT/.claude/.omh/harness.config.json"
USER_HOME="${HOME:-${USERPROFILE:-}}"
USER_CONFIG="${USER_HOME:+$USER_HOME/.claude/.omh/harness.config.json}"

# Global kill-switch
if [ "${DISABLE_HARNESS:-}" = "1" ]; then
  echo '{"continue":true,"suppressOutput":true}'
  exit 0
fi

# Project configuration has precedence. Fall back to the user-scoped
# installation only when the project has no configuration of its own.
if [ -f "$PROJECT_CONFIG" ]; then
  CONFIG="$PROJECT_CONFIG"
elif [ -n "$USER_CONFIG" ] && [ -f "$USER_CONFIG" ]; then
  CONFIG="$USER_CONFIG"
else
  echo '{"continue":true,"suppressOutput":true}'
  exit 0
fi

# Check each feature key — pass if ANY is enabled
for FEATURE in "$@"; do
  if grep -q "\"$FEATURE\"[[:space:]]*:[[:space:]]*true" "$CONFIG" 2>/dev/null; then
    exec node "$HOOK"
  fi
done

# All features disabled → silent
echo '{"continue":true,"suppressOutput":true}'
