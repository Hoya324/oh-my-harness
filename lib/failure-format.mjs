/**
 * Turn raw tool output (gradle, tsc, eslint, jest, pytest, go, ktlint, detekt)
 * into a short, location-first failure report for the model.
 *
 * The model only knows something is wrong when the signal is in its context.
 * "expected 200, got 404 at OrderControllerTest.kt:42" is a signal; the first
 * 800 characters of a Gradle log are mostly download noise. So: keep lines
 * that point at a file and line, else fall back to the TAIL of the output,
 * where build tools print the actual error.
 */

// path/File.ext:12  |  path/File.ext:12:5  |  File.kt:(12, 5)  |  (File.java:12)
const LOCATION = /(?:[\w./\\-]+\.(?:kt|kts|java|scala|groovy|ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|php|cs|swift|sql|ya?ml|json))(?::\d+(?::\d+)?|:?\(\d+(?:,\s*\d+)?\))/;
const ERROR_WORDS = /\b(error|fail(?:ed|ure)?|expected|assert|exception|panic|cannot|unresolved|violation)\b/i;
const NOISE = /^(?:\s*at (?:java\.|kotlin\.|org\.junit\.|org\.gradle\.|jdk\.|sun\.|node:internal)|\s*$|> Task |Download|BUILD (?:SUCCESSFUL|FAILED) in|\d+ actionable tasks?)/;

/**
 * @param {string} raw
 * @param {{maxLines?: number, maxChars?: number, tailLines?: number}} [opts]
 * @returns {string}
 */
export function formatFailureOutput(raw, { maxLines = 20, maxChars = 1500, tailLines = 15 } = {}) {
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
  const located = [];
  const seen = new Set();
  for (const line of lines) {
    if (NOISE.test(line)) continue;
    const t = line.trim();
    if (LOCATION.test(t) && !seen.has(t)) { seen.add(t); located.push(t); }
    if (located.length >= maxLines) break;
  }
  let picked = located;
  if (!picked.length) {
    // No file:line anywhere: show the error-looking lines from the tail.
    const tail = lines.filter((l) => !NOISE.test(l)).slice(-tailLines * 3);
    const errors = tail.filter((l) => ERROR_WORDS.test(l));
    picked = (errors.length ? errors : tail).slice(-tailLines).map((l) => l.trim());
  }
  const out = picked.join('\n');
  return out.length > maxChars ? `${out.slice(0, maxChars - 1)}…` : out;
}

/** Stable short signature for oscillation/no-progress detection. */
export function failureSignature(raw) {
  return formatFailureOutput(raw, { maxLines: 3, maxChars: 120 });
}
