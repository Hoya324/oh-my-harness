#!/usr/bin/env node
/**
 * OMH HUD — Status line for oh-my-harness
 *
 * Reads stdin JSON from Claude Code statusline interface,
 * parses transcript for session data, and renders a formatted status line.
 *
 * Based on oh-my-claudecode HUD by Yeachan Heo.
 * Adapted for oh-my-harness with different branding and colors.
 */

import { readFileSync, existsSync, statSync, openSync, readSync, closeSync, writeFileSync, mkdirSync } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { join, dirname } from 'path';

// ============================================================================
// ANSI Colors — OMH uses cyan/green theme (vs OMC's purple)
// ============================================================================
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const BRIGHT_CYAN = '\x1b[96m';

// OMH brand color (cyan instead of OMC's magenta)
const BRAND = CYAN;
const BRAND_BOLD = `${BOLD}${CYAN}`;

// ============================================================================
// Cost Constants (per 1M tokens, Claude Sonnet 4 pricing)
// ============================================================================
const COST_PER_1M_INPUT = 3.00;
const COST_PER_1M_OUTPUT = 15.00;
const COST_PER_1M_CACHE_READ = 0.30;
const COST_PER_1M_CACHE_WRITE = 3.75;

// ============================================================================
// Stdin Parser
// ============================================================================

async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = chunks.join('');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getContextPercent(stdin) {
  const nativePercent = stdin?.context_window?.used_percentage;
  if (typeof nativePercent === 'number' && !Number.isNaN(nativePercent)) {
    return Math.min(100, Math.max(0, Math.round(nativePercent)));
  }
  const size = stdin?.context_window?.context_window_size;
  if (!size || size <= 0) return 0;
  const usage = stdin?.context_window?.current_usage;
  const total = (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0);
  return Math.min(100, Math.round((total / size) * 100));
}

function getModelName(stdin) {
  return stdin?.model?.display_name ?? stdin?.model?.id ?? 'Unknown';
}

// ============================================================================
// Transcript Parser
// ============================================================================

const MAX_TAIL_BYTES = 512 * 1024;
const MAX_AGENT_MAP_SIZE = 100;
const THINKING_RECENCY_MS = 30_000;

async function parseTranscript(transcriptPath) {
  const result = {
    agents: [],
    sessionStart: null,
    thinkingState: null,
    lastRequestTokenUsage: null,
    sessionTotalInputTokens: 0,
    sessionTotalOutputTokens: 0,
    sessionCacheReadTokens: 0,
    sessionCacheWriteTokens: 0,
    seenUsage: false,
    toolCallCount: 0,
    agentCallCount: 0,
  };

  if (!transcriptPath || !existsSync(transcriptPath)) return result;

  const agentMap = new Map();
  const backgroundAgentMap = new Map();

  try {
    const stat = statSync(transcriptPath);
    const fileSize = stat.size;

    const lines = fileSize > MAX_TAIL_BYTES
      ? readTailLines(transcriptPath, fileSize, MAX_TAIL_BYTES)
      : readFileSync(transcriptPath, 'utf8').split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        processEntry(entry, agentMap, result, backgroundAgentMap);
      } catch { /* skip malformed */ }
    }
  } catch { /* return partial */ }

  // Filter stale agents (>30min)
  const now = Date.now();
  for (const agent of agentMap.values()) {
    if (agent.status === 'running' && now - agent.startTime.getTime() > 30 * 60 * 1000) {
      agent.status = 'completed';
    }
  }

  // Check thinking recency
  if (result.thinkingState?.lastSeen) {
    result.thinkingState.active = (now - result.thinkingState.lastSeen.getTime()) <= THINKING_RECENCY_MS;
  }

  const running = Array.from(agentMap.values()).filter(a => a.status === 'running');
  result.agents = running;

  return result;
}

