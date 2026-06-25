import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONFIG_DIR = '.claude/.omh';
const CONFIG_FILE = 'harness.config.json';

/**
 * @typedef {Object} HarnessFeatures
 * @property {boolean} conventionSetup
 * @property {boolean} testEnforcement
 * @property {boolean} contextOptimization
 * @property {boolean} autoPlanMode
 * @property {boolean} ambiguityDetection
 * @property {boolean} dangerousGuard
 * @property {boolean} contextSnapshot
 * @property {boolean} commitConvention
 * @property {boolean} scopeGuard
 * @property {boolean} usageTracking
 * @property {boolean} autoGitignore
 * @property {boolean} skillScaffolding
 * @property {boolean} nativeTeam
 * @property {boolean} autonomousLoop
 * @property {boolean} weightRouting
 * @property {boolean} verifyGate
 * @property {boolean} planGate
 */

/**
 * @typedef {Object} HarnessConfig
 * @property {number} version
 * @property {HarnessFeatures} features
 * @property {{ minCases: number, promptOnMissing: boolean }} testEnforcement
 * @property {{ quick: string, standard: string, complex: string }} modelRouting
 * @property {{ threshold: number }} autoPlan
 * @property {{ threshold: number, language: string }} ambiguityDetection
 * @property {{ style: string }} commitConvention
 * @property {{ allowedPaths: string[] }} scopeGuard
 * @property {{ maxAgents: number, useWorktree: boolean, tmuxSession: string }} multiAgent
 * @property {{ maxTeammates: number, defaultTeamName: string, templates: Object }} nativeTeam
 * @property {{ classify: string, defaultTier: string, requireSpec: boolean, specPath: string, logFile: string, maxTotalIterations: number, stopOnNoProgress: boolean, quickCheckCommand: string, verifyCommand: string, verifyInHook: boolean, crossVerify: boolean, crossVerifyModel: string, tiers: Object }} loop
 * @property {{ taskThreshold: number, fileThreshold: number, domainKeywords: string[] }} tier3
 * @property {{ riskThreshold: number, maxBlocks: number, runLadder: boolean, recommendCrossVerify: boolean, largeFiles: number, largeLines: number, ladderTimeoutSec: Object, quickCheckCommand: string, verifyCommand: string, sensitivePaths: string[] }} verifyGate
 * @property {{ minTier: number, maxDenials: number, gatedTools: string[] }} planGate
 * @property {{ rounds: number, stopWhenClean: boolean, autoFix: boolean, lenses: Object[] }} verify
 * @property {{ autoDetect: boolean, overrides: Object }} conventions
 */

/** @type {HarnessConfig} */
const DEFAULTS = {
  version: 1,
  features: {
    conventionSetup: true,
    testEnforcement: true,
    contextOptimization: true,
    autoPlanMode: true,
    ambiguityDetection: true,
    dangerousGuard: true,
    contextSnapshot: true,
    commitConvention: true,
    scopeGuard: false,
    usageTracking: true,
    autoGitignore: true,
    skillScaffolding: true,
    nativeTeam: true,
    autonomousLoop: true,
    weightRouting: true,
    verifyGate: true,
    planGate: true,
  },
  testEnforcement: {
    minCases: 2,
    promptOnMissing: true,
  },
  modelRouting: {
    quick: 'haiku',
    standard: 'sonnet',
    complex: 'opus',
  },
  autoPlan: {
    threshold: 3,
  },
  ambiguityDetection: {
    threshold: 2,
    language: 'auto',
  },
  commitConvention: {
    style: 'auto',
  },
  scopeGuard: {
    allowedPaths: [],
  },
  multiAgent: {
    maxAgents: 4,
    useWorktree: true,
    tmuxSession: 'omh-agents',
  },
  nativeTeam: {
    maxTeammates: 4,
    defaultTeamName: 'omh-team',
    templates: {
      fullstack: {
        description: 'Full-stack development team',
        members: [
          { name: 'frontend', role: 'Frontend developer', agentType: 'standard' },
          { name: 'backend', role: 'Backend developer', agentType: 'standard' },
          { name: 'tester', role: 'Test writer and QA', agentType: 'standard' },
        ],
      },
      review: {
        description: 'Code review team',
        members: [
          { name: 'reviewer', role: 'Code reviewer', agentType: 'architect' },
          { name: 'tester', role: 'Test writer', agentType: 'standard' },
        ],
      },
      research: {
        description: 'Research and implementation team',
        members: [
          { name: 'researcher', role: 'Research and exploration', agentType: 'quick' },
          { name: 'implementer', role: 'Implementation', agentType: 'standard' },
          { name: 'architect', role: 'Architecture review', agentType: 'architect' },
        ],
      },
    },
  },
  loop: {
    classify: 'auto',
    defaultTier: 'quick',
    requireSpec: true,
    specPath: 'SPEC.md',
    logFile: 'PROGRESS.md',
    learningsFile: '.claude/.omh/loop-learnings.md',
    requireCommit: true,
    oneTaskPerIteration: true,
    maxDiffFilesPerIteration: 20,
    maxTotalIterations: 30,
    stopOnNoProgress: true,
    quickCheckCommand: '',
    verifyCommand: '',
    verifyInHook: true,
    rungTimeoutSec: { quickCheck: 30, verify: 180 },
    crossVerify: true,
    crossVerifyModel: 'architect',
    maxDeepVerifiesPerTask: 3,
    reflectionWindow: 3,
    tiers: {
      quick: { model: 'standard', maxIterations: 3, maxWallClockMinutes: 5, plateauWindow: 2, crossVerify: false, crossVerifyEvery: 0, marginalGainEpsilon: 0.05 },
      standard: { model: 'standard', maxIterations: 8, maxWallClockMinutes: 15, plateauWindow: 2, crossVerify: true, crossVerifyEvery: 0, marginalGainEpsilon: 0.03 },
      deep: { model: 'architect', maxIterations: 20, maxWallClockMinutes: 45, plateauWindow: 3, crossVerify: true, crossVerifyEvery: 5, marginalGainEpsilon: 0.02 },
    },
  },
  tier3: {
    taskThreshold: 5,
    fileThreshold: 5,
    domainKeywords: [],
  },
  verifyGate: {
    riskThreshold: 2,
    maxBlocks: 2,
    runLadder: true,
    recommendCrossVerify: true,
    largeFiles: 8,
    largeLines: 400,
    ladderTimeoutSec: { quickCheck: 30, verify: 180 },
    quickCheckCommand: '',
    verifyCommand: '',
    sensitivePaths: ['**/auth/**', '**/payment/**', '**/security/**', '*migration*', '**/*migration*', '.env*', '**/.env*', '**/secrets/**', '**/*.sql'],
  },
  planGate: {
    minTier: 3,
    maxDenials: 3,
    gatedTools: ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'],
  },
  verify: {
    rounds: 3,
    stopWhenClean: true,
    autoFix: false,
    lenses: [
      { model: 'claude', via: 'native-subagent', focus: 'correctness' },
      { model: 'gpt', via: 'codex', cmd: 'codex exec', focus: 'convention' },
      { model: 'gemini', via: 'gemini', cmd: 'gemini -p --approval-mode plan', focus: 'regression' },
    ],
  },
  conventions: {
    autoDetect: true,
    overrides: {},
  },
};

