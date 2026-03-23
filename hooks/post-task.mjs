#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { hookOutput, hookSilent } from './lib/output.mjs';

const projectRoot = process.env.PROJECT_PATH || process.cwd();
const configPath = join(projectRoot, '.claude', '.omh', 'harness.config.json');

function readStdin() {
  try { return JSON.parse(readFileSync('/dev/stdin', 'utf8')); }
  catch { return {}; }
}

try {
  if (process.env.DISABLE_HARNESS) { console.log(hookSilent()); process.exit(0); }

  let config;
  try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { console.log(hookSilent()); process.exit(0); }
  if (!config.features?.testEnforcement) { console.log(hookSilent()); process.exit(0); }

  const input = readStdin();
  const transcript = JSON.stringify(input);
  const codeChangeTools = ['Edit', 'Write', 'NotebookEdit'];
  const hasCodeChanges = codeChangeTools.some(tool =>
    transcript.includes(`"${tool}"`) || transcript.includes(`tool_name":"${tool}`)
  );
  const codeExtPattern = /\.(js|ts|jsx|tsx|py|go|rs|java|kt|rb|php|c|cpp|h|swift|vue|svelte)["'\s]/i;
  const hasCodeFiles = codeExtPattern.test(transcript);

  if (hasCodeChanges || hasCodeFiles) {
    const minCases = config.testEnforcement?.minCases || 2;
    const lines = [
      `[oh-my-harness] 코드 변경이 감지되었습니다. 다음을 확인하세요:`,
      `1. 변경된 코드에 대한 테스트 파일이 존재하는지 확인`,
      `2. 각 테스트 파일에 최소 ${minCases}개 이상의 테스트 케이스가 있는지 확인`,
      `3. 테스트가 없다면 사용자에게 테스트 추가를 제안`,
    ];
    if (config.testEnforcement?.promptOnMissing) {
      lines.push(`4. 테스트 미존재 시 작업 완료 전에 반드시 사용자에게 알림`);
    }
    console.log(hookOutput('Stop', lines.join('\n')));
  }
} catch {
  console.log(hookSilent());
}
