import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
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
  render,
} from '../hud/omh-hud.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '__tmp_hud');

beforeEach(() => { mkdirSync(TMP, { recursive: true }); });
afterEach(() => { rmSync(TMP, { recursive: true, force: true }); });

// ============================================================================
// clamp
// ============================================================================
describe('clamp', () => {
  it('returns value within range', () => {
    assert.equal(clamp(50), 50);
  });

  it('returns 0 for null, NaN, Infinity', () => {
    assert.equal(clamp(null), 0);
    assert.equal(clamp(NaN), 0);
    assert.equal(clamp(Infinity), 0);
  });

  it('clamps values outside 0-100', () => {
    assert.equal(clamp(150), 100);
    assert.equal(clamp(-10), 0);
  });
});

// ============================================================================
// formatResetTime
// ============================================================================
describe('formatResetTime', () => {
  it('formats future date as days and hours', () => {
    const future = new Date(Date.now() + (3 * 24 * 60 + 5 * 60 + 30) * 60_000);
    const result = formatResetTime(future);
    assert.match(result, /^3d[45]h$/);
  });

  it('returns null for past date', () => {
    const past = new Date(Date.now() - 60_000);
    assert.equal(formatResetTime(past), null);
  });

  it('returns null for null input', () => {
    assert.equal(formatResetTime(null), null);
  });
});

// ============================================================================
// formatDuration
// ============================================================================
describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    assert.equal(formatDuration(90 * 60_000), '1h30m');
  });

  it('formats minutes only when under 1 hour', () => {
    assert.equal(formatDuration(45 * 60_000), '45m');
  });
});

// ============================================================================
// getLimitColor
// ============================================================================
describe('getLimitColor', () => {
  it('returns RED for >= 90%', () => {
    assert.ok(getLimitColor(95).includes('\x1b[31m'));
  });

  it('returns GREEN for < 70%', () => {
    assert.ok(getLimitColor(50).includes('\x1b[32m'));
  });
});

// ============================================================================
// getContextColor
// ============================================================================
describe('getContextColor', () => {
  it('returns RED for >= 85%', () => {
    assert.ok(getContextColor(90).includes('\x1b[31m'));
  });

  it('returns GREEN for < 70%', () => {
    assert.ok(getContextColor(40).includes('\x1b[32m'));
  });
});

// ============================================================================
// getSessionColor
// ============================================================================
describe('getSessionColor', () => {
  it('returns RED for >= 60 minutes', () => {
    assert.ok(getSessionColor(65).includes('\x1b[31m'));
  });

  it('returns GREEN for < 30 minutes', () => {
    assert.ok(getSessionColor(10).includes('\x1b[32m'));
  });
});

// ============================================================================
// getContextPercent
// ============================================================================
describe('getContextPercent', () => {
  it('uses native used_percentage when available', () => {
    const stdin = { context_window: { used_percentage: 42 } };
    assert.equal(getContextPercent(stdin), 42);
  });

  it('calculates from tokens when native absent', () => {
    const stdin = {
      context_window: {
        context_window_size: 1000,
        current_usage: { input_tokens: 500 },
      },
    };
    assert.equal(getContextPercent(stdin), 50);
  });

  it('returns 0 for null stdin', () => {
    assert.equal(getContextPercent(null), 0);
  });
});

// ============================================================================
// parseUsageResponse
// ============================================================================
describe('parseUsageResponse', () => {
  it('parses valid response', () => {
    const response = {
      five_hour: { utilization: 14 },
      seven_day: { utilization: 62 },
    };
    const result = parseUsageResponse(response);
    assert.ok(result !== null);
    assert.equal(result.fiveHourPercent, 14);
    assert.equal(result.weeklyPercent, 62);
  });

  it('returns null for response with no utilization', () => {
    const response = { five_hour: {}, seven_day: {} };
    const result = parseUsageResponse(response);
    assert.equal(result, null);
  });
});

