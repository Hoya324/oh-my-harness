#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { hookOutput, hookSilent } from './lib/output.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configPath = join(projectRoot, '.claude', '.omh', 'harness.config.json');

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')); }
  catch { return {}; }
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { console.log(hookSilent()); process.exit(0); }

  const input = readStdin();
  const prompt = input.prompt || input.message || '';
  if (!prompt.trim()) { console.log(hookSilent()); process.exit(0); }

  const messages = [];

  // 4-A: Multi-task detection → Auto-Plan
  if (config.features?.autoPlanMode) {
    const threshold = config.autoPlan?.threshold || 3;
    let taskCount = 0;
    const numbered = prompt.match(/^\s*\d+[\.\)]/gm);
    if (numbered) taskCount = Math.max(taskCount, numbered.length);
    const bullets = prompt.match(/^\s*[-*]\s+\S/gm);
    if (bullets) taskCount = Math.max(taskCount, bullets.length);
    const conjunctions = prompt.match(/(그리고|또한|추가로|아울러|더불어|그 다음)/g);
    if (conjunctions) taskCount = Math.max(taskCount, conjunctions.length + 1);
    if (taskCount >= threshold) {
      messages.push(`[oh-my-harness] ${taskCount}개의 독립 작업이 감지되었습니다. plan 모드 사용을 권장합니다. 작업을 나열하고 실행 순서를 사용자에게 확인하세요.`);
    }
  }

  // 4-B: Ambiguity detection → AskUserQuestion enforcement
  if (config.features?.ambiguityDetection) {
    const ambThreshold = config.ambiguityDetection?.threshold || 2;
    let ambiguityScore = 0;
    if (/(?:이거|그거|저거|이것|그것|저것)\s/.test(prompt)) ambiguityScore++;
    if (/(?:리팩토링|개선|정리|수정|고쳐|바꿔|변경|업데이트)(?:해줘|해주세요|하자|해봐)/.test(prompt) &&
        !/(?:파일|함수|클래스|메서드|컴포넌트|모듈)\s/.test(prompt)) ambiguityScore++;
    if (/(?:하거나|든지|같은거|뭐든|아무거나)/.test(prompt)) ambiguityScore++;
    if (prompt.trim().length <= 15 && !/[A-Za-z_]\w*[\./]/.test(prompt)) ambiguityScore++;
    if (/(?:fix it|change it|update it|refactor|clean up|improve)\b/i.test(prompt) &&
        !/(?:file|function|class|method|component)\s/i.test(prompt)) ambiguityScore++;
    if (ambiguityScore >= ambThreshold) {
      messages.push(`[oh-my-harness] 요청이 모호합니다. 작업 전에 AskUserQuestion 도구로 사용자에게 구체적 범위와 방향을 확인하세요.`);
    }
  }

  if (messages.length > 0) {
    console.log(hookOutput('UserPromptSubmit', messages.join('\n')));
  }
} catch {
  console.log(hookSilent());
}
