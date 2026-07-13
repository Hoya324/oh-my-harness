#!/usr/bin/env bash
#
# omh-memory.sh — oh-my-harness long-term memory (LTM) launcher.
#
# Runs the knowledge-graph MCP server (@modelcontextprotocol/server-memory) against
# ONE runtime-neutral store so Claude Code AND Codex (and any other MCP client) share
# the same long-term memory graph.
#
# Store resolution (first wins):
#   $OMH_MEMORY_FILE  →  $MEMORY_FILE_PATH  →  ~/.omh/memory/graph.jsonl
#
# Both runtimes point their MCP config at this script, so the store path stays identical
# regardless of where each runtime launches from.
set -euo pipefail

MEMORY_FILE_PATH="${OMH_MEMORY_FILE:-${MEMORY_FILE_PATH:-$HOME/.omh/memory/graph.jsonl}}"
export MEMORY_FILE_PATH
mkdir -p "$(dirname "$MEMORY_FILE_PATH")"

exec npx -y @modelcontextprotocol/server-memory