// ============================================================================
// processEntry
// ============================================================================
describe('processEntry', () => {
  it('registers agent on tool_use', () => {
    const agentMap = new Map();
    const result = { sessionStart: null, toolCallCount: 0, agentCallCount: 0 };
    const entry = {
      timestamp: new Date().toISOString(),
      message: {
        content: [
          { type: 'tool_use', id: 'agent-1', name: 'Agent', input: { subagent_type: 'worker' } },
        ],
      },
    };
    processEntry(entry, agentMap, result);
    assert.equal(agentMap.size, 1);
    assert.equal(agentMap.get('agent-1').status, 'running');
  });

  it('completes agent on tool_result', () => {
    const agentMap = new Map();
    const result = { sessionStart: null, toolCallCount: 0, agentCallCount: 0 };
    const toolUseEntry = {
      timestamp: new Date().toISOString(),
      message: {
        content: [
          { type: 'tool_use', id: 'agent-2', name: 'Agent', input: {} },
        ],
      },
    };
    const toolResultEntry = {
      timestamp: new Date().toISOString(),
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'agent-2', content: 'done' },
        ],
      },
    };
    processEntry(toolUseEntry, agentMap, result);
    processEntry(toolResultEntry, agentMap, result);
    assert.equal(agentMap.get('agent-2').status, 'completed');
  });

  it('evicts oldest completed agent when exceeding MAX_AGENT_MAP_SIZE', () => {
    const agentMap = new Map();
    const result = { sessionStart: null, toolCallCount: 0, agentCallCount: 0 };

    // Fill the map with 100 agents and mark them all completed
    for (let i = 0; i < 100; i++) {
      const id = `agent-evict-${i}`;
      const ts = new Date(Date.now() - (100 - i) * 1000).toISOString();
      processEntry({
        timestamp: ts,
        message: { content: [{ type: 'tool_use', id, name: 'Agent', input: {} }] },
      }, agentMap, result);
      // Mark each as completed immediately
      agentMap.get(id).status = 'completed';
    }

    assert.equal(agentMap.size, 100);

    // Add the 101st agent — should evict the oldest completed
    processEntry({
      timestamp: new Date().toISOString(),
      message: { content: [{ type: 'tool_use', id: 'agent-evict-100', name: 'Agent', input: {} }] },
    }, agentMap, result);

    assert.equal(agentMap.size, 100);
    assert.ok(!agentMap.has('agent-evict-0'), 'oldest completed agent should be evicted');
    assert.ok(agentMap.has('agent-evict-100'), 'new agent should be present');
  });
});

// ============================================================================
// readTailLines
// ============================================================================
describe('readTailLines', () => {
  it('reads last N bytes of a file', () => {
    const filePath = join(TMP, 'large.jsonl');
    // Write 100 lines so the file is larger than our tail window
    const lines = [];
    for (let i = 0; i < 100; i++) {
      lines.push(JSON.stringify({ index: i, data: 'x'.repeat(100) }));
    }
    writeFileSync(filePath, lines.join('\n') + '\n');

    const fileSize = statSync(filePath).size;
    const maxBytes = 512; // read only last 512 bytes

    const result = readTailLines(filePath, fileSize, maxBytes);
    assert.ok(Array.isArray(result));
    // Result should not contain the very first lines (they are beyond the tail window)
    const parsed = result
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    assert.ok(parsed.length > 0, 'should have parsed some lines');
    // None of the parsed lines should be the very first one (index 0)
    assert.ok(!parsed.some(p => p.index === 0), 'index 0 line should be outside the tail window');
  });
});

// ============================================================================
// render
// ============================================================================
describe('render', () => {
  it('renders full status line with all data', () => {
    process.env.PROJECT_PATH = TMP;
    const stdin = {
      transcript_path: join(TMP, 'transcript.jsonl'),
      context_window: { used_percentage: 39 },
    };
    const transcript = {
      agents: [],
      sessionStart: new Date(Date.now() - 29 * 60_000),
      toolCallCount: 5,
      agentCallCount: 0,
    };
    const usage = {
      fiveHourPercent: 14,
      weeklyPercent: 62,
      fiveHourResetsAt: new Date(Date.now() + 3 * 60 * 60_000),
      weeklyResetsAt: new Date(Date.now() + 3 * 24 * 60 * 60_000),
    };
    const output = render(stdin, transcript, usage);
    assert.ok(output.includes('[OMH]'), 'should include brand label');
    assert.ok(output.includes('5h:'), 'should include 5h rate limit section');
    assert.ok(output.includes('session:'), 'should include session duration');
    assert.ok(output.includes('ctx:'), 'should include context percent');
    delete process.env.PROJECT_PATH;
  });

  it('renders partial when usage is null', () => {
    process.env.PROJECT_PATH = TMP;
    const stdin = {
      transcript_path: join(TMP, 'transcript2.jsonl'),
      context_window: { used_percentage: 20 },
    };
    const transcript = {
      agents: [],
      sessionStart: null,
      toolCallCount: 0,
      agentCallCount: 0,
    };
    const output = render(stdin, transcript, null);
    assert.ok(output.includes('[OMH]'), 'should include brand label');
    assert.ok(!output.includes('5h:'), 'should not include 5h section when usage is null');
    delete process.env.PROJECT_PATH;
  });
});
