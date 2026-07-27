#!/usr/bin/env node
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
  renameSync,
} from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createInterface } from 'readline';
import { scaffoldProjectSkills } from '../lib/scaffold-skills.mjs';
import { parseRuntime, runtimeIncludes } from '../lib/runtime.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const OMH_DIR = '.claude/.omh';
const COMMANDS_DIR = '.claude/commands';
const CLAUDE_MD = '.claude/CLAUDE.md';
const SETTINGS_PROJECT = '.claude/settings.local.json';
const CODEX_HOOKS = '.codex/hooks.json';
const CODEX_CONFIG = '.codex/config.toml';
const CODEX_OWNERSHIP = 'codex-ownership.json';
const CODEX_ROLES = ['quick', 'standard', 'architect'];
const AGENTS_START = '<!-- HARNESS:START -->';
const AGENTS_END = '<!-- HARNESS:END -->';
const TOML_START = '# OH-MY-HARNESS:START';
const TOML_END = '# OH-MY-HARNESS:END';

const [,, command, ...args] = process.argv;

// --- ANSI ---
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';

const CHECK = `${GREEN}\u2714${RESET}`;
const ARROW = `${CYAN}\u276F${RESET}`;
const WARN = `${YELLOW}\u26A0${RESET}`;

function log(msg = '') { console.log(msg); }
function logStep(n, total, label) {
  log(`  ${GRAY}[${n}/${total}]${RESET} ${BOLD}${label}${RESET}`);
}
function logDone(msg) { log(`    ${CHECK} ${msg}`); }
function logInfo(msg) { log(`    ${DIM}${msg}${RESET}`); }

function getVersion() {
  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

function stripFrontmatter(content) {
  return content.replace(/^---[\s\S]*?---\n*/, '');
}

function projectRoot() {
  return process.cwd();
}

function omhDir(root) { return join(root, OMH_DIR); }

function getUserHome() {
  return process.env.HOME || process.env.USERPROFILE || '';
}

function getUserSettingsPath() {
  return join(getUserHome(), '.claude', 'settings.json');
}

function getSettingsPath(root, scope) {
  if (scope === 'user') return getUserSettingsPath();
  return join(root, SETTINGS_PROJECT);
}

// --- SCOPE ---
function parseScope() {
  const idx = args.indexOf('--scope');
  if (idx !== -1 && args[idx + 1]) {
    const val = args[idx + 1].toLowerCase();
    if (val === 'user' || val === 'project') return val;
  }
  if (args.includes('--global')) return 'user';
  return null;
}

async function promptScope() {
  // Non-interactive (piped, CI, or test): default to project
  if (!process.stdin.isTTY || process.env.NODE_TEST_CONTEXT || process.env.OMH_SKIP_GLOBAL) {
    return 'project';
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    log('');
    log(`  ${BOLD}Where should the harness be installed?${RESET}`);
    log('');
    log(`    ${CYAN}1${RESET}  ${BOLD}Project${RESET} ${DIM}(default)${RESET}`);
    log(`       ${DIM}.claude/settings.local.json — this project only${RESET}`);
    log(`    ${CYAN}2${RESET}  ${BOLD}User${RESET}`);
    log(`       ${DIM}~/.claude/settings.json — all projects for this user${RESET}`);
    log('');
    rl.question(`  ${ARROW} Choose [1/2]: `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed === '2' || trimmed.toLowerCase() === 'user') {
        resolve('user');
      } else {
        resolve('project');
      }
    });
  });
}

// --- DUCK ---
function showDuck() {
  const duckPath = join(PKG_ROOT, 'lib', 'duck.sh');
  if (existsSync(duckPath)) {
    try { execSync(`bash "${duckPath}"`, { stdio: 'inherit' }); } catch {}
  }
}

