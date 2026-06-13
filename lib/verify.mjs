/**
 * /omh-verify helpers — diff collection, model availability, lens rotation,
 * review-prompt construction. Pure/inspectable so they are unit-testable.
 */
import { spawnSync } from 'child_process';
import { reviewWithCodex } from './adapters/codex.mjs';
import { reviewWithGemini } from './adapters/gemini.mjs';

/** Is `cmd`'s first token an executable on PATH? */
export function isAvailable(cmd) {
  const bin = String(cmd || '').trim().split(/\s+/)[0];
  if (!bin) return false;
  const r = spawnSync('which', [bin], { encoding: 'utf8' });
  return r.status === 0;
}

/** Keep claude/native lenses always; drop external lenses whose CLI is absent. */
export function availableLenses(lenses = []) {
  return lenses.filter((l) => {
    if (l.model === 'claude' || l.via === 'native-subagent') return true;
    return isAvailable(l.cmd || l.model);
  });
}

/** 1-indexed round → lens (rotation). Returns null if no lenses. */
export function selectLens(round, lenses = []) {
  if (!lenses.length) return null;
  return lenses[(round - 1) % lenses.length];
}

/** Compose an independent-review prompt for a single lens. */
export function buildReviewPrompt({ diff, spec = '', focus = 'correctness' }) {
  return [
    `You are an INDEPENDENT code reviewer. Review focus: ${focus}.`,
    spec ? `Task spec / intent:\n${spec}\n` : '',
    `Review ONLY the diff below. Report concrete, actionable issues as a numbered list (file:line where possible).`,
    `If and only if you find no real issues, respond with exactly: NO ISSUES FOUND.`,
    `\n--- DIFF ---\n${diff}`,
  ].filter(Boolean).join('\n');
}

/** git diff against `base` (default working tree vs HEAD). */
export function collectDiff({ base = 'HEAD', cwd = process.cwd() } = {}) {
  const r = spawnSync('git', ['diff', base], {
    cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : '';
}

/** Run one external lens against a prompt. Returns { ok, output, error }. */
export function runExternalLens(lens, prompt, opts = {}) {
  if (lens.via === 'codex' || lens.model === 'gpt') return reviewWithCodex(prompt, opts);
  if (lens.via === 'gemini' || lens.model === 'gemini') return reviewWithGemini(prompt, opts);
  return { ok: false, output: '', error: `unknown lens: ${lens.model}` };
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'plan') {
    const diff = collectDiff();
    console.log(JSON.stringify({ diffPresent: diff.length > 0, diffBytes: diff.length }, null, 2));
    return;
  }
  if (cmd === 'review') {
    const get = (flag, def) => {
      const i = argv.indexOf(flag);
      return i >= 0 ? argv[i + 1] : def;
    };
    const model = get('--model', 'gpt');
    const focus = get('--focus', 'correctness');
    const base = get('--base', 'HEAD');
    const diff = collectDiff({ base });
    if (!diff) { console.log('NO DIFF'); return; }
    const prompt = buildReviewPrompt({ diff, focus });
    const lens = { model, via: model === 'gemini' ? 'gemini' : 'codex' };
    const res = runExternalLens(lens, prompt);
    if (res.ok) {
      console.log(res.output);
    } else {
      // Surface the underlying CLI output so failures are diagnosable
      console.log(`LENS ERROR: ${res.error}\n${res.output}`.trimEnd());
    }
    return;
  }
  console.log('usage: verify.mjs <plan|review [--model gpt|gemini] [--focus X] [--base ref]>');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
