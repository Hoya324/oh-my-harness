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
  chmodSync,
} from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createInterface } from 'readline';
import { parse as parseToml } from 'smol-toml';
import { scaffoldProjectSkills } from '../lib/scaffold-skills.mjs';
import { parseRuntime, parseScope, runtimeIncludes } from '../lib/runtime.mjs';

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
const CODEX_SKILL_ASSETS = [
  {
    path: '.agents/references/runtime-map.md',
    source: ['codex', 'references', 'runtime-map.md'],
  },
  {
    path: 'templates/harness.config.json.tmpl',
    source: ['templates', 'harness.config.json.tmpl'],
  },
];
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

function installClaudeHookRuntime(root, scope) {
  const stateRoot = claudeStateRoot(root, scope);
  const omh = omhDir(stateRoot);
  const hooksDir = join(omh, 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  const hookLibDir = join(hooksDir, 'lib');
  const runtimeLibDir = join(omh, 'lib');
  mkdirSync(hookLibDir, { recursive: true });
  mkdirSync(runtimeLibDir, { recursive: true });
  cpSync(join(PKG_ROOT, 'hooks', 'lib', 'output.mjs'), join(hookLibDir, 'output.mjs'));
  cpSync(join(PKG_ROOT, 'hooks', 'lib', 'dictionary.mjs'), join(hookLibDir, 'dictionary.mjs'));
  cpSync(join(PKG_ROOT, 'hooks', 'lib', 'hook-config.mjs'), join(hookLibDir, 'hook-config.mjs'));
  cpSync(join(PKG_ROOT, 'hooks', 'lib', 'tier.mjs'), join(hookLibDir, 'tier.mjs'));
  cpSync(join(PKG_ROOT, 'lib', 'detect.mjs'), join(hookLibDir, 'detect.mjs'));
  cpSync(join(PKG_ROOT, 'lib', 'config.mjs'), join(runtimeLibDir, 'config.mjs'));
  cpSync(join(PKG_ROOT, 'lib', 'state.mjs'), join(runtimeLibDir, 'state.mjs'));
  const allHooks = [
    'session-start.mjs', 'pre-prompt.mjs', 'post-task.mjs',
    'dangerous-guard.mjs', 'pre-compact.mjs', 'commit-convention.mjs',
    'scope-guard.mjs', 'usage-tracker.mjs',
  ];
  for (const hook of allHooks) {
    cpSync(join(PKG_ROOT, 'hooks', hook), join(hooksDir, hook));
  }
  cpSync(join(PKG_ROOT, 'hooks', 'hook-gate.sh'), join(hooksDir, 'hook-gate.sh'));
}

// --- INIT ---
async function initClaude(root, scope) {
  const installRoot = claudeInstallRoot(root, scope);
  const stateRoot = claudeStateRoot(root, scope);
  const omh = omhDir(stateRoot);
  const cmdDir = join(installRoot, COMMANDS_DIR);
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
  mkdirSync(cmdDir, { recursive: true });

  const configDest = join(omh, 'harness.config.json');
  if (!existsSync(configDest)) {
    writeFileAtomic(
      configDest,
      readFileSync(join(PKG_ROOT, 'templates', 'harness.config.json.tmpl'), 'utf8'),
    );
    logDone('Created harness.config.json');
  } else {
    logDone('Config preserved (existing)');
  }

  // Step 2: Hooks
  logStep(2, totalSteps, 'Hooks');
  installClaudeHookRuntime(root, scope);
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
  appendClaudeMd(root, scope);
  logDone('Harness instructions injected');

  // Step 6: .gitignore
  logStep(6, totalSteps, '.gitignore');
  if (scope === 'project') {
    updateGitignore(root, 'add');
    logDone('.claude/.omh/ added to .gitignore');
  } else {
    logInfo('User-scoped state is outside the project; .gitignore unchanged');
  }

  // Step 7: HUD
  logStep(7, totalSteps, 'HUD Status Line');
  installHud(root, scope);
  logDone('Status line configured');

  // Step 8: Project Skills
  logStep(8, totalSteps, 'Project Skills');
  const configForSkills = JSON.parse(readFileSync(join(omh, 'harness.config.json'), 'utf8'));
  if (configForSkills.features?.skillScaffolding !== false) {
    const skillsDir = join(installRoot, '.claude', 'skills');
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
      const result = scaffoldProjectSkills(installRoot, conventions);
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
  const configLabel = scope === 'user'
    ? join(getUserHome(), '.claude', '.omh', 'harness.config.json')
    : '.claude/.omh/harness.config.json';
  log(`  ${DIM}Config ${RESET} ${configLabel}`);
  log(`  ${DIM}Scope  ${RESET} ${scopeLabel}`);
  log(`  ${DIM}Hooks  ${RESET} 8 active (6 events)`);
  log(`  ${DIM}Skills ${RESET} ${scope === 'user' ? 'user' : 'project'} skills in .claude/skills/`);
  log(`  ${DIM}Agents ${RESET} haiku / sonnet / opus`);
  log('');
  log(`  ${DIM}Use ${RESET}${BOLD}/set-harness${RESET}${DIM} to customize anytime.${RESET}`);
  log('');
}

function scopedInstallRoot(root, scope) {
  return scope === 'user' ? getUserHome() : root;
}

function claudeInstallRoot(root, scope) {
  return scopedInstallRoot(root, scope);
}

function claudeStateRoot(root, scope) {
  return scopedInstallRoot(root, scope);
}

function codexInstallRoot(root, scope) {
  return scopedInstallRoot(root, scope);
}

function codexStateRoot(root, scope) {
  return scopedInstallRoot(root, scope);
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

function writeFileAtomic(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, content);
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (existsSync(temporaryPath)) rmSync(temporaryPath);
    throw error;
  }
}

function renderManagedBlock(existing, block, startMarker, endMarker) {
  const normalized = block.trim();
  const bounds = managedBlockBounds(existing, startMarker, endMarker);
  if (bounds?.malformed) return null;
  if (bounds) {
    return existing.slice(0, bounds.start) + normalized + existing.slice(bounds.end);
  }
  const separator = existing.length === 0
    ? ''
    : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return existing + separator + normalized + '\n';
}

function upsertManagedBlock(filePath, block, startMarker, endMarker) {
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const rendered = renderManagedBlock(existing, block, startMarker, endMarker);
  if (rendered === null) {
    console.error(`  ${WARN} Preserved ${filePath}: incomplete oh-my-harness markers.`);
    return false;
  }
  writeFileAtomic(filePath, rendered);
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
  if (!existsSync(configDest)) {
    writeFileAtomic(
      configDest,
      readFileSync(join(PKG_ROOT, 'templates', 'harness.config.json.tmpl'), 'utf8'),
    );
    return 'created';
  }
  return 'preserved';
}

function installCodexRuntime(root, scope) {
  const runtimeRoot = join(omhDir(codexStateRoot(root, scope)), 'runtime');
  const runtimeBin = join(runtimeRoot, 'bin');
  mkdirSync(runtimeRoot, { recursive: true });
  cpSync(join(PKG_ROOT, 'hooks'), join(runtimeRoot, 'hooks'), {
    recursive: true,
    force: true,
  });
  cpSync(join(PKG_ROOT, 'lib'), join(runtimeRoot, 'lib'), {
    recursive: true,
    force: true,
  });
  mkdirSync(runtimeBin, { recursive: true });
  const memoryLauncher = join(runtimeBin, 'omh-memory.sh');
  cpSync(join(PKG_ROOT, 'bin', 'omh-memory.sh'), memoryLauncher);
  chmodSync(memoryLauncher, 0o755);
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
  return { version: 1, roles: [], skills: [], assets: [] };
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
      || (parsed.assets !== undefined && !Array.isArray(parsed.assets))
    ) {
      return { ok: false, ownership: emptyCodexOwnership() };
    }
    const allowedRoles = new Set(CODEX_ROLES);
    const allowedSkills = new Set(managedCodexSkillNames());
    const allowedAssets = new Set(CODEX_SKILL_ASSETS.map(asset => asset.path));
    const assets = parsed.assets || [];
    if (
      parsed.roles.some(role => typeof role !== 'string' || !allowedRoles.has(role))
      || parsed.skills.some(skill => typeof skill !== 'string' || !allowedSkills.has(skill))
      || assets.some(asset => typeof asset !== 'string' || !allowedAssets.has(asset))
    ) {
      return { ok: false, ownership: emptyCodexOwnership() };
    }
    return {
      ok: true,
      ownership: {
        version: 1,
        roles: [...new Set(parsed.roles)].sort(),
        skills: [...new Set(parsed.skills)].sort(),
        assets: [...new Set(assets)].sort(),
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
    assets: [...new Set(ownership.assets)].sort(),
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

function installCodexSkillAssets(root, scope, ownership) {
  const installRoot = codexInstallRoot(root, scope);
  const owned = new Set(ownership.assets);
  for (const asset of CODEX_SKILL_ASSETS) {
    const destination = join(installRoot, asset.path);
    if (existsSync(destination) && !owned.has(asset.path)) continue;
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(PKG_ROOT, ...asset.source), destination);
    owned.add(asset.path);
  }
  ownership.assets = [...owned].sort();
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

function tomlError(message) {
  return new Error(`Invalid TOML: ${message}`);
}

function analyzeToml(content) {
  try {
    return parseToml(content);
  } catch (error) {
    throw tomlError(error.message);
  }
}

function tomlPathOccupied(content, analysis, path, declaration) {
  let current = analysis;
  for (const segment of path) {
    if (!isPlainObject(current)) return true;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      try {
        analyzeToml(`${content.trimEnd()}\n${declaration}\n`);
        return false;
      } catch {
        return true;
      }
    }
    current = current[segment];
  }
  return true;
}

function projectedCodexRoles(root, scope, ownership) {
  const rolesRoot = join(codexInstallRoot(root, scope), '.codex', 'agents');
  const projected = new Set(ownership.roles);
  for (const role of CODEX_ROLES) {
    const destination = join(rolesRoot, `${role}.toml`);
    if (!existsSync(destination) || projected.has(role)) projected.add(role);
  }
  return { ...ownership, roles: [...projected].sort() };
}

function codexConfigCandidate(root, scope, ownership) {
  const configPath = join(codexInstallRoot(root, scope), CODEX_CONFIG);
  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  const userOwned = withoutBlock(existing, TOML_START, TOML_END);
  const analysis = analyzeToml(userOwned);
  const descriptions = {
    quick: 'Fast read-only lookup, search, and narrow exploration.',
    standard: 'Focused implementation, testing, debugging, and review.',
    architect: 'Architecture, complex planning, security review, and independent verification.',
  };
  const lines = [TOML_START];
  const memoryLauncher = join(
    omhDir(codexStateRoot(root, scope)),
    'runtime',
    'bin',
    'omh-memory.sh',
  );
  const memoryDeclaration = [
    '[mcp_servers.omh-memory]',
    'command = "bash"',
    `args = [${JSON.stringify(memoryLauncher)}]`,
  ].join('\n');
  if (!tomlPathOccupied(
    userOwned,
    analysis,
    ['mcp_servers', 'omh-memory'],
    memoryDeclaration,
  )) {
    lines.push('');
    lines.push(memoryDeclaration);
  }
  for (const role of CODEX_ROLES) {
    if (!ownership.roles.includes(role)) continue;
    const roleDeclaration = [
      `[agents.${role}]`,
      `description = ${JSON.stringify(descriptions[role])}`,
      'config_file = "agents/' + role + '.toml"',
    ].join('\n');
    if (tomlPathOccupied(userOwned, analysis, ['agents', role], roleDeclaration)) continue;
    lines.push('');
    lines.push(roleDeclaration);
  }
  lines.push(TOML_END);
  const candidate = renderManagedBlock(
    existing,
    lines.join('\n'),
    TOML_START,
    TOML_END,
  );
  if (candidate === null) throw tomlError('incomplete oh-my-harness markers');
  analyzeToml(candidate);
  return candidate;
}

function mergeCodexConfig(root, scope, ownership) {
  const configPath = join(codexInstallRoot(root, scope), CODEX_CONFIG);
  try {
    writeFileAtomic(configPath, codexConfigCandidate(root, scope, ownership));
    return true;
  } catch (error) {
    console.error(`  ${WARN} Preserved ${configPath}: ${error.message}.`);
    return false;
  }
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

function harnessConfigPath(root, scope) {
  return join(omhDir(codexStateRoot(root, scope)), 'harness.config.json');
}

function parseHarnessConfigFile(filePath) {
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!isPlainObject(parsed)) throw new Error('top level must be an object');
  if (parsed.features !== undefined && !isPlainObject(parsed.features)) {
    throw new Error('features must be an object');
  }
  return parsed;
}

function validateHarnessConfig(root, scope, { allowMissing = false } = {}) {
  const configPath = harnessConfigPath(root, scope);
  if (!existsSync(configPath)) {
    if (!allowMissing) {
      console.error(`  ${WARN} oh-my-harness is not initialized at ${configPath}.`);
      return false;
    }
    try {
      parseHarnessConfigFile(join(PKG_ROOT, 'templates', 'harness.config.json.tmpl'));
      return true;
    } catch (error) {
      console.error(`  ${WARN} Bundled safe harness config is invalid: ${error.message}.`);
      return false;
    }
  }
  try {
    parseHarnessConfigFile(configPath);
    return true;
  } catch (error) {
    console.error(`  ${WARN} Invalid harness.config.json at ${configPath}: ${error.message}.`);
    return false;
  }
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

function validateManagedMarkers(
  filePath,
  startMarker,
  endMarker,
  { runtimeName = 'Codex', operation = 'refresh' } = {},
) {
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
    `  ${WARN} Cannot ${operation} ${runtimeName}: incomplete oh-my-harness markers in ${filePath}.`,
  );
  return false;
}

function validateClaudeSettings(root, scope, operation = 'refresh') {
  const settingsPath = getSettingsPath(root, scope);
  if (!existsSync(settingsPath)) return true;
  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    console.error(`  ${WARN} Cannot ${operation} Claude: invalid settings JSON at ${settingsPath}.`);
    return false;
  }
  if (
    !isPlainObject(settings)
    || (settings.hooks !== undefined && !isPlainObject(settings.hooks))
    || (settings.agents !== undefined && !isPlainObject(settings.agents))
    || !validClaudeStatusLine(settings.statusLine)
  ) {
    console.error(`  ${WARN} Cannot ${operation} Claude: invalid settings structure at ${settingsPath}.`);
    return false;
  }
  for (const groups of Object.values(settings.hooks || {})) {
    if (
      !Array.isArray(groups)
      || groups.some(group =>
        !isPlainObject(group)
        || !Array.isArray(group.hooks)
        || group.hooks.some(hook =>
          !isPlainObject(hook)
          || (hook.command !== undefined && typeof hook.command !== 'string')
        )
      )
    ) {
      console.error(`  ${WARN} Cannot ${operation} Claude: invalid hooks structure at ${settingsPath}.`);
      return false;
    }
  }
  return true;
}

function validClaudeStatusLine(statusLine) {
  return statusLine === undefined
    || (
      isPlainObject(statusLine)
      && (statusLine.command === undefined || typeof statusLine.command === 'string')
    );
}

function validateClaudeHudSettings(root, scope, operation = 'refresh') {
  const settingsPath = getUserSettingsPath();
  if (!existsSync(settingsPath) || settingsPath === getSettingsPath(root, scope)) return true;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    if (!isPlainObject(settings)) throw new Error('top level must be an object');
    if (!validClaudeStatusLine(settings.statusLine)) {
      throw new Error('statusLine.command must be a string');
    }
    return true;
  } catch (error) {
    console.error(
      `  ${WARN} Cannot ${operation} Claude: invalid user HUD settings at `
      + `${settingsPath} (${error.message}).`,
    );
    return false;
  }
}