function readTailLines(filePath, fileSize, maxBytes) {
  const startOffset = Math.max(0, fileSize - maxBytes);
  const bytesToRead = fileSize - startOffset;
  const fd = openSync(filePath, 'r');
  const buffer = Buffer.alloc(bytesToRead);
  try {
    readSync(fd, buffer, 0, bytesToRead, startOffset);
  } finally {
    closeSync(fd);
  }
  const lines = buffer.toString('utf8').split('\n');
  if (startOffset > 0 && lines.length > 0) lines.shift();
  return lines;
}

function extractUsage(usage) {
  if (!usage) return null;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return { input, output, cacheRead, cacheWrite };
}

function processEntry(entry, agentMap, result, backgroundAgentMap) {
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();

  // Token usage
  const usage = extractUsage(entry.message?.usage);
  if (usage) {
    result.lastRequestTokenUsage = usage;
    result.sessionTotalInputTokens += usage.input;
    result.sessionTotalOutputTokens += usage.output;
    result.sessionCacheReadTokens += usage.cacheRead;
    result.sessionCacheWriteTokens += usage.cacheWrite;
    result.seenUsage = true;
  }

  // Session start
  if (!result.sessionStart && entry.timestamp) {
    result.sessionStart = timestamp;
  }

  const content = entry.message?.content;
  if (!content || !Array.isArray(content)) return;

  for (const block of content) {
    // Thinking detection
    if (block.type === 'thinking' || block.type === 'reasoning') {
      result.thinkingState = { active: true, lastSeen: timestamp };
    }

    // Agent tracking
    if (block.type === 'tool_use' && block.id && block.name) {
      result.toolCallCount++;
      if (block.name === 'Task' || block.name === 'proxy_Task' || block.name === 'Agent') {
        result.agentCallCount++;
        const input = block.input || {};
        if (agentMap.size >= MAX_AGENT_MAP_SIZE) {
          // evict oldest completed
          let oldestId = null, oldestTime = Infinity;
          for (const [id, a] of agentMap) {
            if (a.status === 'completed' && a.startTime.getTime() < oldestTime) {
              oldestTime = a.startTime.getTime();
              oldestId = id;
            }
          }
          if (oldestId) agentMap.delete(oldestId);
        }
        agentMap.set(block.id, {
          id: block.id,
          type: input.subagent_type ?? 'unknown',
          model: input.model,
          description: input.description,
          status: 'running',
          startTime: timestamp,
        });
      }
    }

    // Agent completion
    if (block.type === 'tool_result' && block.tool_use_id) {
      const agent = agentMap.get(block.tool_use_id);
      if (agent) {
        const blockContent = block.content;
        const isBackground = typeof blockContent === 'string'
          ? blockContent.includes('Async agent launched')
          : Array.isArray(blockContent) && blockContent.some(c => c.text?.includes('Async agent launched'));
        if (!isBackground) {
          agent.status = 'completed';
          agent.endTime = timestamp;
        }
      }
    }
  }
}

// ============================================================================
// HUD State (persisted session start time)
// ============================================================================

function getStatePath() {
  const root = process.env.PROJECT_PATH || process.cwd();
  return join(root, '.claude', '.omh', 'hud-state.json');
}

