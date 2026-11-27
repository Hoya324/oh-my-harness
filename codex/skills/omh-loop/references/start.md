# Loop start: tier and activation

Read by `omh-loop` after the start gate passes.

## Tier

Choose the initial tier with this precedence:

1. A valid `--tier quick|standard|deep` argument overrides configuration.
2. A fixed `loop.classify` value of `quick`, `standard`, or `deep` selects that tier.
3. `loop.classify: auto` runs the evidence-based classifier below, starting from
   `loop.defaultTier` when evidence is inconclusive.

Use the selected configured tier object:

- `quick`: mechanical or one-file work; default `maxIterations: 3`,
  `maxWallClockMinutes: 5`, no cross-verifier.
- `standard`: normal features or bug fixes; defaults 8 iterations and 15 minutes, with a final
  cross-verifier.
- `deep`: architectural, security, migration, multi-module, at least five files, or at least six
  criteria; defaults 20 iterations and 45 minutes, with periodic and final cross-verification.

Start at `loop.defaultTier` when classification is inconclusive. Escalate only on evidence such as
verify failure, large diff, replan, or repeated failure. Record every transition in the resolved
`loop.logFile`.
Honor `loop.maxTotalIterations`, `maxDiffFilesPerIteration`, `maxDeepVerifiesPerTask`,
`reflectionWindow`, tier `plateauWindow`, and every configured `maxIterations` and
`maxWallClockMinutes`.


## Activation

Atomically write `.claude/.omh/loop-state.json` with:

```json
{
  "active": true,
  "sessionId": null,
  "tier": "quick",
  "goal": "...",
  "specPath": "SPEC.md",
  "iteration": 0,
  "totalIterations": 0,
  "deepVerifies": 0,
  "startedAt": "<Date.now() current epoch milliseconds>",
  "history": []
}
```

Seed the resolved `loop.logFile` from the spec and retain the resolved `loop.learningsFile`.
Capture `startedAt` from `Date.now()` immediately before the atomic activation write; never reuse a
prior loop's timestamp or the Unix epoch.
