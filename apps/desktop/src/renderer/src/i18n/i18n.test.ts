import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ru } from './ru';
import { de } from './de';

/** Interface texts (PRODUCTCREATOR-37): complete catalogs, no hard-coded words in the UI */
const ROOT = path.resolve(__dirname, '..');

/** Text that is the same in every language: brand, technical names, symbols */
const ALLOWED = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'Product Creator', 'MCP', 'API', 'YAML', 'OpenAPI', 'ID', 'UUID', 'GitHub', 'ecooz.net', 'Prisma', 'JSON', 'R1', 'A1', 'C1', 'D1', 'Q1', 'S1', 'G1', 'SSE', 'URL', 'PNG', 'PDF', 'HTML', 'CI', 'UI', 'PRODUCTCREATOR-34, #12', 'YYYY-MM-DD', 'pnpm run generate:openapi', 'en, ru']);

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'i18n' ? [] : files(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

/** A code-like example (identifier, path, key) without spaces is the same in every language */
const technical = (text: string) => !/\s/.test(text) && /^[a-z0-9_./#{}:@<>*-]+$/.test(text);

/** JSX text between tags and literal user-facing attributes that contain letters */
export function literals(source: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  const lineOf = (index: number) => source.slice(0, index).split('\n').length;
  const code = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => ' '.repeat(m.length)).replace(/(^|[^:])\/\/.*$/gm, (m) => ' '.repeat(m.length));
  for (const m of code.matchAll(/>([^<>{}]*)</g)) {
    const text = m[1].trim();
    // code between generics/comparisons (`useState<X>([]);`, `a > b && c < d`) is not JSX text
    const before = code[(m.index ?? 0) - 1];
    const after = code[(m.index ?? 0) + m[0].length];
    // `=> Promise<…>`, `a > b <= c`: the `>` of an arrow, or a `<` that is a comparison, is code
    const isCode = before === '=' || after === '=' || /[;=]|&&|\|\||^\(|^\)/.test(text);
    if (!isCode && /\p{L}{2,}/u.test(text) && !ALLOWED.has(text) && !technical(text)) found.push({ line: lineOf(m.index ?? 0), text });
  }
  for (const m of code.matchAll(/\b(placeholder|title|aria-label|alt|label|description|hint|addLabel)="([^"]*)"/g)) {
    const text = m[2].trim();
    if (/\p{L}{2,}/u.test(text) && !ALLOWED.has(text) && !technical(text)) found.push({ line: lineOf(m.index ?? 0), text: `${m[1]}="${text}"` });
  }
  return found;
}

describe('interface texts', () => {
  it('ru and de have exactly the keys of en, none empty', () => {
    for (const catalog of [ru, de]) {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
      expect(Object.values(catalog).filter((v) => !v.trim())).toEqual([]);
    }
  });

  it('no hard-coded words in pages and components: every text goes through t()', () => {
    const report = files(ROOT).flatMap((file) => literals(fs.readFileSync(file, 'utf8')).map((l) => `${path.relative(ROOT, file)}:${l.line}  ${l.text}`));
    expect(report).toEqual([]);
  });
});
