import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Builds CLAUDE.md content programmatically based on enabled features.
// Compressed text (~50% smaller), feature-conditional (Progressive Disclosure),
// and ordered static→dynamic for Anthropic prompt cache compatibility.
export function buildClaudeMdContent(root, config) {
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
  const cachePath = join(root, '.claude', '.omh', 'conventions.json');
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
