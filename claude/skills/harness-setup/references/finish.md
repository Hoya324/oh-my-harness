# Finish setup

Read by `harness-setup` steps 6 to 8.

## 6. Update .gitignore

```bash
if ! grep -q '.claude/.omh/' .gitignore 2>/dev/null; then
  echo -e "\n# oh-my-harness\n.claude/.omh/" >> .gitignore
fi
```

## 7. Enable HUD (Status Line)

Register the oh-my-harness HUD in the user's Claude Code settings.

**IMPORTANT**: `$CLAUDE_PLUGIN_ROOT` is NOT available in statusLine context (it's a global setting, not a plugin hook). Use a dynamic path lookup instead.

Write the statusLine config to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash -c 'node \"$(ls ~/.claude/plugins/cache/oh-my-harness/*/*/hud/omh-hud.mjs 2>/dev/null | head -1)\"'"
  }
}
```

If `statusLine` is already set to a non-harness value, ask the user before overwriting.

## 8. Report Summary

Show the duck one more time, then output:
```
oh-my-harness is ready!

Scope    : {Project|User (Global)}
Project  : {language} | test: {testFramework} | lint: {linter} | fmt: {formatter}
Config   : .claude/.omh/harness.config.json
Features : {N} active ({disabled features list})
Commit   : {commitStyle}
Weight   : {weightRouting on/off} | verify {rounds}라운드, autoFix {on/off}
Verifiers: {claude (+gpt) (+gemini) — 감지·선택된 모델}
HUD      : enabled (restart Claude Code to see status line)

Hooks are provided automatically by the plugin.
Use /set-harness to change settings anytime.
```

---
