#!/usr/bin/env node
/**
 * OMH HUD — Status line for oh-my-harness
 *
 * Display format:
 *   [OMH] | 5h:14%(3h51m) | wk:62%(3d5h) | session:29m | ctx:39% | 🔧53 | agents:2 | opus-4-6
 *
 * Data sources:
 *   - 5h/wk rate limits: Anthropic OAuth API (api.anthropic.com/api/oauth/usage)
 *   - session/tools/agents: Transcript parsing
 *   - context window: stdin JSON from Claude Code
 */

import { readFileSync, existsSync, statSync, openSync, readSync, closeSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { userInfo } from 'os';
import https from 'https';

// ============================================================================
// ANSI Colors
// ============================================================================
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BRAND_BOLD = `${BOLD}${CYAN}`;

// ============================================================================
// Constants
// ============================================================================
const USAGE_POLL_INTERVAL_MS = 90_000;
const USAGE_CACHE_TTL_FAILURE_MS = 15_000;
const USAGE_CACHE_TTL_NETWORK_MS = 2 * 60_000;
const API_TIMEOUT_MS = 10_000;
const MAX_TAIL_BYTES = 512 * 1024;
const MAX_AGENT_MAP_SIZE = 100;
const TOOL_ICON = '\u{1F527}'; // 🔧

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

// ============================================================================
// Anthropic Usage API
// ============================================================================

const DEFAULT_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

function getClaudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(process.env.HOME || '', '.claude');
}

function getUsageCachePath() {
  const root = process.env.PROJECT_PATH || process.cwd();
  return join(root, '.claude', '.omh', 'usage-cache.json');
}

function getKeychainServiceName() {
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  if (configDir) {
    const hash = createHash('sha256').update(configDir).digest('hex').slice(0, 8);
    return `Claude Code-credentials-${hash}`;
  }
  return 'Claude Code-credentials';
}

function readKeychainCredential(serviceName, account) {
  try {
    const accountArg = account ? ` -a "${account}"` : '';
    const result = execSync(
      `/usr/bin/security find-generic-password -s "${serviceName}"${accountArg} -w 2>/dev/null`,
      { encoding: 'utf-8', timeout: 2000 }
    ).trim();
    if (!result) return null;
    const parsed = JSON.parse(result);
    const creds = parsed.claudeAiOauth || parsed;
    if (!creds.accessToken) return null;
    return {
      accessToken: creds.accessToken,
      expiresAt: creds.expiresAt,
      refreshToken: creds.refreshToken,
      source: 'keychain',
    };
  } catch {
    return null;
  }
}

function readKeychainCredentials() {
  if (process.platform !== 'darwin') return null;
  const serviceName = getKeychainServiceName();
  const candidates = [];
  try {
    const username = userInfo().username?.trim();
    if (username) candidates.push(username);
  } catch {}
  candidates.push(undefined);

  let expiredFallback = null;
  for (const account of candidates) {
    const creds = readKeychainCredential(serviceName, account);
    if (!creds) continue;
    if (!creds.expiresAt || creds.expiresAt > Date.now()) return creds;
    expiredFallback ??= creds;
  }
  return expiredFallback;
}

function readFileCredentials() {
  try {
    const credPath = join(getClaudeConfigDir(), '.credentials.json');
    if (!existsSync(credPath)) return null;
    const parsed = JSON.parse(readFileSync(credPath, 'utf-8'));
    const creds = parsed.claudeAiOauth || parsed;
    if (!creds.accessToken) return null;
    return {
      accessToken: creds.accessToken,
      expiresAt: creds.expiresAt,
      refreshToken: creds.refreshToken,
      source: 'file',
    };
  } catch {
    return null;
  }
}

function getCredentials() {
  return readKeychainCredentials() || readFileCredentials();
}

function refreshAccessToken(refreshToken) {
  return new Promise((resolve) => {
    const clientId = process.env.CLAUDE_CODE_OAUTH_CLIENT_ID || DEFAULT_OAUTH_CLIENT_ID;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString();

    const req = https.request({
      hostname: 'platform.claude.com',
      path: '/v1/oauth/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: API_TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.access_token) {
              resolve({
                accessToken: parsed.access_token,
                refreshToken: parsed.refresh_token || refreshToken,
                expiresAt: parsed.expires_in ? Date.now() + parsed.expires_in * 1000 : parsed.expires_at,
              });
              return;
            }
          } catch {}
        }
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(body);
  });
}

function fetchUsageFromApi(accessToken) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json',
      },
      timeout: API_TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve({ data: JSON.parse(data) }); } catch { resolve({ data: null }); }
        } else if (res.statusCode === 429) {
          resolve({ data: null, rateLimited: true });
        } else {
          resolve({ data: null });
        }
      });
    });
    req.on('error', () => resolve({ data: null }));
    req.on('timeout', () => { req.destroy(); resolve({ data: null }); });
    req.end();
  });
}