/**
 * Sanitize a tmux session name to prevent shell injection.
 * Returns the input unchanged if it matches the safe pattern.
 * Otherwise strips invalid characters; falls back to 'omh-agents' if result is empty.
 * @param {string} input - Raw tmux session name
 * @returns {string} Safe tmux session name
 */
export function sanitizeTmuxSession(input) {
  if (typeof input !== 'string') return 'omh-agents';
  if (/^[a-zA-Z0-9_-]+$/.test(input)) return input;
  const sanitized = input.replace(/[^a-zA-Z0-9_-]/g, '');
  return sanitized.length > 0 ? sanitized : 'omh-agents';
}

/**
 * Get the config file path for a project.
 * @param {string} projectRoot - Project root directory
 * @returns {string} Absolute path to harness.config.json
 */
export function configPath(projectRoot) {
  return join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

/**
 * Get the config directory path for a project.
 * @param {string} projectRoot - Project root directory
 * @returns {string} Absolute path to .claude/.omh/
 */
export function configDir(projectRoot) {
  return join(projectRoot, CONFIG_DIR);
}

/**
 * Read and merge config with defaults. Returns defaults if no config exists or on parse error.
 * @param {string} projectRoot - Project root directory
 * @returns {HarnessConfig} Merged configuration
 */
export function readConfig(projectRoot) {
  const p = configPath(projectRoot);
  if (!existsSync(p)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    const merged = mergeWithDefaults(raw);
    merged.multiAgent.tmuxSession = sanitizeTmuxSession(merged.multiAgent.tmuxSession);
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Merge a raw (possibly partial or stale) config object over the built-in
 * defaults. Keys absent from `raw` inherit their default — so a config written
 * by an older version transparently gains newly-added feature defaults instead
 * of reading as `undefined` (falsy). Explicit values in `raw` always win.
 *
 * The base is cloned so nested blocks the caller doesn't override are not
 * aliased to the shared module-level `DEFAULTS` — a consumer mutating the
 * returned config (e.g. `readConfig` rewriting `multiAgent.tmuxSession`) can
 * never pollute the defaults for later reads.
 * @param {Partial<HarnessConfig>} raw - Parsed config object
 * @returns {HarnessConfig} Defaults deep-merged with raw
 */
export function mergeWithDefaults(raw) {
  return deepMerge(structuredClone(DEFAULTS), raw);
}

/**
 * Write config to disk.
 * @param {string} projectRoot - Project root directory
 * @param {HarnessConfig} config - Configuration to persist
 */
export function writeConfig(projectRoot, config) {
  writeFileSync(configPath(projectRoot), JSON.stringify(config, null, 2) + '\n');
}

/**
 * Get a deep clone of the default configuration.
 * @returns {HarnessConfig} Default config
 */
export function getDefault() {
  return structuredClone(DEFAULTS);
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key]) &&
      typeof override[key] === 'object' && override[key] !== null && !Array.isArray(override[key])
    ) {
      result[key] = deepMerge(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}
