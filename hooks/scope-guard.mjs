#!/usr/bin/env node
import { readFileSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import { hookPreToolDeny, hookSilent, hookDebug } from './lib/output.mjs';
import { loadConfig } from './lib/hook-config.mjs';

const projectRoot = resolve(process.env.PROJECT_PATH || process.cwd());

function readStdin() {
  const raw = readFileSync(0, 'utf8');
  try { return { ok: true, value: JSON.parse(raw) }; }
  catch { return { ok: false, value: null }; }
}

function extractApplyPatchTargets(command) {
  return [...String(command || '').matchAll(
    /^\*\*\* (?:Add|Update|Delete) File:[ \t]+(.+?)[ \t]*\r?$|^\*\*\* Move to:[ \t]+(.+?)[ \t]*\r?$/gm,
  )].map((match) => match[1] || match[2]);
}

function unquote(token) {
  const value = String(token || '').trim();
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value.replace(/\\([\\ "'`$])/g, '$1');
}

function shellTokens(segment) {
  return (String(segment).match(/"(?:\\.|[^"])*"|'[^']*'|[^\s]+/g) || [])
    .map(unquote);
}

function operands(tokens, start = 1) {
  return tokens.slice(start)
    .filter((token) => token !== '--' && !token.startsWith('-'))
    .filter((token) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token));
}

function redirectionTargets(command) {
  const targets = [];
  const re = /(?:^|[\s;|&])(?:\d*)>>?\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g;
  for (const match of String(command || '').matchAll(re)) {
    const target = match[1] || match[2] || match[3];
    if (target && target !== '/dev/null') targets.push(target);
  }
  return targets;
}

function commandMutationTargets(segment) {
  const tokens = shellTokens(segment);
  while (tokens[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
  if (tokens.length === 0) return [];
  const command = tokens[0].split(/[\\/]/).at(-1);

  if (['touch', 'mkdir', 'mkfifo', 'truncate', 'rm', 'rmdir', 'unlink'].includes(command)) {
    return operands(tokens);
  }
  if (['cp', 'mv', 'install', 'ln'].includes(command)) {
    return operands(tokens).slice(-1);
  }
  if (command === 'chmod' || command === 'chown' || command === 'chgrp') {
    return operands(tokens, 2);
  }
  if (command === 'tee') return operands(tokens);
  if (command === 'dd') {
    return tokens
      .filter((token) => token.startsWith('of='))
      .map((token) => token.slice(3))
      .filter(Boolean);
  }
  if (command === 'sed' && tokens.some((token) => /^-[^-]*i/.test(token))) {
    return operands(tokens, 2).slice(-1);
  }
  if (command === 'git') {
    const subcommandIndex = tokens.findIndex((token, index) =>
      index > 0 && !token.startsWith('-') && !tokens[index - 1]?.match(/^-C$/));
    const subcommand = tokens[subcommandIndex];
    if (subcommand === 'mv') return operands(tokens, subcommandIndex + 1).slice(-1);
    if (['restore', 'clean', 'checkout'].includes(subcommand)) {
      const separator = tokens.indexOf('--', subcommandIndex + 1);
      return separator >= 0
        ? tokens.slice(separator + 1).filter(Boolean)
        : operands(tokens, subcommandIndex + 1);
    }
  }
  return [];
}

function extractBashTargets(command, initialCwd) {
  const targets = redirectionTargets(command)
    .map((path) => ({ path, cwd: initialCwd }));
  let cwd = initialCwd;
  const segments = String(command || '').split(/&&|\|\||;|\r?\n/);
  for (const segment of segments) {
    const tokens = shellTokens(segment);
    if (tokens[0] === 'cd' && tokens[1]) {
      cwd = isAbsolute(tokens[1]) ? resolve(tokens[1]) : resolve(cwd, tokens[1]);
      continue;
    }
    for (const path of commandMutationTargets(segment)) targets.push({ path, cwd });
  }
  return targets;
}

const PATH_KEY = /^(?:path|file_path|filePath|filename|destination|destination_path|dest|target|target_path|directory|dir|source_path|sourcePath)$/;

function collectPathArguments(value, key = '', found = []) {
  if (value == null) return found;
  if (typeof value === 'string' && PATH_KEY.test(key)) {
    found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathArguments(item, key, found);
    return found;
  }
  if (typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) {
      collectPathArguments(child, childKey, found);
    }
  }
  return found;
}

function inputCwd(input, toolInput) {
  const candidate = input.cwd || input.working_directory ||
    toolInput.cwd || toolInput.workdir || toolInput.working_directory ||
    projectRoot;
  return isAbsolute(candidate) ? resolve(candidate) : resolve(projectRoot, candidate);
}

function absoluteTarget(target, cwd) {
  return isAbsolute(target) ? resolve(target) : resolve(cwd, target);
}

function within(base, target) {
  const rel = relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function displayPath(target) {
  const rel = relative(projectRoot, target);
  return rel || '.';
}

function deny(reason) {
  console.log(hookPreToolDeny(`[omh:scope-guard] ${reason}`));
}

try {
  if (process.env.DISABLE_HARNESS) {
    console.log(hookSilent());
    process.exit(0);
  }

  const config = loadConfig(projectRoot);
  const fallbackBoundary = !config;
  if (config?.features?.scopeGuard !== true && !fallbackBoundary) {
    console.log(hookSilent());
    process.exit(0);
  }

  // A missing/corrupt config gets a conservative but usable default: all paths
  // inside the project are allowed, traversal outside the project is denied.
  const allowedPaths = fallbackBoundary ? ['.'] : (config.scopeGuard?.allowedPaths || []);
  if (allowedPaths.length === 0) process.exit(0); // explicit empty policy = unrestricted
  const allowedRoots = allowedPaths.map((path) =>
    isAbsolute(path) ? resolve(path) : resolve(projectRoot, path));

  const parsedInput = readStdin();
  if (!parsedInput.ok) {
    deny('Denied because malformed input prevented the active scope policy from being evaluated.');
    process.exit(0);
  }

  const input = parsedInput.value || {};
  const toolName = input.tool_name || input.toolName || '';
  const toolInput = input.tool_input || input.toolInput || {};
  const cwd = inputCwd(input, toolInput);
  let candidates = [];

  if (['Edit', 'Write', 'NotebookEdit'].includes(toolName)) {
    const path = toolInput.file_path || toolInput.filePath || toolInput.path;
    if (path) candidates.push({ path, cwd });
  } else if (toolName === 'MultiEdit') {
    const direct = toolInput.file_path || toolInput.filePath || toolInput.path;
    if (direct) candidates.push({ path: direct, cwd });
    for (const edit of toolInput.edits || []) {
      const path = edit?.file_path || edit?.filePath || edit?.path;
      if (path) candidates.push({ path, cwd });
    }
  } else if (toolName === 'apply_patch') {
    candidates = extractApplyPatchTargets(toolInput.command).map((path) => ({ path, cwd }));
  } else if (toolName === 'Bash') {
    candidates = extractBashTargets(toolInput.command, cwd);
  } else if (
    toolName.startsWith('mcp__') &&
    /(?:filesystem|local[_-]?fs)/i.test(toolName) &&
    /(?:write|edit|create|update|delete|remove|move|rename|copy|upload|save|append|patch|mkdir)/i.test(toolName)
  ) {
    candidates = collectPathArguments(toolInput).map((path) => ({ path, cwd }));
    if (candidates.length === 0) {
      deny(`SCOPE WARNING: "${toolName}" is a filesystem mutation but exposes no auditable path.`);
      process.exit(0);
    }
  } else {
    process.exit(0);
  }

  const resolvedTargets = [...new Set(candidates
    .filter(({ path }) => typeof path === 'string' && path.trim())
    .map(({ path, cwd: candidateCwd }) => absoluteTarget(path, candidateCwd)))];
  const outOfScope = resolvedTargets.find((target) =>
    !allowedRoots.some((allowedRoot) => within(allowedRoot, target)));

  if (outOfScope) {
    deny(
      `SCOPE WARNING: "${displayPath(outOfScope)}" is outside the allowed scope ` +
      `[${allowedPaths.join(', ')}]. Confirm with the user that this modification is intended.`,
    );
  }
} catch (error) {
  hookDebug('scope-guard', error);
  deny('Denied because the active scope policy failed unexpectedly. Inspect the hook debug log and retry.');
}
