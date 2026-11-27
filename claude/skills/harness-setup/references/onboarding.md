# Onboarding questions

Read by `harness-setup` step 3. Ask all questions at once with AskUserQuestion, then apply the answers.

Ask the user the following questions using AskUserQuestion (ask all at once):

**Question 1 — Installation Scope**
> "설치 범위를 선택해주세요."
- Project (Recommended): `.claude/settings.local.json` — 이 프로젝트에만 적용
- User (Global): `~/.claude/settings.json` — 모든 프로젝트에 적용

**Question 2 — Project Detection**
> "프로젝트 컨벤션을 자동 감지할까요?"
- Auto-detect (Recommended): package.json, pyproject.toml, go.mod 등을 스캔해서 자동 설정
- Manual: 직접 언어/프레임워크를 지정

**Question 3 — Feature Profile**
> "어떤 기능 프로필을 사용할까요?"
- Full (Recommended): 모든 기능 활성화 (scopeGuard 제외)
- Minimal: testEnforcement + dangerousGuard + commitConvention만 활성화
- Custom: 기능을 하나씩 선택

**Question 4 — Commit Convention**
> "커밋 메시지 컨벤션은?"
- Auto-detect (Recommended): git log에서 자동 감지
- Conventional Commits: `type(scope): description`
- Gitmoji: `🎨 description`

**Question 5 — Weight Routing & 검증 (무게 비례 하네스)**
> "작업 무게(Tier)에 따라 검증 강도를 자동 조절할까요? Tier 3(무거운 작업)은 완료 전 `/omh-verify` N-라운드 독립검증을 강제합니다."
- Enable (Recommended): weightRouting ON, verify.rounds=3, autoFix=false (검증만, 수정은 확인 후)
- Enable + autoFix: weightRouting ON, 발견된 문제를 자동 수정
- Disable: 무게 판정/검증 강제를 끔

## 3-A. 모델 CLI 자동 감지 (Multi-model 교차검증)

`/omh-verify`는 Claude 외에 GPT(codex)·Gemini를 독립 검증자로 로테이션할 수 있습니다. 설치 여부를 감지:

```bash
which codex >/dev/null 2>&1 && echo "codex: ✓" || echo "codex: ✗"
which gemini >/dev/null 2>&1 && echo "gemini: ✓" || echo "gemini: ✗"
```

감지된 CLI가 있으면 AskUserQuestion으로 제안:
> "GPT/Gemini도 독립 검증에 넣을까요? (감지됨: {codex, gemini 중 설치된 것})"
- 전부 사용 (Recommended): 감지된 모델을 verify.lenses에 포함
- Claude만: 외부 모델 미사용

선택에 따라 `verify.lenses` 배열을 구성한다(미설치 모델은 제외). 둘 다 없으면 이 질문은 건너뛰고 Claude 단독으로 동작한다(graceful degrade).


## Apply choices

Based on the user's answers:

- **Project scope** selected → Config and hooks target `.claude/settings.local.json` (this project only)
- **User scope** selected → Config stays in `.claude/.omh/` but hooks are registered in `~/.claude/settings.json` (applies to all projects)

- **Auto-detect** selected → Run convention detection (scan project root for package.json, pyproject.toml, go.mod, Cargo.toml, build.gradle, pom.xml) and save to `.claude/.omh/conventions.json`
- **Manual** selected → Ask for language, test framework, linter, formatter, build tool

- **Full profile** → Use all default features as-is
- **Minimal profile** → Set all features to `false` except: `testEnforcement`, `dangerousGuard`, `commitConvention`, `autoGitignore`
- **Custom profile** → Ask the user which features to enable using AskUserQuestion with multiSelect

- **Commit convention** → Set `commitConvention.style` to the chosen value (`auto`, `conventional`, `gitmoji`)
