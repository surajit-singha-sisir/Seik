import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Minimal, comment-preserving .env reader/writer.
 * We never use a library here because we need to rewrite specific keys
 * in-place without reordering or losing comments/blank lines.
 */

const ENV_PATH = path.resolve(process.cwd(), '.env');

export interface EnvUpdateResult {
  updated: string[];
  added: string[];
}

/** Read the raw .env file as an array of lines. */
async function readEnvLines(): Promise<string[]> {
  const raw = await readFile(ENV_PATH, 'utf-8');
  return raw.split(/\r?\n/);
}

/** Parse KEY=VALUE out of a single .env line. Returns null for comments/blank lines. */
function parseLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq === -1) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  // Strip matching surrounding quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

/** Read current values for a set of keys directly from disk (not process.env,
 * since process.env may be stale if .env was edited after boot). */
export async function readEnvValues(keys: string[]): Promise<Record<string, string | undefined>> {
  const lines = await readEnvLines();
  const result: Record<string, string | undefined> = {};
  for (const key of keys) result[key] = undefined;

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed && keys.includes(parsed.key)) {
      result[parsed.key] = parsed.value;
    }
  }
  return result;
}

/** Update (or append) one or more KEY=VALUE pairs in .env, preserving everything else.
 * Values containing whitespace or special characters are double-quoted. */
export async function updateEnvValues(
  updates: Record<string, string>,
): Promise<EnvUpdateResult> {
  const lines = await readEnvLines();
  const remainingKeys = new Set(Object.keys(updates));
  const updated: string[] = [];

  const nextLines = lines.map((line) => {
    const parsed = parseLine(line);
    if (parsed && remainingKeys.has(parsed.key)) {
      remainingKeys.delete(parsed.key);
      updated.push(parsed.key);
      return formatLine(parsed.key, updates[parsed.key]);
    }
    return line;
  });

  const added: string[] = [];
  if (remainingKeys.size > 0) {
    if (nextLines[nextLines.length - 1]?.trim() !== '') nextLines.push('');
    for (const key of remainingKeys) {
      nextLines.push(formatLine(key, updates[key]));
      added.push(key);
    }
  }

  await writeFile(ENV_PATH, nextLines.join('\n'), 'utf-8');
  return { updated, added };
}

function formatLine(key: string, value: string): string {
  const needsQuotes = /[\s#"'$]/.test(value);
  const safeValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
  return `${key}=${safeValue}`;
}

/** Mask a secret, showing only the last `visible` characters. */
export function maskSecret(value: string | undefined, visible = 4): string {
  if (!value) return '';
  if (value.length <= visible) return '•'.repeat(value.length);
  return '•'.repeat(Math.max(0, value.length - visible)) + value.slice(-visible);
}
