#!/usr/bin/env bash
#
# omh-memory.sh — oh-my-harness long-term memory (LTM) launcher.
#
# Runs the pinned knowledge-graph MCP server against
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

# Prefer a warm npm cache. The first launch on a machine without this exact
# package still requires registry access; subsequent launches use the cache.
exec npx --yes --prefer-offline @modelcontextprotocol/server-memory@2026.7.4
