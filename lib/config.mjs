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
    const merged = deepMerge(DEFAULTS, raw);
    merged.multiAgent.tmuxSession = sanitizeTmuxSession(merged.multiAgent.tmuxSession);
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
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