function readUsageCache() {
  try {
    const cachePath = getUsageCachePath();
    if (!existsSync(cachePath)) return null;
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
    // Rehydrate dates
    if (cache.data?.fiveHourResetsAt) cache.data.fiveHourResetsAt = new Date(cache.data.fiveHourResetsAt);
    if (cache.data?.weeklyResetsAt) cache.data.weeklyResetsAt = new Date(cache.data.weeklyResetsAt);
    return cache;
  } catch {
    return null;
  }
}

function writeUsageCache(data, error) {
  try {
    const p = getUsageCachePath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ timestamp: Date.now(), data, error: !!error }));
  } catch {}
}

function isUsageCacheValid(cache) {
  const ttl = cache.error ? USAGE_CACHE_TTL_FAILURE_MS : USAGE_POLL_INTERVAL_MS;
  return Date.now() - cache.timestamp < ttl;
}

function clamp(v) {
  if (v == null || !isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function parseUsageResponse(response) {
  const fiveHour = response.five_hour?.utilization;
  const sevenDay = response.seven_day?.utilization;
  if (fiveHour == null && sevenDay == null) return null;

  const parseDate = (s) => {
    if (!s) return null;
    try { const d = new Date(s); return isNaN(d.getTime()) ? null : d; } catch { return null; }
  };

  return {
    fiveHourPercent: clamp(fiveHour),
    weeklyPercent: clamp(sevenDay),
    fiveHourResetsAt: parseDate(response.five_hour?.resets_at),
    weeklyResetsAt: parseDate(response.seven_day?.resets_at),
  };
}

async function getUsage() {
  // Check cache first
  const cache = readUsageCache();
  if (cache && isUsageCacheValid(cache)) {
    return cache.data;
  }

  // Get credentials
  let creds = getCredentials();
  if (!creds) return cache?.data || null;

  // Refresh if expired
  if (creds.expiresAt && creds.expiresAt <= Date.now()) {
    if (creds.refreshToken) {
      const refreshed = await refreshAccessToken(creds.refreshToken);
      if (refreshed) {
        creds = { ...creds, ...refreshed };
      } else {
        writeUsageCache(null, true);
        return cache?.data || null;
      }
    } else {
      writeUsageCache(null, true);
      return cache?.data || null;
    }
  }

  // Fetch from API
  const result = await fetchUsageFromApi(creds.accessToken);
  if (!result.data) {
    writeUsageCache(cache?.data || null, true);
    return cache?.data || null;
  }

  const usage = parseUsageResponse(result.data);
  writeUsageCache(usage, false);
  return usage;
}

// ============================================================================
// Transcript Parser
// ============================================================================

async function parseTranscript(transcriptPath) {
  const result = {
    agents: [],
    sessionStart: null,
    toolCallCount: 0,
    agentCallCount: 0,
  };

  if (!transcriptPath || !existsSync(transcriptPath)) return result;

  const agentMap = new Map();

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
        processEntry(entry, agentMap, result);
      } catch {}
    }
  } catch {}

  // Filter stale agents (>30min)
  const now = Date.now();
  for (const agent of agentMap.values()) {
    if (agent.status === 'running' && now - agent.startTime.getTime() > 30 * 60 * 1000) {
      agent.status = 'completed';
    }
  }

  result.agents = Array.from(agentMap.values()).filter(a => a.status === 'running');
  return result;
}

function readTailLines(filePath, fileSize, maxBytes) {
  const startOffset = Math.max(0, fileSize - maxBytes);
  const bytesToRead = fileSize - startOffset;
  const fd = openSync(filePath, 'r');
  const buffer = Buffer.alloc(bytesToRead);
  try { readSync(fd, buffer, 0, bytesToRead, startOffset); }
  finally { closeSync(fd); }
  const lines = buffer.toString('utf8').split('\n');
  if (startOffset > 0 && lines.length > 0) lines.shift();
  return lines;
}

function processEntry(entry, agentMap, result) {
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();

  if (!result.sessionStart && entry.timestamp) {
    result.sessionStart = timestamp;
  }

  const content = entry.message?.content;
  if (!content || !Array.isArray(content)) return;

  for (const block of content) {
    if (block.type === 'tool_use' && block.id && block.name) {
      result.toolCallCount++;
      if (block.name === 'Task' || block.name === 'proxy_Task' || block.name === 'Agent') {
        result.agentCallCount++;
        const input = block.input || {};
        if (agentMap.size >= MAX_AGENT_MAP_SIZE) {
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
          status: 'running',
          startTime: timestamp,
        });
      }
    }

    if (block.type === 'tool_result' && block.tool_use_id) {
      const agent = agentMap.get(block.tool_use_id);
      if (agent) {
        const blockContent = block.content;
        const isBackground = typeof blockContent === 'string'
          ? blockContent.includes('Async agent launched')
          : Array.isArray(blockContent) && blockContent.some(c => c.text?.includes('Async agent launched'));
        if (!isBackground) {
          agent.status = 'completed';
        }
      }
    }
  }
}