// --- INIT ---
async function initClaude(root, scope) {
  const omh = omhDir(root);
  const hooksDir = join(omh, 'hooks');
  const cmdDir = join(root, COMMANDS_DIR);
  const isFirstRun = !existsSync(join(omh, 'harness.config.json'));
  const totalSteps = 8;

  // Header
  if (isFirstRun) {
    showDuck();
    log(`  ${BOLD}Welcome to oh-my-harness!${RESET} ${DIM}v${getVersion()}${RESET}`);
    log(`  ${DIM}Smart defaults for Claude Code — test enforcement, guard rails,${RESET}`);
    log(`  ${DIM}convention detection, and model routing, all in one harness.${RESET}`);
  } else {
    log(`\n  ${BOLD}Updating oh-my-harness${RESET} ${DIM}v${getVersion()}${RESET}`);
  }

  const scopeLabel = scope === 'user' ? 'User (global)' : 'Project (local)';
  log(`\n  ${GRAY}Scope: ${RESET}${BOLD}${scopeLabel}${RESET}`);
  log('');

  // Step 1: Config
  logStep(1, totalSteps, 'Configuration');
  mkdirSync(hooksDir, { recursive: true });
  mkdirSync(cmdDir, { recursive: true });

  const configDest = join(omh, 'harness.config.json');
  if (!existsSync(configDest)) {
    cpSync(join(PKG_ROOT, 'templates', 'harness.config.json.tmpl'), configDest);
    logDone('Created harness.config.json');
  } else {
    logDone('Config preserved (existing)');
  }

  // Step 2: Hooks
  logStep(2, totalSteps, 'Hooks');
  const hookLibDir = join(hooksDir, 'lib');
  mkdirSync(hookLibDir, { recursive: true });
  cpSync(join(PKG_ROOT, 'hooks', 'lib', 'output.mjs'), join(hookLibDir, 'output.mjs'));
  cpSync(join(PKG_ROOT, 'hooks', 'lib', 'dictionary.mjs'), join(hookLibDir, 'dictionary.mjs'));
  cpSync(join(PKG_ROOT, 'lib', 'detect.mjs'), join(hookLibDir, 'detect.mjs'));
  const allHooks = [
    'session-start.mjs', 'pre-prompt.mjs', 'post-task.mjs',
    'dangerous-guard.mjs', 'pre-compact.mjs', 'commit-convention.mjs',
    'scope-guard.mjs', 'usage-tracker.mjs',
  ];
  for (const hook of allHooks) {
    cpSync(join(PKG_ROOT, 'hooks', hook), join(hooksDir, hook));
  }
  cpSync(join(PKG_ROOT, 'hooks', 'hook-gate.sh'), join(hooksDir, 'hook-gate.sh'));
  logDone(`8 hooks + gate + shared libraries`);
  logInfo('session-start, pre-prompt, post-task, dangerous-guard,');
  logInfo('pre-compact, commit-convention, scope-guard, usage-tracker');

  // Step 3: Commands
  logStep(3, totalSteps, 'Commands');
  const skillMap = [
    ['set-harness', 'set-harness.md'],
    ['init-project', 'init-project.md'],
    ['agent-spawn', 'agent-spawn.md'],
    ['agent-status', 'agent-status.md'],
    ['agent-apply', 'agent-apply.md'],
    ['agent-stop', 'agent-stop.md'],
  ];
  for (const [skill, cmdFile] of skillMap) {
    const skillContent = readFileSync(join(PKG_ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
    writeFileSync(join(cmdDir, cmdFile), stripFrontmatter(skillContent));
  }
  logDone('6 slash commands installed');
  logInfo('/set-harness, /init-project, /agent-spawn, /agent-status, /agent-apply, /agent-stop');

  // Step 4: Settings (scope-aware)
  logStep(4, totalSteps, `Settings ${DIM}(${scopeLabel})${RESET}`);
  mergeSettings(root, scope);
  const settingsFile = scope === 'user' ? '~/.claude/settings.json' : '.claude/settings.local.json';
  logDone(`Hooks registered in ${settingsFile}`);

  // Step 5: CLAUDE.md
  logStep(5, totalSteps, 'CLAUDE.md');
  appendClaudeMd(root);
  logDone('Harness instructions injected');

  // Step 6: .gitignore
  logStep(6, totalSteps, '.gitignore');
  updateGitignore(root, 'add');
  logDone('.claude/.omh/ added to .gitignore');

  // Step 7: HUD
  logStep(7, totalSteps, 'HUD Status Line');
  installHud(root);
  logDone('Status line configured');

  // Step 8: Project Skills
  logStep(8, totalSteps, 'Project Skills');
  const configForSkills = JSON.parse(readFileSync(join(omh, 'harness.config.json'), 'utf8'));
  if (configForSkills.features?.skillScaffolding !== false) {
    const skillsDir = join(root, '.claude', 'skills');
    if (existsSync(skillsDir) && readdirSync(skillsDir).length > 0) {
      logDone('Project skills preserved (existing)');
    } else {
      // Detect or use cached conventions
      let conventions;
      const convCachePath = join(omh, 'conventions.json');
      if (existsSync(convCachePath)) {
        try { conventions = JSON.parse(readFileSync(convCachePath, 'utf8')); } catch {}
      }
      if (!conventions || !conventions.language) {
        const { detectConventions } = await import('../lib/detect.mjs');
        conventions = detectConventions(root);
      }
      const result = scaffoldProjectSkills(root, conventions);
      if (result.created.length > 0) {
        logDone(`${result.created.length} project skills scaffolded (${conventions.language || 'generic'})`);
        logInfo(result.created.join(', '));
      } else {
        logDone('No skills scaffolded (language not detected)');
      }
    }
  } else {
    logInfo('Skill scaffolding disabled');
  }

  // Summary
  log('');
  log(`  ${GREEN}${BOLD}oh-my-harness is ready!${RESET}`);
  log('');
  log(`  ${DIM}Config ${RESET} .claude/.omh/harness.config.json`);
  log(`  ${DIM}Scope  ${RESET} ${scopeLabel}`);
  log(`  ${DIM}Hooks  ${RESET} 8 active (6 events)`);
  log(`  ${DIM}Skills ${RESET} project skills in .claude/skills/`);
  log(`  ${DIM}Agents ${RESET} haiku / sonnet / opus`);
  log('');
  log(`  ${DIM}Use ${RESET}${BOLD}/set-harness${RESET}${DIM} to customize anytime.${RESET}`);
  log('');
}

function codexInstallRoot(root, scope) {
  return scope === 'user' ? getUserHome() : root;
}

function codexStateRoot(root, scope) {
  return scope === 'user' ? getUserHome() : root;
}

function codexOwnershipPath(root, scope) {
  return join(omhDir(codexStateRoot(root, scope)), CODEX_OWNERSHIP);
}

function codexGuidancePath(root, scope) {
  if (scope === 'user') return join(codexInstallRoot(root, scope), '.codex', 'AGENTS.md');
  return join(root, 'AGENTS.md');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function managedBlockBounds(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  const endStart = start === -1 ? -1 : content.indexOf(endMarker, start + startMarker.length);
  if (start === -1 && !content.includes(endMarker)) return null;
  if (start === -1 || endStart === -1) return { malformed: true };
  return { start, end: endStart + endMarker.length };
}

function upsertManagedBlock(filePath, block, startMarker, endMarker) {
  const normalized = block.trim();
  mkdirSync(dirname(filePath), { recursive: true });

  if (!existsSync(filePath)) {
    writeFileSync(filePath, normalized + '\n');
    return true;
  }

  const existing = readFileSync(filePath, 'utf8');
  const bounds = managedBlockBounds(existing, startMarker, endMarker);
  if (bounds?.malformed) {
    console.error(`  ${WARN} Preserved ${filePath}: incomplete oh-my-harness markers.`);
    return false;
  }

  if (bounds) {
    writeFileSync(
      filePath,
      existing.slice(0, bounds.start) + normalized + existing.slice(bounds.end),
    );
    return true;
  }

  const separator = existing.length === 0
    ? ''
    : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  writeFileSync(filePath, existing + separator + normalized + '\n');
  return true;
}

function removeManagedBlock(filePath, startMarker, endMarker) {
  if (!existsSync(filePath)) return false;
  const existing = readFileSync(filePath, 'utf8');
  const bounds = managedBlockBounds(existing, startMarker, endMarker);
  if (!bounds || bounds.malformed) return false;

  let before = existing.slice(0, bounds.start);
  let after = existing.slice(bounds.end);
  if (before.endsWith('\n\n') && after.startsWith('\n')) {
    before = before.slice(0, -1);
    after = after.slice(1);
  } else if (before.length === 0 && after.startsWith('\n')) {
    after = after.slice(1);
  }

  const cleaned = before + after;
  if (cleaned.length === 0) rmSync(filePath);
  else writeFileSync(filePath, cleaned);
  return true;
}

function ensureSharedConfig(root, scope) {
  const omh = omhDir(codexStateRoot(root, scope));
  const configDest = join(omh, 'harness.config.json');
  mkdirSync(omh, { recursive: true });
  if (!existsSync(configDest)) {
    cpSync(join(PKG_ROOT, 'templates', 'harness.config.json.tmpl'), configDest);
    return 'created';
  }
  return 'preserved';
}

function installCodexRuntime(root, scope) {
  const runtimeRoot = join(omhDir(codexStateRoot(root, scope)), 'runtime');
  mkdirSync(runtimeRoot, { recursive: true });
  cpSync(join(PKG_ROOT, 'hooks'), join(runtimeRoot, 'hooks'), {
    recursive: true,
    force: true,
  });
  cpSync(join(PKG_ROOT, 'lib'), join(runtimeRoot, 'lib'), {
    recursive: true,
    force: true,
  });
  return runtimeRoot;
}

function isManagedCodexHook(handler) {
  return handler?.statusMessage?.startsWith('oh-my-harness:')
    || handler?.command?.includes('.claude/.omh/runtime/hooks/codex/run.mjs')
    || handler?.command?.includes('.claude\\.omh\\runtime\\hooks\\codex\\run.mjs');
}

function withoutManagedCodexHooks(groups) {
  const cleaned = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    const hooks = (group.hooks || []).filter(handler => !isManagedCodexHook(handler));
    if (hooks.length > 0) cleaned.push({ ...group, hooks });
  }
  return cleaned;
}

function installedCodexHooks(runtimeRoot) {
  const source = JSON.parse(
    readFileSync(join(PKG_ROOT, 'hooks', 'codex', 'hooks.json'), 'utf8'),
  );
  const sourceRunner = '"${PLUGIN_ROOT}/hooks/codex/run.mjs"';
  const installedRunner = shellQuote(join(runtimeRoot, 'hooks', 'codex', 'run.mjs'));
  for (const groups of Object.values(source.hooks || {})) {
    for (const group of groups) {
      for (const handler of group.hooks || []) {
        if (typeof handler.command === 'string') {
          handler.command = handler.command.replace(sourceRunner, installedRunner);
          if (handler.command.includes('${PLUGIN_ROOT}')) {
            throw new Error(`Unsupported Codex hook command template: ${handler.command}`);
          }
        }
      }
    }
  }
  return source;
}

function mergeCodexHooks(root, scope, runtimeRoot) {
  const installRoot = codexInstallRoot(root, scope);
  const hooksPath = join(installRoot, CODEX_HOOKS);
  const managed = installedCodexHooks(runtimeRoot);
  let existing = {};

  if (existsSync(hooksPath)) {
    try {
      existing = JSON.parse(readFileSync(hooksPath, 'utf8'));
    } catch {
      console.error(`  ${WARN} Preserved ${hooksPath}: invalid JSON.`);
      return false;
    }
  }

  if (existing.hooks !== undefined && (
    !existing.hooks || Array.isArray(existing.hooks) || typeof existing.hooks !== 'object'
  )) {
    console.error(`  ${WARN} Preserved ${hooksPath}: hooks must be an object.`);
    return false;
  }

  const merged = {
    ...existing,
    description: existing.description || managed.description,
    hooks: { ...(existing.hooks || {}) },
  };
  for (const [event, groups] of Object.entries(managed.hooks || {})) {
    const custom = withoutManagedCodexHooks(merged.hooks[event]);
    merged.hooks[event] = [...custom, ...groups];
  }

  mkdirSync(dirname(hooksPath), { recursive: true });
  writeFileSync(hooksPath, JSON.stringify(merged, null, 2) + '\n');
  return true;
}

function managedCodexSkillNames() {
  return readdirSync(join(PKG_ROOT, 'codex', 'skills'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function emptyCodexOwnership() {
  return { version: 1, roles: [], skills: [] };
}

function parseCodexOwnership(root, scope) {
  const manifestPath = codexOwnershipPath(root, scope);
  if (!existsSync(manifestPath)) {
    return { ok: true, ownership: emptyCodexOwnership() };
  }

  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (
      parsed?.version !== 1
      || !Array.isArray(parsed.roles)
      || !Array.isArray(parsed.skills)
    ) {
      return { ok: false, ownership: emptyCodexOwnership() };
    }
    const allowedRoles = new Set(CODEX_ROLES);
    const allowedSkills = new Set(managedCodexSkillNames());
    if (
      parsed.roles.some(role => typeof role !== 'string' || !allowedRoles.has(role))
      || parsed.skills.some(skill => typeof skill !== 'string' || !allowedSkills.has(skill))
    ) {
      return { ok: false, ownership: emptyCodexOwnership() };
    }
    return {
      ok: true,
      ownership: {
        version: 1,
        roles: [...new Set(parsed.roles)].sort(),
        skills: [...new Set(parsed.skills)].sort(),
      },
    };
  } catch {
    return { ok: false, ownership: emptyCodexOwnership() };
  }
}

function writeCodexOwnership(root, scope, ownership) {
  const manifestPath = codexOwnershipPath(root, scope);
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(temporaryPath, JSON.stringify({
    version: 1,
    roles: [...new Set(ownership.roles)].sort(),
    skills: [...new Set(ownership.skills)].sort(),
  }, null, 2) + '\n');
  renameSync(temporaryPath, manifestPath);
}

function installCodexSkills(root, scope, ownership) {
  const skillsRoot = join(codexInstallRoot(root, scope), '.agents', 'skills');
  mkdirSync(skillsRoot, { recursive: true });
  const owned = new Set(ownership.skills);
  for (const skill of managedCodexSkillNames()) {
    const destination = join(skillsRoot, skill);
    if (existsSync(destination) && !owned.has(skill)) continue;
    cpSync(
      join(PKG_ROOT, 'codex', 'skills', skill),
      destination,
      { recursive: true, force: true },
    );
    owned.add(skill);
  }
  ownership.skills = [...owned].sort();
}

function installCodexRoles(root, scope, ownership) {
  const rolesRoot = join(codexInstallRoot(root, scope), '.codex', 'agents');
  mkdirSync(rolesRoot, { recursive: true });
  const owned = new Set(ownership.roles);
  for (const role of CODEX_ROLES) {
    const destination = join(rolesRoot, `${role}.toml`);
    if (existsSync(destination) && !owned.has(role)) continue;
    cpSync(
      join(PKG_ROOT, 'codex', 'agents', `${role}.toml`),
      destination,
    );
    owned.add(role);
  }
  ownership.roles = [...owned].sort();
}

function withoutBlock(content, startMarker, endMarker) {
  const bounds = managedBlockBounds(content, startMarker, endMarker);
  if (!bounds || bounds.malformed) return content;
  return content.slice(0, bounds.start) + content.slice(bounds.end);
}

function mergeCodexConfig(root, scope, ownership) {
  const configPath = join(codexInstallRoot(root, scope), CODEX_CONFIG);
  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  const userOwned = withoutBlock(existing, TOML_START, TOML_END);
  const descriptions = {
    quick: 'Fast read-only lookup, search, and narrow exploration.',
    standard: 'Focused implementation, testing, debugging, and review.',
    architect: 'Architecture, complex planning, security review, and independent verification.',
  };
  const lines = [TOML_START];
  for (const role of CODEX_ROLES) {
    if (!ownership.roles.includes(role)) continue;
    const declaration = new RegExp(`^\\s*\\[agents\\.${role}\\]\\s*$`, 'm');
    if (declaration.test(userOwned)) continue;
    lines.push('');
    lines.push(`[agents.${role}]`);
    lines.push(`description = ${JSON.stringify(descriptions[role])}`);
    lines.push(`config_file = "agents/${role}.toml"`);
  }
  lines.push(TOML_END);
  return upsertManagedBlock(configPath, lines.join('\n'), TOML_START, TOML_END);
}

function installCodexGuidance(root, scope) {
  const template = readFileSync(join(PKG_ROOT, 'templates', 'AGENTS.md.tmpl'), 'utf8');
  return upsertManagedBlock(
    codexGuidancePath(root, scope),
    template,
    AGENTS_START,
    AGENTS_END,
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateCodexHooks(root, scope) {
  const hooksPath = join(codexInstallRoot(root, scope), CODEX_HOOKS);
  if (!existsSync(hooksPath)) return true;

  let hooks;
  try {
    hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
  } catch {
    console.error(`  ${WARN} Cannot refresh Codex: invalid hooks JSON at ${hooksPath}.`);
    return false;
  }

  if (!isPlainObject(hooks) || (hooks.hooks !== undefined && !isPlainObject(hooks.hooks))) {
    console.error(`  ${WARN} Cannot refresh Codex: hooks JSON must contain an object at ${hooksPath}.`);
    return false;
  }
  for (const groups of Object.values(hooks.hooks || {})) {
    if (
      !Array.isArray(groups)
      || groups.some(group => !isPlainObject(group) || !Array.isArray(group.hooks))
    ) {
      console.error(`  ${WARN} Cannot refresh Codex: invalid hooks JSON structure at ${hooksPath}.`);
      return false;
    }
  }
  return true;
}

function validateManagedMarkers(filePath, startMarker, endMarker) {
  if (!existsSync(filePath)) return true;
  const content = readFileSync(filePath, 'utf8');
  const startCount = content.split(startMarker).length - 1;
  const endCount = content.split(endMarker).length - 1;
  const hasNoMarkers = startCount === 0 && endCount === 0;
  const hasOneOrderedBlock = startCount === 1
    && endCount === 1
    && content.indexOf(startMarker) < content.indexOf(endMarker);
  if (hasNoMarkers || hasOneOrderedBlock) return true;
  console.error(
    `  ${WARN} Cannot refresh Codex: incomplete oh-my-harness markers in ${filePath}.`,
  );
  return false;
}

function preflightCodex(root, scope) {
  if (!validateCodexHooks(root, scope)) return false;
  if (!validateManagedMarkers(
    join(codexInstallRoot(root, scope), CODEX_CONFIG),
    TOML_START,
    TOML_END,
  )) return false;
  if (!validateManagedMarkers(
    codexGuidancePath(root, scope),
    AGENTS_START,
    AGENTS_END,
  )) return false;

  const parsedOwnership = parseCodexOwnership(root, scope);
  if (!parsedOwnership.ok) {
    console.error(
      `  ${WARN} Cannot refresh Codex: invalid ownership manifest at ${codexOwnershipPath(root, scope)}.`,
    );
    return false;
  }
  return true;
}

async function scaffoldCodexProjectSkills(root, scope) {
  const stateRoot = codexStateRoot(root, scope);
  let config = {};
  try {
    config = JSON.parse(readFileSync(join(omhDir(stateRoot), 'harness.config.json'), 'utf8'));
  } catch {}
  if (config.features?.skillScaffolding === false) return;

  let conventions;
  const cachePath = join(omhDir(stateRoot), 'conventions.json');
  if (existsSync(cachePath)) {
    try { conventions = JSON.parse(readFileSync(cachePath, 'utf8')); } catch {}
  }
  if (!conventions?.language) {
    const { detectConventions } = await import('../lib/detect.mjs');
    conventions = detectConventions(root);
  }
  scaffoldProjectSkills(codexInstallRoot(root, scope), conventions, { runtime: 'codex' });
}

function refreshCodex(root, scope) {
  if (!preflightCodex(root, scope)) return false;
  const { ownership } = parseCodexOwnership(root, scope);
  const runtimeRoot = installCodexRuntime(root, scope);
  if (!mergeCodexHooks(root, scope, runtimeRoot)) return false;
  installCodexSkills(root, scope, ownership);
  installCodexRoles(root, scope, ownership);
  if (!mergeCodexConfig(root, scope, ownership)) return false;
  if (!installCodexGuidance(root, scope)) return false;
  writeCodexOwnership(root, scope, ownership);
  return true;
}

async function initCodex(root, scope) {
  const scopeLabel = scope === 'user' ? 'User (global)' : 'Project (local)';
  log(`\n  ${BOLD}Installing oh-my-harness for Codex${RESET} ${DIM}v${getVersion()}${RESET}`);
  log(`  ${GRAY}Scope: ${RESET}${BOLD}${scopeLabel}${RESET}`);

  if (!preflightCodex(root, scope)) {
    process.exitCode = 1;
    return false;
  }
  const configResult = ensureSharedConfig(root, scope);
  logDone(`Shared config ${configResult}`);
  if (!refreshCodex(root, scope)) {
    process.exitCode = 1;
    return false;
  }
  await scaffoldCodexProjectSkills(root, scope);
  if (scope === 'project') updateGitignore(root, 'add');

  logDone('Codex hooks installed');
  logDone('Codex roles and built-in skills installed');
  logDone('AGENTS.md harness guidance installed');
  logInfo('Review and trust the installed lifecycle hooks in Codex with /hooks.');
  log('');
  return true;
}

async function init(root, scope, runtime) {
  if (runtimeIncludes(runtime, 'claude')) await initClaude(root, scope);
  if (runtimeIncludes(runtime, 'codex')) await initCodex(root, scope);
}

// --- HUD ---
function installHud(root) {
  const hudSrc = join(PKG_ROOT, 'hud', 'omh-hud.mjs');
  const hudDest = join(omhDir(root), 'hud');
  mkdirSync(hudDest, { recursive: true });
  cpSync(hudSrc, join(hudDest, 'omh-hud.mjs'));

  // Skip global settings update during tests
  if (process.env.NODE_TEST_CONTEXT || process.env.OMH_SKIP_GLOBAL) return;

  // Register statusLine in user settings (~/.claude/settings.json)
  const userSettingsPath = getUserSettingsPath();
  let userSettings = {};
  if (existsSync(userSettingsPath)) {
    try { userSettings = JSON.parse(readFileSync(userSettingsPath, 'utf8')); } catch {}
  }

  // Only set if not already configured or if it's an OMH statusLine
  const existing = userSettings.statusLine;
  const isOmh = existing?.command?.includes('omh-hud');
  if (!existing || isOmh) {
    const hudPath = join(omhDir(root), 'hud', 'omh-hud.mjs');
    userSettings.statusLine = {
      type: 'command',
      command: `node "${hudPath}"`,
    };
    mkdirSync(dirname(userSettingsPath), { recursive: true });
    writeFileSync(userSettingsPath, JSON.stringify(userSettings, null, 2) + '\n');
  }
}

// --- MERGE SETTINGS ---
function mergeSettings(root, scope = 'project') {
  const settingsPath = getSettingsPath(root, scope);

  // Skip writing to user scope during tests
  if (scope === 'user' && (process.env.NODE_TEST_CONTEXT || process.env.OMH_SKIP_GLOBAL)) {
    // Fallback: write to project scope instead during tests
    scope = 'project';
  }

  const actualPath = getSettingsPath(root, scope);
  let settings = {};
  if (existsSync(actualPath)) {
    try { settings = JSON.parse(readFileSync(actualPath, 'utf8')); } catch {}
  }

  const hooksBase = '.claude/.omh/hooks';
  const gate = `bash ${hooksBase}/hook-gate.sh`;
  // 2-Stage Prompt Evaluation: bash pre-filter checks feature flag before spawning Node.
  // Format: bash hook-gate.sh <hook-script> <feature1> [feature2 ...]
  const harnessHooks = {
    SessionStart: [{
      matcher: '*',
      hooks: [{ type: 'command', command: `${gate} ${hooksBase}/session-start.mjs conventionSetup`, timeout: 10 }],
    }],
    UserPromptSubmit: [{
      matcher: '*',
      hooks: [{ type: 'command', command: `${gate} ${hooksBase}/pre-prompt.mjs autoPlanMode ambiguityDetection`, timeout: 3 }],
    }],
    PreToolUse: [{
      matcher: '*',
      hooks: [{ type: 'command', command: `${gate} ${hooksBase}/dangerous-guard.mjs dangerousGuard`, timeout: 3 }],
    }],
    PostToolUse: [{
      matcher: '*',
      hooks: [
        { type: 'command', command: `${gate} ${hooksBase}/commit-convention.mjs commitConvention`, timeout: 3 },
        { type: 'command', command: `${gate} ${hooksBase}/scope-guard.mjs scopeGuard`, timeout: 3 },
        { type: 'command', command: `${gate} ${hooksBase}/usage-tracker.mjs usageTracking`, timeout: 3 },
      ],
    }],
    PreCompact: [{
      matcher: '*',
      hooks: [{ type: 'command', command: `${gate} ${hooksBase}/pre-compact.mjs contextSnapshot`, timeout: 5 }],
    }],
    Stop: [{
      matcher: '*',
      hooks: [{ type: 'command', command: `${gate} ${hooksBase}/post-task.mjs testEnforcement`, timeout: 5 }],
    }],
  };

  // Read config for model routing
  const configPath = join(omhDir(root), 'harness.config.json');
  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { config = {}; }

  // Merge hooks — keep existing non-harness hooks, replace harness ones
  if (!settings.hooks) settings.hooks = {};
  for (const [event, hookDefs] of Object.entries(harnessHooks)) {
    const existing = settings.hooks[event] || [];
    // Remove previous harness hooks
    const filtered = existing.filter(h =>
      !h.hooks?.some(hh => hh.command?.includes('.omh/hooks/'))
    );
    settings.hooks[event] = [...filtered, ...hookDefs];
  }

  // Register model-routed agents if contextOptimization enabled
  if (config.features?.contextOptimization && config.modelRouting) {
    settings.agents = settings.agents || {};
    const routing = config.modelRouting;
    if (routing.quick) settings.agents['harness:quick'] = { model: routing.quick };
    if (routing.standard) settings.agents['harness:standard'] = { model: routing.standard };
    if (routing.complex) settings.agents['harness:architect'] = { model: routing.complex };
  }

  mkdirSync(dirname(actualPath), { recursive: true });
  writeFileSync(actualPath, JSON.stringify(settings, null, 2) + '\n');
}

// --- CLAUDE.MD ---
// Builds CLAUDE.md content programmatically based on enabled features.
// Compressed text (~50% smaller), feature-conditional (Progressive Disclosure),
// and ordered static→dynamic for Anthropic prompt cache compatibility.
function buildClaudeMdContent(root, config) {
  const f = config.features || {};
  const s = [];

  // --- Static core (cache-stable across turns) ---
  s.push('<!-- HARNESS:START -->');
  s.push('## oh-my-harness');
  s.push('');
  s.push('Relay all `[omh:*]` hook tags to the user.');

  if (f.contextOptimization) {
    s.push('');
    s.push('### Model Routing');
    s.push('Delegate by complexity with `[omh:model-routing → <model>]`:');
    s.push('- **harness:quick** (haiku): lookups, reads, exploration');
    s.push('- **harness:standard** (sonnet): implementation, bug fixes, debugging');
    s.push('- **harness:architect** (opus): architecture, complex refactoring, security');
  }

  if (f.testEnforcement) {
    const min = config.testEnforcement?.minCases || 2;
    s.push('');
    s.push('### Test Enforcement');
    s.push(`After code changes: verify tests exist (min ${min} cases: happy, edge, error), suggest adding if missing, run to confirm pass.`);
  }

  if (f.autoPlanMode) {
    s.push('');
    s.push('### Auto-Plan Mode');
    s.push('On 3+ distinct tasks: list → propose plan → confirm before proceeding.');
  }

  if (f.ambiguityDetection) {
    s.push('');
    s.push('### Ambiguity Guard');
    s.push('On vague requests (no target, broad verbs like "refactor"/"improve"): AskUserQuestion to clarify before starting.');
  }

  if (f.dangerousGuard) {
    s.push('');
    s.push('### Dangerous Operation Guard');
    s.push('Before destructive ops (rm -rf, force push, DROP TABLE): confirm with user. Never auto-approve. Caution on .env/credentials.');
  }

  if (f.commitConvention) {
    s.push('');
    s.push('### Commit Convention');
    s.push('Follow project convention (auto-detected). Default: `<type>(<scope>): <description>`');
  }

  if (f.scopeGuard) {
    s.push('');
    s.push('### Scope Guard');
    s.push('Only modify within `scopeGuard.allowedPaths`. Confirm before out-of-scope edits.');
  }

  // Multi-Agent — always included (skills are always installed)
  s.push('');
  s.push('### Multi-Agent');
  s.push('On `/agent-spawn`: confirm → worktree `omh/agent-{N}` → never auto-merge → show diffs → warn on unmerged before stop.');

  if (f.autonomousLoop) {
    s.push('');
    s.push('### Autonomous Loop');
    s.push('Spec-driven loop. `/omh-spec` writes a machine-checkable SPEC.md; `/omh-loop` runs it. The Stop hook (`loop-guard`) IS the loop engine — it forces continuation until the verify ladder + cross-verify confirm done, or a guardrail fires (budget/timeout/no-progress/oscillation). Confirm before starting; one task per iteration; ripgrep before implementing; NO PLACEHOLDERS; commit each iteration; never self-declare "done" (the harness decides). `/omh-loop stop` halts.');
  }

  // --- Dynamic section (conventions — changes per project, placed last for cache) ---
  const cachePath = join(omhDir(root), 'conventions.json');
  let conventionsBlock = '';
  try {
    if (existsSync(cachePath)) {
      const conv = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (conv.language) {
        const lines = [`### Conventions (auto-detected)`, `- Language: ${conv.language}`];
        if (conv.testFramework) lines.push(`- Test: ${conv.testFramework}`);
        if (conv.linter) lines.push(`- Linter: ${conv.linter}`);
        if (conv.formatter) lines.push(`- Formatter: ${conv.formatter}`);
        if (conv.buildTool) lines.push(`- Build: ${conv.buildTool}`);
        conventionsBlock = lines.join('\n');
      }
    }
  } catch {}

  if (conventionsBlock) {
    s.push('');
    s.push(conventionsBlock);
  }

  s.push('<!-- HARNESS:END -->');
  return s.join('\n');
}

function appendClaudeMd(root) {
  const mdPath = join(root, CLAUDE_MD);

  // Read config
  const configPath = join(omhDir(root), 'harness.config.json');
  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { config = {}; }

  const content = buildClaudeMdContent(root, config);

  // Ensure .claude dir exists
  mkdirSync(dirname(mdPath), { recursive: true });

  if (existsSync(mdPath)) {
    const existing = readFileSync(mdPath, 'utf8');
    if (existing.includes('<!-- HARNESS:START -->')) {
      // Replace existing block
      const replaced = existing.replace(
        /<!-- HARNESS:START -->[\s\S]*?<!-- HARNESS:END -->/,
        content.trim()
      );
      writeFileSync(mdPath, replaced);
    } else {
      // Append
      writeFileSync(mdPath, existing.trimEnd() + '\n\n' + content);
    }
  } else {
    writeFileSync(mdPath, content);
  }
}

// --- UPDATE ---
function updateClaude(root) {
  if (!existsSync(join(omhDir(root), 'harness.config.json'))) {
    console.error(`  ${WARN} oh-my-harness not initialized. Run: ${BOLD}oh-my-harness init${RESET}`);
    process.exit(1);
  }
  mergeSettings(root);
  appendClaudeMd(root);
  log(`  ${CHECK} oh-my-harness updated from config.`);
}

function codexInstalledAt(root, scope) {
  const installRoot = codexInstallRoot(root, scope);
  const hooksPath = join(installRoot, CODEX_HOOKS);
  if (!existsSync(hooksPath)) return false;
  try {
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
    return Object.values(hooks.hooks || {}).some(groups =>
      (groups || []).some(group => (group.hooks || []).some(isManagedCodexHook))
    );
  } catch {
    return false;
  }
}

function codexRegisteredAt(root, scope) {
  if (codexInstalledAt(root, scope)) return true;
  if (existsSync(codexOwnershipPath(root, scope))) return true;

  const configPath = join(codexInstallRoot(root, scope), CODEX_CONFIG);
  if (existsSync(configPath)) {
    const bounds = managedBlockBounds(
      readFileSync(configPath, 'utf8'),
      TOML_START,
      TOML_END,
    );
    if (bounds && !bounds.malformed) return true;
  }

  const guidancePath = codexGuidancePath(root, scope);
  if (existsSync(guidancePath)) {
    const bounds = managedBlockBounds(
      readFileSync(guidancePath, 'utf8'),
      AGENTS_START,
      AGENTS_END,
    );
    if (bounds && !bounds.malformed) return true;
  }
  return false;
}

function claudeInstalled(root) {
  const mdPath = join(root, CLAUDE_MD);
  if (existsSync(mdPath) && readFileSync(mdPath, 'utf8').includes(AGENTS_START)) return true;
  const settingsPath = join(root, SETTINGS_PROJECT);
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    return Object.values(settings.hooks || {}).some(groups =>
      (groups || []).some(group =>
        (group.hooks || []).some(handler => handler.command?.includes('.omh/hooks/'))
      )
    );
  } catch {
    return false;
  }
}

function selectedCodexScope(root) {
  const explicit = parseScope();
  if (explicit) return explicit;
  if (codexRegisteredAt(root, 'project')) return 'project';
  if (codexRegisteredAt(root, 'user')) return 'user';
  return 'project';
}

function updateCodex(root, scope) {
  if (!codexRegisteredAt(root, scope)) {
    console.error(
      `  ${WARN} oh-my-harness Codex runtime is not installed for ${scope} scope. `
      + `Run: ${BOLD}oh-my-harness init --runtime codex --scope ${scope}${RESET}`,
    );
    process.exitCode = 1;
    return false;
  }
  if (!existsSync(join(omhDir(codexStateRoot(root, scope)), 'harness.config.json'))) {
    console.error(`  ${WARN} oh-my-harness not initialized. Run: ${BOLD}oh-my-harness init --runtime codex${RESET}`);
    process.exitCode = 1;
    return false;
  }
  if (!refreshCodex(root, scope)) {
    process.exitCode = 1;
    return false;
  }
  if (scope === 'project') updateGitignore(root, 'add');
  log(`  ${CHECK} oh-my-harness Codex runtime updated from config.`);
  return true;
}

function update(root, runtime) {
  if (runtimeIncludes(runtime, 'claude')) updateClaude(root);
  if (runtimeIncludes(runtime, 'codex')) updateCodex(root, selectedCodexScope(root));
}

// --- STATUS ---
function statusClaude(root) {
  const configPath = join(omhDir(root), 'harness.config.json');
  if (!existsSync(configPath)) {
    log(`  ${WARN} oh-my-harness is not initialized in this project.`);
    return;
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  log(`\n  ${BOLD}oh-my-harness${RESET} ${DIM}v${getVersion()}${RESET}`);
  log('');

  log(`  ${BOLD}Features${RESET}`);
  for (const [k, v] of Object.entries(config.features || {})) {
    const icon = v ? `${GREEN}ON ${RESET}` : `${DIM}OFF${RESET}`;
    log(`    ${icon}  ${k}`);
  }

  log('');
  log(`  ${BOLD}Model Routing${RESET}`);
  for (const [k, v] of Object.entries(config.modelRouting || {})) {
    log(`    ${CYAN}${k}${RESET}: ${v}`);
  }

  log('');
  log(`  ${BOLD}Thresholds${RESET}`);
  log(`    Test min cases    : ${config.testEnforcement?.minCases || 2}`);
  log(`    Auto-plan trigger : ${config.autoPlan?.threshold || 3} tasks`);
  log(`    Ambiguity score   : ${config.ambiguityDetection?.threshold || 2}`);
  log('');
}

function runtimeInstallLabel(installed, scope) {
  if (!installed) return `${DIM}not installed${RESET}`;
  return `${GREEN}installed${RESET}${scope ? ` ${DIM}(${scope})${RESET}` : ''}`;
}

function statusRuntimes(root, runtime, scope) {
  const codexInstalled = codexInstalledAt(root, scope);
  const configPath = join(omhDir(codexStateRoot(root, scope)), 'harness.config.json');

  log(`\n  ${BOLD}oh-my-harness${RESET} ${DIM}v${getVersion()}${RESET}`);
  log('');
  log(`  ${BOLD}Runtimes${RESET}`);
  if (runtimeIncludes(runtime, 'claude')) {
    log(`    Claude: ${runtimeInstallLabel(claudeInstalled(root), 'project')}`);
  }
  if (runtimeIncludes(runtime, 'codex')) {
    log(`    Codex : ${runtimeInstallLabel(codexInstalled, codexInstalled ? scope : '')}`);
  }

  log('');
  log(`  ${BOLD}Shared Features${RESET}`);
  if (!existsSync(configPath)) {
    log(`    ${DIM}shared state not initialized${RESET}`);
    log('');
    return;
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  for (const [key, enabled] of Object.entries(config.features || {})) {
    const icon = enabled ? `${GREEN}ON ${RESET}` : `${DIM}OFF${RESET}`;
    log(`    ${icon}  ${key}`);
  }
  log('');
}

function status(root, runtime) {
  if (runtime === 'claude') statusClaude(root);
  else statusRuntimes(root, runtime, selectedCodexScope(root));
}

// --- RESET ---
function resetClaude(root, { preserveShared = false } = {}) {
  const omh = omhDir(root);
  if (existsSync(omh)) {
    if (preserveShared) {
      logInfo('Shared .claude/.omh/ state preserved for Codex');
    } else {
      rmSync(omh, { recursive: true });
      logDone('Removed .claude/.omh/');
    }
  }
  logInfo('Project skills (.claude/skills/) preserved — user-owned');
  // Remove commands
  const allCmds = [
    'set-harness.md', 'init-project.md',
    'agent-spawn.md', 'agent-status.md', 'agent-apply.md', 'agent-stop.md',
  ];
  for (const cmd of allCmds) {
    const p = join(root, COMMANDS_DIR, cmd);
    if (existsSync(p)) rmSync(p);
  }
  logDone('Removed harness commands');

  // Remove CLAUDE.md block
  const mdPath = join(root, CLAUDE_MD);
  if (existsSync(mdPath)) {
    const content = readFileSync(mdPath, 'utf8');
    if (content.includes('<!-- HARNESS:START -->')) {
      const cleaned = content.replace(
        /\n*<!-- HARNESS:START -->[\s\S]*?<!-- HARNESS:END -->\n*/,
        '\n'
      );
      writeFileSync(mdPath, cleaned.trim() + '\n');
      logDone('Cleaned CLAUDE.md harness block');
    }
  }

  // Clean hooks from settings.local.json
  cleanSettings(join(root, SETTINGS_PROJECT));

  // Also clean user settings if they have harness hooks
  if (!process.env.NODE_TEST_CONTEXT && !process.env.OMH_SKIP_GLOBAL) {
    cleanSettings(getUserSettingsPath());
  }
  logDone('Cleaned settings');

  // Clean .gitignore unless the shared state is still used by Codex
  if (preserveShared) {
    logInfo('.gitignore preserved for shared Codex state');
  } else {
    updateGitignore(root, 'remove');
    logDone('Cleaned .gitignore');
  }

  log(`\n  ${BOLD}oh-my-harness removed.${RESET}\n`);
}

function removeEmptyDirectory(dirPath) {
  if (existsSync(dirPath) && readdirSync(dirPath).length === 0) {
    rmSync(dirPath, { recursive: true });
  }
}

function cleanCodexHooksFile(hooksPath) {
  if (!existsSync(hooksPath)) return;
  let hooks;
  try {
    hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
  } catch {
    return;
  }

  for (const event of Object.keys(hooks.hooks || {})) {
    hooks.hooks[event] = withoutManagedCodexHooks(hooks.hooks[event]);
    if (hooks.hooks[event].length === 0) delete hooks.hooks[event];
  }
  if (hooks.hooks && Object.keys(hooks.hooks).length === 0) delete hooks.hooks;
  if (hooks.description?.startsWith('oh-my-harness Codex hooks')) delete hooks.description;

  if (Object.keys(hooks).length === 0) rmSync(hooksPath);
  else writeFileSync(hooksPath, JSON.stringify(hooks, null, 2) + '\n');
}

function resetCodex(root, scope, { preserveShared = false } = {}) {
  const installRoot = codexInstallRoot(root, scope);
  const codexRoot = join(installRoot, '.codex');
  const skillsRoot = join(installRoot, '.agents', 'skills');
  const ownershipResult = parseCodexOwnership(root, scope);
  const ownership = ownershipResult.ok
    ? ownershipResult.ownership
    : emptyCodexOwnership();

  cleanCodexHooksFile(join(installRoot, CODEX_HOOKS));
  removeManagedBlock(join(installRoot, CODEX_CONFIG), TOML_START, TOML_END);
  removeManagedBlock(codexGuidancePath(root, scope), AGENTS_START, AGENTS_END);

  for (const role of ownership.roles) {
    const rolePath = join(codexRoot, 'agents', `${role}.toml`);
    if (existsSync(rolePath)) rmSync(rolePath);
  }
  for (const skill of ownership.skills) {
    const skillPath = join(skillsRoot, skill);
    if (existsSync(skillPath)) rmSync(skillPath, { recursive: true });
  }
  const ownershipPath = codexOwnershipPath(root, scope);
  if (existsSync(ownershipPath)) rmSync(ownershipPath);

  removeEmptyDirectory(join(codexRoot, 'agents'));
  removeEmptyDirectory(codexRoot);
  removeEmptyDirectory(skillsRoot);
  removeEmptyDirectory(join(installRoot, '.agents'));

  const stateRoot = codexStateRoot(root, scope);
  const runtimeRoot = join(omhDir(stateRoot), 'runtime');
  if (existsSync(runtimeRoot)) rmSync(runtimeRoot, { recursive: true });

  if (!preserveShared && !claudeInstalled(root)) {
    const omh = omhDir(stateRoot);
    if (existsSync(omh)) rmSync(omh, { recursive: true });
    if (scope === 'project') updateGitignore(root, 'remove');
    logDone('Removed shared .claude/.omh/ state');
  } else {
    logInfo('Shared .claude/.omh/ state preserved for Claude');
  }

  logDone('Removed managed Codex hooks, roles, skills, and guidance');
  log(`\n  ${BOLD}oh-my-harness Codex runtime removed.${RESET}\n`);
}

function codexRegistrationUsesStateRoot(root, stateRoot) {
  return ['project', 'user'].some(scope =>
    codexRegisteredAt(root, scope)
    && resolve(codexStateRoot(root, scope)) === resolve(stateRoot)
  );
}

function reset(root, runtime) {
  if (runtime === 'claude') {
    resetClaude(root, {
      preserveShared: codexRegistrationUsesStateRoot(root, root),
    });
    return;
  }
  const scope = selectedCodexScope(root);
  if (runtime === 'codex') {
    resetCodex(root, scope);
    return;
  }
  resetCodex(root, scope, { preserveShared: true });
  resetClaude(root);
  const selectedSharedState = omhDir(codexStateRoot(root, scope));
  if (existsSync(selectedSharedState)) {
    rmSync(selectedSharedState, { recursive: true });
    logDone('Removed selected-scope shared .claude/.omh/ state');
  }
}

function cleanSettings(settingsPath) {
  if (!existsSync(settingsPath)) return;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    let changed = false;
    if (settings.hooks) {
      for (const event of Object.keys(settings.hooks)) {
        settings.hooks[event] = (settings.hooks[event] || []).filter(h =>
          !h.hooks?.some(hh => hh.command?.includes('.omh/hooks/'))
        );
        if (settings.hooks[event].length === 0) delete settings.hooks[event];
      }
      if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
      changed = true;
    }
    if (settings.agents) {
      for (const key of Object.keys(settings.agents)) {
        if (key.startsWith('harness:')) delete settings.agents[key];
      }
      if (Object.keys(settings.agents).length === 0) delete settings.agents;
      changed = true;
    }
    if (changed) {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    }
  } catch {}
}

// --- GITIGNORE ---
function updateGitignore(root, action) {
  const giPath = join(root, '.gitignore');
  const entry = '.claude/.omh/';
  if (action === 'add') {
    let content = '';
    if (existsSync(giPath)) {
      content = readFileSync(giPath, 'utf8');
      if (content.includes(entry)) return; // already present
    }
    const newline = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    writeFileSync(giPath, content + newline + `\n# oh-my-harness\n${entry}\n`);
  } else if (action === 'remove') {
    if (!existsSync(giPath)) return;
    let content = readFileSync(giPath, 'utf8');
    content = content.replace(/\n?# oh-my-harness\n\.claude\/\.omh\/\n?/g, '\n');
    writeFileSync(giPath, content.trim() + '\n');
  }
}

// --- MAIN ---
function showHelp() {
  log(`
  ${BOLD}oh-my-harness${RESET} ${DIM}v${getVersion()}${RESET} — Lightweight Claude Code and Codex harness

  ${BOLD}Usage${RESET}
    oh-my-harness init ${DIM}[--runtime claude|codex|both] [--scope project|user]${RESET}
    oh-my-harness update ${DIM}[--runtime claude|codex|both]${RESET}
    oh-my-harness status ${DIM}[--runtime claude|codex|both]${RESET}
    oh-my-harness usage ${DIM}[--verbose]${RESET}               Show tool statistics
    oh-my-harness reset ${DIM}[--runtime claude|codex|both]${RESET}

  ${BOLD}Skill Scaffolding${RESET}
    On init, project-specific skills (code-review, test-write, lint-fix) are
    scaffolded for the selected runtime based on detected language/framework.
    Disable with: ${DIM}oh-my-harness set features.skillScaffolding false${RESET}

  ${BOLD}Options${RESET}
    --runtime claude|codex|both
                      ${DIM}Select runtime registrations (default: claude)${RESET}
    --scope project   ${DIM}Install runtime files in this project (default)${RESET}
    --scope user      ${DIM}Install runtime registrations in the user home${RESET}
    --global          ${DIM}Shorthand for --scope user${RESET}
    --version, -v     ${DIM}Show version number${RESET}
    --help, -h        ${DIM}Show this help message${RESET}
`);
}

// --- USAGE ---
function usage(root) {
  const usagePath = join(omhDir(root), 'usage.json');
  if (!existsSync(usagePath)) {
    log(`  ${DIM}No usage data found. Usage tracking will start in your next session.${RESET}`);
    return;
  }
  try {
    const data = JSON.parse(readFileSync(usagePath, 'utf8'));
    const sessions = data.sessions || {};
    const sessionIds = Object.keys(sessions);
    log(`\n  ${BOLD}oh-my-harness${RESET} ${DIM}usage statistics${RESET}\n`);
    log(`  Total sessions   : ${BOLD}${sessionIds.length}${RESET}`);
    log(`  Total tool calls : ${BOLD}${data.total_calls || 0}${RESET}`);

    // Aggregate tool counts
    const totals = {};
    for (const s of Object.values(sessions)) {
      for (const [tool, count] of Object.entries(s.tool_counts || {})) {
        totals[tool] = (totals[tool] || 0) + count;
      }
    }
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      log(`\n  ${BOLD}Top tools${RESET}`);
      for (const [tool, count] of sorted.slice(0, 10)) {
        log(`    ${CYAN}${tool}${RESET}: ${count}`);
      }
    }

    if (args.includes('--verbose') && sessionIds.length > 0) {
      log(`\n  ${BOLD}Per-session breakdown${RESET}`);
      for (const [id, s] of Object.entries(sessions).slice(-5)) {
        log(`\n    ${DIM}Session ${id}${RESET}`);
        log(`      Started: ${s.started || 'unknown'}`);
        log(`      Calls: ${s.total || 0}`);
        for (const [tool, count] of Object.entries(s.tool_counts || {})) {
          log(`        ${tool}: ${count}`);
        }
      }
    }
    log('');
  } catch {
    console.error(`  ${WARN} Failed to read usage data.`);
  }
}

// --- ENTRY ---
const root = projectRoot();
const runtime = parseRuntime(args);
switch (command) {
  case 'init': {
    const configExists = existsSync(join(omhDir(root), 'harness.config.json'));
    let scope = parseScope();
    if (!scope) {
      if (configExists || !process.stdin.isTTY || process.env.NODE_TEST_CONTEXT || process.env.OMH_SKIP_GLOBAL) {
        scope = 'project';
      } else {
        scope = await promptScope();
      }
    }
    await init(root, scope, runtime);
    break;
  }
  case 'update':
    update(root, runtime);
    break;
  case 'status':
    status(root, runtime);
    break;
  case 'usage':
    usage(root);
    break;
  case 'reset':
    reset(root, runtime);
    break;
  case '--version':
  case '-v':
    console.log(getVersion());
    break;
  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;
  default:
    console.error(`  ${WARN} Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
