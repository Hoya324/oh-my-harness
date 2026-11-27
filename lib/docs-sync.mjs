/**
 * Opt-in pre-push docs sync.
 *
 * Hand-maintained docs drift (this repo shipped a 0.3.1 guidance block next to
 * a 0.5.0 package). Instructions like "update the docs when you change code"
 * depend on someone remembering; a git hook does not. On push, the hook hands
 * the branch's changed files to `claude -p` running the single-purpose
 * /omh-docs-sync skill. If that edits any docs, the push stops so the doc
 * change can be reviewed and committed with the code.
 *
 * Never installed implicitly: `oh-my-harness docs-sync --install`.
 */
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { execFileSync } from 'child_process';

export const MARKER = '# oh-my-harness:docs-sync';

export function prePushScript() {
  return `#!/bin/sh
${MARKER}
# Opt-in: installed by \`oh-my-harness docs-sync --install\`. Skip once with OMH_DOCS_SYNC=0.
[ "$OMH_DOCS_SYNC" = "0" ] && exit 0
command -v claude >/dev/null 2>&1 || { echo "[omh:docs-sync] claude CLI not found; skipping"; exit 0; }

base=$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null || echo origin/main)
changed=$(git diff --name-only "$base"...HEAD 2>/dev/null | grep -v -E '^(docs/|README|CHANGELOG)' || true)
[ -z "$changed" ] && exit 0

before=$(git status --porcelain -- docs README.md README.ko.md 2>/dev/null)
echo "[omh:docs-sync] checking docs for: $(echo "$changed" | wc -l | tr -d ' ') changed file(s)"
claude -p "/omh-docs-sync
Changed files on this branch:
$changed" --allowedTools "Read,Grep,Glob,Edit" >/dev/null 2>&1 || {
  echo "[omh:docs-sync] claude run failed; skipping (push continues)"; exit 0; }
after=$(git status --porcelain -- docs README.md README.ko.md 2>/dev/null)

if [ "$before" != "$after" ]; then
  echo "[omh:docs-sync] docs were updated for this change. Review, commit, and push again:"
  git status --short -- docs README.md README.ko.md
  exit 1
fi
exit 0
`;
}

function hooksDir(root) {
  try {
    const dir = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return join(root, dir);
  } catch { return null; }
}

/** @returns {{ok: boolean, path?: string, reason?: string}} */
export function installPrePush(root, { force = false } = {}) {
  const dir = hooksDir(root);
  if (!dir) return { ok: false, reason: 'not a git repository' };
  const path = join(dir, 'pre-push');
  if (existsSync(path) && !readFileSync(path, 'utf8').includes(MARKER) && !force) {
    return { ok: false, path, reason: 'a pre-push hook already exists and is not managed by oh-my-harness (use --force to replace it)' };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, prePushScript());
  chmodSync(path, 0o755);
  return { ok: true, path };
}

export function uninstallPrePush(root) {
  const dir = hooksDir(root);
  if (!dir) return { ok: false, reason: 'not a git repository' };
  const path = join(dir, 'pre-push');
  if (!existsSync(path)) return { ok: true, path };
  if (!readFileSync(path, 'utf8').includes(MARKER)) {
    return { ok: false, path, reason: 'pre-push hook is not managed by oh-my-harness; left untouched' };
  }
  rmSync(path);
  return { ok: true, path };
}
