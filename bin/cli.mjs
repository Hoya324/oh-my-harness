#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const OMH_DIR = '.claude/.omh';
const COMMANDS_DIR = '.claude/commands';
const CLAUDE_MD = '.claude/CLAUDE.md';
const SETTINGS = '.claude/settings.local.json';

const [,, command, ...args] = process.argv;

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

// --- DUCK ---
function showDuck() {
  const duckPath = join(PKG_ROOT, 'lib', 'duck.sh');
  if (existsSync(duckPath)) {
    try { execSync(`bash "${duckPath}"`, { stdio: 'inherit' }); } catch {}
  }
}

// --- INIT ---
function init(root) {
  const omh = omhDir(root);
  const hooksDir = join(omh, 'hooks');
  const cmdDir = join(root, COMMANDS_DIR);
  const isFirstRun = !existsSync(join(omh, 'harness.config.json'));

  // Show duck welcome on first run
  if (isFirstRun) {
    showDuck();
    console.log('  Welcome to oh-my-harness!\n');
    console.log('  Smart defaults for Claude Code — test enforcement, guard rails,');
    console.log('  convention detection, and model routing, all in one harness.\n');
  }

  // Create directories
  mkdirSync(hooksDir, { recursive: true });
  mkdirSync(cmdDir, { recursive: true });

  // Copy config template
  const configDest = join(omh, 'harness.config.json');
  if (!existsSync(configDest)) {
    cpSync(join(PKG_ROOT, 'templates', 'harness.config.json.tmpl'), configDest);
    console.log('  created .claude/.omh/harness.config.json');
  } else {
    console.log('  exists  .claude/.omh/harness.config.json (kept)');
  }

  // Copy hooks + lib
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
  console.log('  copied  .claude/.omh/hooks/ (8 hooks + lib)');

  // Copy commands from skills (strip YAML frontmatter)
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
  console.log('  copied  .claude/commands/ (6 commands)');

  // Generate/update settings.local.json with hooks
  mergeSettings(root);
  console.log('  updated .claude/settings.local.json (hooks registered)');

  // Append CLAUDE.md block
  appendClaudeMd(root);
  console.log('  updated .claude/CLAUDE.md (harness block)');

  // Auto .gitignore
  updateGitignore(root, 'add');
  console.log('  updated .gitignore (.claude/.omh/ added)');

  // Install HUD (statusLine) — npm mode copies hud to .claude/.omh/hud/
  installHud(root);
  console.log('  installed HUD status line');

  console.log('\n  oh-my-harness initialized! Use /set-harness to configure.');
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
  const homedir = process.env.HOME || process.env.USERPROFILE || '';
  const userSettingsPath = join(homedir, '.claude', 'settings.json');
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
function mergeSettings(root) {
  const settingsPath = join(root, SETTINGS);
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch {}
  }

  const hooksBase = '.claude/.omh/hooks';
  const harnessHooks = {
    SessionStart: [{
      matcher: '*',
      hooks: [{ type: 'command', command: `node ${hooksBase}/session-start.mjs`, timeout: 10 }],
    }],
    UserPromptSubmit: [{
      matcher: '*',
      hooks: [{ type: 'command', command: `node ${hooksBase}/pre-prompt.mjs`, timeout: 3 }],
    }],
    PreToolUse: [{
      matcher: '*',
      hooks: [{ type: 'command', command: `node ${hooksBase}/dangerous-guard.mjs`, timeout: 3 }],
    }],
    PostToolUse: [{
      matcher: '*',
      hooks: [
        { type: 'command', command: `node ${hooksBase}/commit-convention.mjs`, timeout: 3 },
        { type: 'command', command: `node ${hooksBase}/scope-guard.mjs`, timeout: 3 },
        { type: 'command', command: `node ${hooksBase}/usage-tracker.mjs`, timeout: 3 },
      ],
    }],
    PreCompact: [{
      matcher: '*',
      hooks: [{ type: 'command', command: `node ${hooksBase}/pre-compact.mjs`, timeout: 5 }],
    }],
    Stop: [{
      matcher: '*',
      hooks: [{ type: 'command', command: `node ${hooksBase}/post-task.mjs`, timeout: 5 }],
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

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

// --- CLAUDE.MD ---
function appendClaudeMd(root) {
  const mdPath = join(root, CLAUDE_MD);
  const tmpl = readFileSync(join(PKG_ROOT, 'templates', 'CLAUDE.md.tmpl'), 'utf8');

  // Read config for template values
  const configPath = join(omhDir(root), 'harness.config.json');
  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { config = {}; }

  const minCases = config.testEnforcement?.minCases || 2;

  // Read conventions cache if available
  const cachePath = join(omhDir(root), 'conventions.json');
  let conventionsBlock = '';
  if (existsSync(cachePath)) {
    try {
      const conv = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (conv.language) {
        const lines = [`### Project Conventions (auto-detected)`, `- Language: ${conv.language}`];
        if (conv.testFramework) lines.push(`- Test: ${conv.testFramework}`);
        if (conv.linter) lines.push(`- Linter: ${conv.linter}`);
        if (conv.formatter) lines.push(`- Formatter: ${conv.formatter}`);
        if (conv.buildTool) lines.push(`- Build: ${conv.buildTool}`);
        conventionsBlock = lines.join('\n');
      }
    } catch {}
  }

  let content = tmpl
    .replace('{{minCases}}', String(minCases))
    .replace('{{conventionsBlock}}', conventionsBlock);

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
function update(root) {
  if (!existsSync(join(omhDir(root), 'harness.config.json'))) {
    console.error('  oh-my-harness not initialized. Run: oh-my-harness init');
    process.exit(1);
  }
  mergeSettings(root);
  appendClaudeMd(root);
  console.log('  oh-my-harness updated from config.');
}

// --- STATUS ---
function status(root) {
  const configPath = join(omhDir(root), 'harness.config.json');
  if (!existsSync(configPath)) {
    console.log('  oh-my-harness is not initialized in this project.');
    return;
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  console.log('  oh-my-harness status:');
  console.log(`  Features:`);
  for (const [k, v] of Object.entries(config.features || {})) {
    console.log(`    ${k}: ${v ? 'ON' : 'OFF'}`);
  }
  console.log(`  Model Routing:`);
  for (const [k, v] of Object.entries(config.modelRouting || {})) {
    console.log(`    ${k}: ${v}`);
  }
  console.log(`  Test Enforcement: min ${config.testEnforcement?.minCases || 2} cases`);
  console.log(`  Auto-Plan threshold: ${config.autoPlan?.threshold || 3} tasks`);
  console.log(`  Ambiguity threshold: ${config.ambiguityDetection?.threshold || 2}`);
}

// --- RESET ---
function reset(root) {
  const omh = omhDir(root);
  if (existsSync(omh)) {
    rmSync(omh, { recursive: true });
    console.log('  removed .claude/.omh/');
  }
  // Remove commands
  const allCmds = [
    'set-harness.md', 'init-project.md',
    'agent-spawn.md', 'agent-status.md', 'agent-apply.md', 'agent-stop.md',
  ];
  for (const cmd of allCmds) {
    const p = join(root, COMMANDS_DIR, cmd);
    if (existsSync(p)) rmSync(p);
  }
  console.log('  removed .claude/commands/ (all harness commands)');

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
      console.log('  cleaned CLAUDE.md harness block');
    }
  }

  // Clean hooks from settings.local.json
  const settingsPath = join(root, SETTINGS);
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      if (settings.hooks) {
        for (const event of Object.keys(settings.hooks)) {
          settings.hooks[event] = (settings.hooks[event] || []).filter(h =>
            !h.hooks?.some(hh => hh.command?.includes('.omh/hooks/'))
          );
          if (settings.hooks[event].length === 0) delete settings.hooks[event];
        }
        if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
      }
      if (settings.agents) {
        for (const key of Object.keys(settings.agents)) {
          if (key.startsWith('harness:')) delete settings.agents[key];
        }
        if (Object.keys(settings.agents).length === 0) delete settings.agents;
      }
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      console.log('  cleaned settings.local.json');
    } catch {}
  }

  // Clean .gitignore
  updateGitignore(root, 'remove');
  console.log('  cleaned .gitignore');

  console.log('\n  oh-my-harness removed.');
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
  console.log(`
  oh-my-harness v${getVersion()} — Lightweight Claude Code harness

  Usage:
    oh-my-harness init      Set up harness in current project
    oh-my-harness update    Regenerate settings from config
    oh-my-harness status    Show current configuration
    oh-my-harness usage     Show tool usage statistics
    oh-my-harness reset     Remove all harness files

  Options:
    --version, -v           Show version number
    --help, -h              Show this help message
`);
}

// --- USAGE ---
function usage(root) {
  const usagePath = join(omhDir(root), 'usage.json');
  if (!existsSync(usagePath)) {
    console.log('  No usage data found. Usage tracking will start in your next session.');
    return;
  }
  try {
    const data = JSON.parse(readFileSync(usagePath, 'utf8'));
    const sessions = data.sessions || {};
    const sessionIds = Object.keys(sessions);
    console.log('  oh-my-harness usage statistics:\n');
    console.log(`  Total sessions: ${sessionIds.length}`);
    console.log(`  Total tool calls: ${data.total_calls || 0}`);

    // Aggregate tool counts
    const totals = {};
    for (const s of Object.values(sessions)) {
      for (const [tool, count] of Object.entries(s.tool_counts || {})) {
        totals[tool] = (totals[tool] || 0) + count;
      }
    }
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      console.log('\n  Top tools:');
      for (const [tool, count] of sorted.slice(0, 10)) {
        console.log(`    ${tool}: ${count}`);
      }
    }

    if (args.includes('--verbose') && sessionIds.length > 0) {
      console.log('\n  Per-session breakdown:');
      for (const [id, s] of Object.entries(sessions).slice(-5)) {
        console.log(`\n    Session ${id}:`);
        console.log(`      Started: ${s.started || 'unknown'}`);
        console.log(`      Calls: ${s.total || 0}`);
        for (const [tool, count] of Object.entries(s.tool_counts || {})) {
          console.log(`        ${tool}: ${count}`);
        }
      }
    }
  } catch {
    console.error('  Failed to read usage data.');
  }
}

const root = projectRoot();
switch (command) {
  case 'init': {
    const configExists = existsSync(join(omhDir(root), 'harness.config.json'));
    if (configExists) {
      console.log('\n  Updating oh-my-harness...\n');
    }
    init(root);
    break;
  }
  case 'update':
    update(root);
    break;
  case 'status':
    status(root);
    break;
  case 'usage':
    usage(root);
    break;
  case 'reset':
    reset(root);
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
    console.error(`  Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