function readHudState() {
  try {
    return JSON.parse(readFileSync(getStatePath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeHudState(state) {
  try {
    const p = getStatePath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(state));
  } catch { /* best effort */ }
}

// ============================================================================
// Formatters
// ============================================================================

function formatTokenCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(dollars) {
  if (dollars < 0.01) return `~$${dollars.toFixed(4)}`;
  if (dollars < 1) return `~$${dollars.toFixed(3)}`;
  return `~$${dollars.toFixed(2)}`;
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${minutes}m`;
}

function getContextColor(percent) {
  if (percent >= 85) return RED;
  if (percent >= 70) return YELLOW;
  return GREEN;
}

function getSessionColor(minutes) {
  if (minutes >= 60) return RED;
  if (minutes >= 30) return YELLOW;
  return GREEN;
}

// ============================================================================
// Render
// ============================================================================

function render(stdin, transcript) {
  const parts = [];
  const sep = `${DIM} | ${RESET}`;

  // 1. [OMH] label
  parts.push(`${BRAND_BOLD}[OMH]${RESET}`);

  // 2. Thinking indicator
  if (transcript.thinkingState?.active) {
    parts.push(`${CYAN}thinking${RESET}`);
  }

  // 3. Session duration
  const hudState = readHudState();
  let sessionStart = transcript.sessionStart;
  const stdinSessionId = stdin?.transcript_path || 'default';

  if (hudState.sessionId === stdinSessionId && hudState.sessionStartTimestamp) {
    const persisted = new Date(hudState.sessionStartTimestamp);
    if (sessionStart && persisted < sessionStart) {
      sessionStart = persisted;
    } else if (!sessionStart) {
      sessionStart = persisted;
    }
  }

  if (sessionStart) {
    // Persist for next invocation
    if (hudState.sessionId !== stdinSessionId || !hudState.sessionStartTimestamp) {
      writeHudState({
        sessionId: stdinSessionId,
        sessionStartTimestamp: sessionStart.toISOString(),
      });
    }
    const durationMs = Date.now() - sessionStart.getTime();
    const minutes = Math.floor(durationMs / 60_000);
    const color = getSessionColor(minutes);
    parts.push(`session:${color}${formatDuration(durationMs)}${RESET}`);
  }

  // 4. Status dot
  parts.push(`${GREEN}●${RESET}`);

  // 5. Cost estimate
  if (transcript.seenUsage) {
    const inputCost = (transcript.sessionTotalInputTokens / 1_000_000) * COST_PER_1M_INPUT;
    const outputCost = (transcript.sessionTotalOutputTokens / 1_000_000) * COST_PER_1M_OUTPUT;
    const cacheReadCost = (transcript.sessionCacheReadTokens / 1_000_000) * COST_PER_1M_CACHE_READ;
    const cacheWriteCost = (transcript.sessionCacheWriteTokens / 1_000_000) * COST_PER_1M_CACHE_WRITE;
    const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;
    parts.push(formatCost(totalCost));

    // 6. Total tokens
    const totalTokens = transcript.sessionTotalInputTokens + transcript.sessionTotalOutputTokens;
    parts.push(formatTokenCount(totalTokens));

    // 7. Cache hit rate
    const totalInput = transcript.sessionTotalInputTokens + transcript.sessionCacheReadTokens + transcript.sessionCacheWriteTokens;
    if (totalInput > 0) {
      const cachePercent = Math.round((transcript.sessionCacheReadTokens / totalInput) * 100);
      parts.push(`Cache: ${GREEN}${cachePercent}%${RESET}`);
    }

    // 8. Cost per hour
    if (sessionStart) {
      const elapsedHours = (Date.now() - sessionStart.getTime()) / 3_600_000;
      if (elapsedHours > 0.01) {
        const costPerHour = totalCost / elapsedHours;
        parts.push(`$${costPerHour.toFixed(2)}/h`);
      }
    }
  }

  // 9. Context window %
  if (stdin) {
    const ctxPercent = getContextPercent(stdin);
    const ctxColor = getContextColor(ctxPercent);
    let ctxSuffix = '';
    if (ctxPercent >= 90) ctxSuffix = ' CRITICAL';
    else if (ctxPercent >= 75) ctxSuffix = ' COMPRESS?';
    parts.push(`ctx:${ctxColor}${ctxPercent}%${ctxSuffix}${RESET}`);
  }

  // 10. Agent count
  const runningAgents = transcript.agents.length;
  if (runningAgents > 0) {
    parts.push(`agents:${CYAN}${runningAgents}${RESET}`);
  }

  return parts.join(sep);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    const stdin = await readStdin();
    const transcriptPath = stdin?.transcript_path;
    const transcript = await parseTranscript(transcriptPath);
    const output = render(stdin, transcript);
    process.stdout.write(output + '\n');
  } catch {
    // Silent failure — never break the status line
    process.stdout.write(`${BRAND_BOLD}[OMH]${RESET}\n`);
  }
}

main();
