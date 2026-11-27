/**
 * Feature profiles and evidence-based promotion.
 *
 * Start small: a fresh install turns on only the guards that pay off
 * immediately (safety, verification, conventions). More features are
 * suggested later from the Decision Log — when the data shows a need — rather
 * than switched on up front where nobody can tell which rule fired or why.
 */

export const PROFILE_NAMES = ['minimal', 'standard', 'full'];
export const DEFAULT_PROFILE = 'minimal';

const MINIMAL = [
  'dangerousGuard', 'verifyGate', 'conventionSetup', 'commitConvention', 'autoGitignore', 'stateSync',
];
const STANDARD = [
  ...MINIMAL,
  'testEnforcement', 'weightRouting', 'planGate', 'contextSnapshot', 'skillScaffolding', 'contextOptimization',
];

/** Features that protect against damage; never suggested for removal. */
const SAFETY = new Set(['dangerousGuard', 'verifyGate', 'scopeGuard']);

/** Feature -> the [omh:*] tags that show it doing something. */
export const FEATURE_TAGS = {
  autoPlanMode: ['omh:auto-plan'],
  ambiguityDetection: ['omh:ambiguity-guard'],
  weightRouting: ['omh:tier', 'omh:tier-3'],
  planGate: ['omh:plan-gate'],
  testEnforcement: ['omh:test-enforcement', 'omh:anti-rationalization'],
  commitConvention: ['omh:commit-convention'],
  contextSnapshot: ['omh:context-snapshot'],
};

/**
 * Return a copy of `config` with features set for `profile`. `full` keeps the
 * template defaults. Unknown keys and non-feature settings are untouched.
 */
export function applyProfile(config, profile) {
  if (!PROFILE_NAMES.includes(profile)) {
    throw new Error(`Unknown profile "${profile}". Use one of: ${PROFILE_NAMES.join(', ')}`);
  }
  const next = { ...config, features: { ...(config.features || {}) } };
  if (profile === 'full') return next;
  const on = new Set(profile === 'minimal' ? MINIMAL : STANDARD);
  for (const key of Object.keys(next.features)) next.features[key] = on.has(key);
  return next;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Suggest feature changes from recorded decisions. Pure; never mutates config.
 * @param {object[]} entries - Decision Log entries
 * @param {object} config
 * @param {{now?: number, quietDays?: number, blockThreshold?: number}} [opts]
 * @returns {{feature: string|null, action: 'enable'|'disable'|'tune', reason: string}[]}
 */
export function suggestProfileChanges(entries, config, { now = Date.now(), quietDays = 14, blockThreshold = 3 } = {}) {
  const features = (config && config.features) || {};
  const out = [];
  const times = entries.map((e) => Date.parse(e.ts)).filter(Number.isFinite);
  if (!times.length) return out;
  const span = now - Math.min(...times);
  const lastWeek = entries.filter((e) => now - Date.parse(e.ts) <= 7 * DAY);

  // Verify-gate keeps catching red changes: plan before editing.
  const gateBlocks = lastWeek.filter((e) => e.hook === 'verify-gate' && e.decision === 'block').length;
  if (gateBlocks >= blockThreshold && !features.planGate) {
    out.push({ feature: 'planGate', action: 'enable', reason: `verify-gate blocked ${gateBlocks} time(s) in 7 days; planning before edits may prevent rework` });
  }
  if (gateBlocks >= blockThreshold && !features.testEnforcement) {
    out.push({ feature: 'testEnforcement', action: 'enable', reason: `verify-gate blocked ${gateBlocks} time(s) in 7 days; test reminders catch gaps earlier` });
  }

  // A nudge that has not fired in `quietDays` costs context for nothing.
  if (span >= quietDays * DAY) {
    const recent = entries.filter((e) => now - Date.parse(e.ts) <= quietDays * DAY);
    const seen = new Set(recent.flatMap((e) => e.tags || []));
    for (const [feature, tags] of Object.entries(FEATURE_TAGS)) {
      if (!features[feature] || SAFETY.has(feature)) continue;
      if (!tags.some((t) => seen.has(t))) {
        out.push({ feature, action: 'disable', reason: `no ${tags[0]} in ${quietDays} days` });
      }
    }
  }

  // Users keep correcting the classifier: tune it rather than fight it.
  const routed = entries.filter((e) => e.event === 'UserPromptSubmit' && e.tier != null);
  const overridden = routed.filter((e) => e.override);
  if (routed.length >= 20 && overridden.length / routed.length > 0.3) {
    out.push({ feature: null, action: 'tune', reason: `${overridden.length}/${routed.length} prompts overrode the tier; review tier3.domainKeywords` });
  }
  return out;
}
