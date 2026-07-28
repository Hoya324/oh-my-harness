import { basename } from 'path';

function unquote(token) {
  const value = String(token || '').trim();
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value.replace(/\\([\\ "'`$|;&])/g, '$1');
}

export function shellTokenDetails(segment) {
  return (String(segment).match(/"(?:\\.|[^"])*"|'[^']*'|\\.|[^\s]+/g) || [])
    .map((raw) => ({
      raw,
      value: unquote(raw),
      quoted: raw.startsWith('"') || raw.startsWith("'"),
    }));
}

export function shellTokens(segment) {
  return shellTokenDetails(segment).map(({ value }) => value);
}

export function unquotedShellText(command) {
  let text = '';
  let quote = null;
  let escaped = false;
  for (const char of String(command || '')) {
    if (escaped) {
      text += ' ';
      escaped = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      text += ' ';
      escaped = true;
      continue;
    }
    if (quote) {
      text += ' ';
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      text += ' ';
      continue;
    }
    text += char;
  }
  return text;
}

export function splitShellSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;
  let escaped = false;
  const source = String(command || '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ';' || char === '|' || char === '&' || char === '\n' || char === '\r') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      if ((char === '|' || char === '&') && source[index + 1] === char) index += 1;
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      continue;
    }
    current += char;
  }

  if (current.trim()) segments.push(current.trim());
  return segments;
}

function unwrapCommand(tokens) {
  if (tokens[0] !== 'command') return tokens;
  const remaining = tokens.slice(1);
  if (remaining[0] === '--') remaining.shift();
  if (remaining[0]?.startsWith('-')) return tokens;
  return remaining;
}

function unwrapEnv(tokens) {
  if (tokens[0] !== 'env') return tokens;
  const remaining = tokens.slice(1);
  while (remaining.length > 0) {
    const token = remaining[0];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      remaining.shift();
      continue;
    }
    if (token === '--') {
      remaining.shift();
      break;
    }
    if (!token.startsWith('-')) break;
    remaining.shift();
    if (['-u', '--unset', '-C', '--chdir', '-S', '--split-string'].includes(token)) {
      remaining.shift();
    }
  }
  return remaining;
}

export function normalizeShellCommand(segment) {
  let tokens = shellTokens(segment);
  while (tokens[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
  for (let depth = 0; depth < 4; depth += 1) {
    const executable = basename(tokens[0] || '');
    const normalized = [executable, ...tokens.slice(1)];
    const unwrapped = executable === 'command'
      ? unwrapCommand(normalized)
      : executable === 'env'
        ? unwrapEnv(normalized)
        : normalized;
    if (unwrapped === normalized) {
      return { executable, args: tokens.slice(1), tokens };
    }
    tokens = unwrapped;
  }
  return {
    executable: basename(tokens[0] || ''),
    args: tokens.slice(1),
    tokens,
  };
}