// ============================================================================
// HUD State
// ============================================================================

function getStatePath() {
  const root = process.env.PROJECT_PATH || process.cwd();
  return join(root, '.claude', '.omh', 'hud-state.json');
}

function readHudState() {
  try { return JSON.parse(readFileSync(getStatePath(), 'utf8')); }
  catch { return {}; }
}

function writeHudState(state) {
  try {
    const p = getStatePath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(state));
  } catch {}
}

// ============================================================================
// Formatters
// ============================================================================

function formatResetTime(date) {
  if (!date) return null;
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return null;

  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d${diffHours % 24}h`;
  }
  return `${diffHours}h${diffMinutes % 60}m`;
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h${totalMinutes % 60}m`;
}

function getLimitColor(percent) {
  if (percent >= 90) return RED;
  if (percent >= 70) return YELLOW;
  return GREEN;
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

function render(stdin, transcript, usage) {
  const parts = [];
  const sep = `${DIM} | ${RESET}`;

  // 1. [OMH] label
  parts.push(`${BRAND_BOLD}[OMH]${RESET}`);

  // 2. 5h rate limit
  if (usage) {
    const pct5h = Math.round(usage.fiveHourPercent);
    const color5h = getLimitColor(pct5h);
    const reset5h = formatResetTime(usage.fiveHourResetsAt);
    const resetPart = reset5h ? `${DIM}(${reset5h})${RESET}` : '';
    parts.push(`5h:${color5h}${pct5h}%${RESET}${resetPart}`);
  }

  // 3. Weekly rate limit
  if (usage?.weeklyPercent != null) {
    const pctWk = Math.round(usage.weeklyPercent);
    const colorWk = getLimitColor(pctWk);
    const resetWk = formatResetTime(usage.weeklyResetsAt);
    const resetPart = resetWk ? `${DIM}(${resetWk})${RESET}` : '';
    parts.push(`${DIM}wk:${RESET}${colorWk}${pctWk}%${RESET}${resetPart}`);
  }

  // 4. Session duration
  const hudState = readHudState();
  let sessionStart = transcript.sessionStart;
  const stdinSessionId = stdin?.transcript_path || 'default';

  if (hudState.sessionId === stdinSessionId && hudState.sessionStartTimestamp) {
    const persisted = new Date(hudState.sessionStartTimestamp);
    if (sessionStart && persisted < sessionStart) sessionStart = persisted;
    else if (!sessionStart) sessionStart = persisted;
  }

  if (sessionStart) {
    if (hudState.sessionId !== stdinSessionId || !hudState.sessionStartTimestamp) {
      writeHudState({ sessionId: stdinSessionId, sessionStartTimestamp: sessionStart.toISOString() });
    }
    const durationMs = Date.now() - sessionStart.getTime();
    const minutes = Math.floor(durationMs / 60_000);
    const color = getSessionColor(minutes);
    parts.push(`session:${color}${formatDuration(durationMs)}${RESET}`);
  }

  // 5. Context window %
  if (stdin) {
    const ctxPercent = getContextPercent(stdin);
    const ctxColor = getContextColor(ctxPercent);
    parts.push(`ctx:${ctxColor}${ctxPercent}%${RESET}`);
  }

  // 6. Tool call count
  if (transcript.toolCallCount > 0) {
    parts.push(`${TOOL_ICON}${transcript.toolCallCount}`);
  }

  // 7. Agent count
  const runningAgents = transcript.agents.length;
  if (runningAgents > 0) {
    parts.push(`agents:${CYAN}${runningAgents}${RESET}`);
  }

  // 8. Current model
  const modelName = stdin?.model?.display_name ?? stdin?.model?.id;
  if (modelName) {
    const short = modelName
      .replace(/^claude-?/i, '')
      .replace(/-\d{8}$/, '')
      .replace(/\s*\(.*\)$/, '')
      .toLowerCase();
    parts.push(`${DIM}${short}${RESET}`);
  }

  return parts.join(sep);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    const [stdin, usage] = await Promise.all([readStdin(), getUsage()]);
    const transcriptPath = stdin?.transcript_path;
    const transcript = await parseTranscript(transcriptPath);
    const output = render(stdin, transcript, usage);
    process.stdout.write(output + '\n');
  } catch {
    process.stdout.write(`${BRAND_BOLD}[OMH]${RESET}\n`);
  }
}

export {
  getContextPercent,
  clamp,
  parseUsageResponse,
  formatResetTime,
  formatDuration,
  getLimitColor,
  getContextColor,
  getSessionColor,
  processEntry,
  readTailLines,
  parseTranscript,
  render,
  readUsageCache,
  writeUsageCache,
  isUsageCacheValid,
  readHudState,
  writeHudState,
};

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  main();
}
