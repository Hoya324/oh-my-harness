import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONFIG_DIR = '.claude/.omh';
const CONFIG_FILE = 'harness.config.json';

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

export function configPath(projectRoot) {
  return join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

export function configDir(projectRoot) {
  return join(projectRoot, CONFIG_DIR);
}

export function readConfig(projectRoot) {
  const p = configPath(projectRoot);
  if (!existsSync(p)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    return deepMerge(DEFAULTS, raw);
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeConfig(projectRoot, config) {
  writeFileSync(configPath(projectRoot), JSON.stringify(config, null, 2) + '\n');
}

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