function preflightClaude(root, scope, operation = 'refresh') {
  if (!validateManagedMarkers(
    join(claudeInstallRoot(root, scope), CLAUDE_MD),
    AGENTS_START,
    AGENTS_END,
    { runtimeName: 'Claude', operation },
  )) return false;
  return validateClaudeSettings(root, scope, operation)
    && validateClaudeHudSettings(root, scope, operation);
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
  try {
    codexConfigCandidate(
      root,
      scope,
      projectedCodexRoles(root, scope, parsedOwnership.ownership),
    );
  } catch (error) {
    console.error(
      `  ${WARN} Cannot refresh Codex: invalid TOML at `
      + `${join(codexInstallRoot(root, scope), CODEX_CONFIG)} (${error.message}).`,
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
  installCodexSkillAssets(root, scope, ownership);
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
  if (
    (runtimeIncludes(runtime, 'claude') && !preflightClaude(root, scope, 'initialize'))
    || !validateHarnessConfig(root, scope, { allowMissing: true })
    || (runtimeIncludes(runtime, 'codex') && !preflightCodex(root, scope))
  ) {
    process.exitCode = 1;
    return false;
  }
  if (runtimeIncludes(runtime, 'claude')) await initClaude(root, scope);
  if (runtimeIncludes(runtime, 'codex')) await initCodex(root, scope);
  return process.exitCode !== 1;
}

// --- HUD ---
function installHud(root, scope = 'project') {
  const stateRoot = claudeStateRoot(root, scope);
  const hudSrc = join(PKG_ROOT, 'hud', 'omh-hud.mjs');
  const hudDest = join(omhDir(stateRoot), 'hud');
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
    const hudPath = join(omhDir(stateRoot), 'hud', 'omh-hud.mjs');
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
  const actualPath = getSettingsPath(root, scope);
  let settings = {};
  if (existsSync(actualPath)) {
    try { settings = JSON.parse(readFileSync(actualPath, 'utf8')); } catch {}
  }

  const hooksBase = scope === 'user'
    ? join(omhDir(claudeStateRoot(root, scope)), 'hooks')
    : '.claude/.omh/hooks';
  const hookPath = (file) => scope === 'user'
    ? shellQuote(join(hooksBase, file))
    : `${hooksBase}/${file}`;
  const gate = `bash ${hookPath('hook-gate.sh')}`;
  const gatedHook = (file, features) => `${gate} ${hookPath(file)} ${features}`;
  // 2-Stage Prompt Evaluation: bash pre-filter checks feature flag before spawning Node.
  // Format: bash hook-gate.sh <hook-script> <feature1> [feature2 ...]
  const harnessHooks = {
    SessionStart: [{
      matcher: '*',
      hooks: [{ type: 'command', command: gatedHook('session-start.mjs', 'conventionSetup'), timeout: 10 }],
    }],
    UserPromptSubmit: [{
      matcher: '*',
      hooks: [{ type: 'command', command: gatedHook('pre-prompt.mjs', 'autoPlanMode ambiguityDetection'), timeout: 3 }],
    }],
    PreToolUse: [{
      matcher: '*',
      hooks: [{ type: 'command', command: gatedHook('dangerous-guard.mjs', 'dangerousGuard'), timeout: 3 }],
    }],
    PostToolUse: [{
      matcher: '*',
      hooks: [
        { type: 'command', command: gatedHook('commit-convention.mjs', 'commitConvention'), timeout: 3 },
        { type: 'command', command: gatedHook('scope-guard.mjs', 'scopeGuard'), timeout: 3 },
        { type: 'command', command: gatedHook('usage-tracker.mjs', 'usageTracking'), timeout: 3 },
      ],
    }],
    PreCompact: [{
      matcher: '*',
      hooks: [{ type: 'command', command: gatedHook('pre-compact.mjs', 'contextSnapshot'), timeout: 5 }],
    }],
    Stop: [{
      matcher: '*',
      hooks: [{ type: 'command', command: gatedHook('post-task.mjs', 'testEnforcement'), timeout: 5 }],
    }],
  };

  // Read config for model routing
  const configPath = harnessConfigPath(root, scope);
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

function appendClaudeMd(root, scope = 'project') {
  const installRoot = claudeInstallRoot(root, scope);
  const stateRoot = claudeStateRoot(root, scope);
  const mdPath = join(installRoot, CLAUDE_MD);

  // Read config
  const configPath = harnessConfigPath(root, scope);
  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { config = {}; }

  const content = buildClaudeMdContent(stateRoot, config);

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
function updateClaude(root, scope = 'project') {
  if (!claudeInstalledAt(root, scope)) {
    console.error(`  ${WARN} oh-my-harness not initialized. Run: ${BOLD}oh-my-harness init${RESET}`);
    process.exitCode = 1;
    return false;
  }
  ensureSharedConfig(root, scope);
  installClaudeHookRuntime(root, scope);
  mergeSettings(root, scope);
  appendClaudeMd(root, scope);
  log(`  ${CHECK} oh-my-harness updated from config.`);
  return true;
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

function claudeInstalledAt(root, scope) {
  const installRoot = claudeInstallRoot(root, scope);
  const mdPath = join(installRoot, CLAUDE_MD);
  if (existsSync(mdPath) && readFileSync(mdPath, 'utf8').includes(AGENTS_START)) return true;
  const settingsPath = getSettingsPath(root, scope);
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

function claudeInstalled(root) {
  return claudeInstalledAt(root, 'project');
}

function selectedCodexScope(root) {
  if (requestedScope) return requestedScope;
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
  ensureSharedConfig(root, scope);
  if (!refreshCodex(root, scope)) {
    process.exitCode = 1;
    return false;
  }
  if (scope === 'project') updateGitignore(root, 'add');
  log(`  ${CHECK} oh-my-harness Codex runtime updated from config.`);
  return true;
}

function update(root, runtime) {
  const claudeScope = requestedScope || 'project';
  const codexScope = requestedScope || selectedCodexScope(root);
  if (runtimeIncludes(runtime, 'claude') && !claudeInstalledAt(root, claudeScope)) {
    console.error(`  ${WARN} oh-my-harness not initialized. Run: ${BOLD}oh-my-harness init${RESET}`);
    process.exitCode = 1;
    return false;
  }
  if (runtimeIncludes(runtime, 'codex') && !codexRegisteredAt(root, codexScope)) {
    console.error(
      `  ${WARN} oh-my-harness Codex runtime is not installed for ${codexScope} scope. `
      + `Run: ${BOLD}oh-my-harness init --runtime codex --scope ${codexScope}${RESET}`,
    );
    process.exitCode = 1;
    return false;
  }
  if (runtimeIncludes(runtime, 'claude') && !preflightClaude(root, claudeScope, 'refresh')) {
    process.exitCode = 1;
    return false;
  }
  const configScopes = new Set();
  if (runtimeIncludes(runtime, 'claude')) configScopes.add(claudeScope);
  if (runtimeIncludes(runtime, 'codex')) configScopes.add(codexScope);
  for (const scope of configScopes) {
    if (!validateHarnessConfig(root, scope, { allowMissing: true })) {
      process.exitCode = 1;
      return false;
    }
  }
  if (runtimeIncludes(runtime, 'codex') && !preflightCodex(root, codexScope)) {
    process.exitCode = 1;
    return false;
  }
  if (runtimeIncludes(runtime, 'claude')) updateClaude(root, claudeScope);
  if (runtimeIncludes(runtime, 'codex')) updateCodex(root, codexScope);
  return process.exitCode !== 1;
}

// --- STATUS ---
function statusClaude(root, scope = 'project') {
  const configPath = harnessConfigPath(root, scope);
  if (!existsSync(configPath)) {
    log(`  ${WARN} oh-my-harness is not initialized for ${scope} scope.`);
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

function statusRuntimes(root, runtime, claudeScope, codexScope) {
  const codexInstalled = codexInstalledAt(root, codexScope);
  const configScope = runtimeIncludes(runtime, 'codex') ? codexScope : claudeScope;
  const configPath = harnessConfigPath(root, configScope);

  log(`\n  ${BOLD}oh-my-harness${RESET} ${DIM}v${getVersion()}${RESET}`);
  log('');
  log(`  ${BOLD}Runtimes${RESET}`);
  if (runtimeIncludes(runtime, 'claude')) {
    log(`    Claude: ${runtimeInstallLabel(claudeInstalledAt(root, claudeScope), claudeScope)}`);
  }
  if (runtimeIncludes(runtime, 'codex')) {
    log(`    Codex : ${runtimeInstallLabel(codexInstalled, codexInstalled ? codexScope : '')}`);
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
  const claudeScope = requestedScope || 'project';
  const codexScope = requestedScope || selectedCodexScope(root);
  if (runtime === 'claude') statusClaude(root, claudeScope);
  else statusRuntimes(root, runtime, claudeScope, codexScope);
}

// --- RESET ---
function resetClaude(root, scope = 'project', { preserveShared = false } = {}) {
  const installRoot = claudeInstallRoot(root, scope);
  const stateRoot = claudeStateRoot(root, scope);
  const omh = omhDir(stateRoot);
  if (existsSync(omh)) {
    if (preserveShared) {
      logInfo('Shared .claude/.omh/ state preserved for Codex');
    } else {
      rmSync(omh, { recursive: true });
      logDone('Removed .claude/.omh/');
    }
  }
  logInfo(`${scope === 'user' ? 'User' : 'Project'} skills (.claude/skills/) preserved — user-owned`);
  // Remove commands
  const allCmds = [
    'set-harness.md', 'init-project.md',
    'agent-spawn.md', 'agent-status.md', 'agent-apply.md', 'agent-stop.md',
  ];
  for (const cmd of allCmds) {
    const p = join(installRoot, COMMANDS_DIR, cmd);
    if (existsSync(p)) rmSync(p);
  }
  logDone('Removed harness commands');

  // Remove CLAUDE.md block
  const mdPath = join(installRoot, CLAUDE_MD);
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

  cleanSettings(getSettingsPath(root, scope));
  cleanHudSetting(getUserSettingsPath(), stateRoot);
  logDone('Cleaned settings');

  // Clean .gitignore unless the shared state is still used by Codex
  if (scope !== 'project') {
    logInfo('Project .gitignore unchanged for user-scoped reset');
  } else if (preserveShared) {
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
  for (const asset of ownership.assets) {
    const assetPath = join(installRoot, asset);
    if (existsSync(assetPath)) rmSync(assetPath);
  }
  const ownershipPath = codexOwnershipPath(root, scope);
  if (existsSync(ownershipPath)) rmSync(ownershipPath);

  removeEmptyDirectory(join(codexRoot, 'agents'));
  removeEmptyDirectory(codexRoot);
  removeEmptyDirectory(skillsRoot);
  removeEmptyDirectory(join(installRoot, '.agents', 'references'));
  removeEmptyDirectory(join(installRoot, '.agents'));
  removeEmptyDirectory(join(installRoot, 'templates'));

  const stateRoot = codexStateRoot(root, scope);
  const runtimeRoot = join(omhDir(stateRoot), 'runtime');
  if (existsSync(runtimeRoot)) rmSync(runtimeRoot, { recursive: true });

  if (!preserveShared && !claudeInstalledAt(root, scope)) {
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
  const scope = requestedScope || (runtimeIncludes(runtime, 'codex')
    ? selectedCodexScope(root)
    : 'project');
  if (
    (runtimeIncludes(runtime, 'claude') && !preflightClaude(root, scope, 'reset'))
    || (runtimeIncludes(runtime, 'codex') && !preflightCodex(root, scope))
  ) {
    process.exitCode = 1;
    return false;
  }

  if (runtime === 'claude') {
    const stateRoot = claudeStateRoot(root, scope);
    resetClaude(root, scope, {
      preserveShared: codexRegistrationUsesStateRoot(root, stateRoot),
    });
    return true;
  }
  if (runtime === 'codex') {
    resetCodex(root, scope);
    return true;
  }
  resetCodex(root, scope, { preserveShared: true });
  resetClaude(root, scope, {
    preserveShared: codexRegistrationUsesStateRoot(root, claudeStateRoot(root, scope)),
  });
  const selectedStateRoot = codexStateRoot(root, scope);
  const selectedSharedState = omhDir(selectedStateRoot);
  if (existsSync(selectedSharedState)) {
    if (codexRegistrationUsesStateRoot(root, selectedStateRoot)) {
      logInfo('Selected-scope shared .claude/.omh/ state preserved for remaining Codex');
    } else {
      rmSync(selectedSharedState, { recursive: true });
      logDone('Removed selected-scope shared .claude/.omh/ state');
    }
  }
  return true;
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

function cleanHudSetting(settingsPath, stateRoot) {
  if (!existsSync(settingsPath)) return;
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const managedHud = join(omhDir(stateRoot), 'hud', 'omh-hud.mjs');
  if (
    typeof settings.statusLine?.command !== 'string'
    || !settings.statusLine.command.includes(managedHud)
  ) return;
  delete settings.statusLine;
  writeFileAtomic(settingsPath, JSON.stringify(settings, null, 2) + '\n');
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
    oh-my-harness update ${DIM}[--runtime claude|codex|both] [--scope project|user]${RESET}
    oh-my-harness status ${DIM}[--runtime claude|codex|both] [--scope project|user]${RESET}
    oh-my-harness usage ${DIM}[--verbose]${RESET}               Show tool statistics
    oh-my-harness reset ${DIM}[--runtime claude|codex|both] [--scope project|user]${RESET}

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
let runtime;
let requestedScope;
try {
  runtime = parseRuntime(args);
  requestedScope = parseScope(args);
} catch (error) {
  console.error(`  ${WARN} ${error.message}`);
  process.exit(1);
}
switch (command) {
  case 'init': {
    const configExists = existsSync(join(omhDir(root), 'harness.config.json'));
    let scope = requestedScope;
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
