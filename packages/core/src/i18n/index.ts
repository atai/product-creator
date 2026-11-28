import { createHash } from 'crypto';
import { SOURCE_KEY, getAt, isRec, primaryTexts, setAt, text, translatablePaths, type Rec } from './text';

/**
 * Translations of catalog content (PRODUCTCREATOR-37).
 *
 * The normal fields of a card hold the primary language. `i18n.<lang>` holds the same translatable fields
 * (marked `x-translatable: true` in the schema) in another language; items of a list are keyed by their `id`
 * (or the property named by `x-i18n-key` on the array). `i18n.<lang>._source` mirrors that shape with a short
 * fingerprint of the primary text each translation was made from, so a changed primary text marks the
 * translation stale.
 *
 *   name: Create order
 *   requirements: [{ id: R1, text: The buyer sees the total }]
 *   i18n:
 *     ru:
 *       name: Создать заказ
 *       requirements: { R1: { text: Покупатель видит сумму } }
 *       _source: { name: 3f2a91c0, requirements: { R1: { text: 9c1b77d2 } } }
 */
export { SOURCE_KEY, translatablePaths, primaryTexts, translationLanguages, localize, type TextPath, type Localized } from './text';

export const fingerprint = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 8);

/**
 * Fingerprints of the translations (on every save): a translation that is new or changed gets the fingerprint of
 * the current primary text; an unchanged translation keeps its old one, so a changed primary text shows it stale.
 */
export function stampTranslations<T>(previous: unknown, next: T, schema: object): T {
  if (!isRec(next) || !isRec(next.i18n)) return next;
  const out = JSON.parse(JSON.stringify(next)) as Rec;
  const texts = primaryTexts(next, schema);
  for (const lang of Object.keys(out.i18n as Rec)) {
    const block = (out.i18n as Rec)[lang];
    if (!isRec(block)) continue;
    const before = isRec(previous) && isRec(previous.i18n) ? (previous.i18n as Rec)[lang] : undefined;
    const sources: Rec = isRec(block[SOURCE_KEY]) ? (block[SOURCE_KEY] as Rec) : {};
    for (const [path, primary] of texts) {
      const translated = text(getAt(block, path));
      if (!translated) continue;
      const changed = translated !== text(getAt(before, path));
      if (changed || typeof getAt(sources, path) !== 'string') setAt(sources, path, fingerprint(primary));
    }
    block[SOURCE_KEY] = sources;
  }
  return out as T;
}

export interface TranslationProblem {
  kind: 'stale' | 'orphan' | 'unknown_language';
  language: string;
  /** e.g. requirements.R1.text */
  path?: string;
}

/** Stale translations, translations of items that no longer exist, languages the project does not have */
export function translationProblems(entry: unknown, schema: object, languages: string[]): TranslationProblem[] {
  const problems: TranslationProblem[] = [];
  if (!isRec(entry) || !isRec(entry.i18n)) return problems;
  const texts = primaryTexts(entry, schema);
  const known = new Map(texts.map(([p, v]) => [p.join('.'), v]));
  const paths = translatablePaths(schema);
  for (const [lang, block] of Object.entries(entry.i18n)) {
    if (!languages.includes(lang)) {
      problems.push({ kind: 'unknown_language', language: lang });
      continue;
    }
    if (languages[0] === lang || !isRec(block)) continue;
    // every translated text: does its primary still exist, and is it the one it was translated from?
    for (const p of paths) {
      if ('list' in p) {
        const group = block[p.list];
        if (!isRec(group)) continue;
        for (const [key, item] of Object.entries(group)) {
          const translated = isRec(item) ? text(item[p.field]) : undefined;
          if (!translated) continue;
          const id = [p.list, key, p.field].join('.');
          if (!known.has(id)) problems.push({ kind: 'orphan', language: lang, path: id });
          else if (getAt(block[SOURCE_KEY], [p.list, key, p.field]) !== fingerprint(known.get(id) as string)) problems.push({ kind: 'stale', language: lang, path: id });
        }
      } else {
        const translated = text(block[p.field]);
        if (!translated) continue;
        if (!known.has(p.field)) problems.push({ kind: 'orphan', language: lang, path: p.field });
        else if (getAt(block[SOURCE_KEY], [p.field]) !== fingerprint(known.get(p.field) as string)) problems.push({ kind: 'stale', language: lang, path: p.field });
      }
    }
  }
  return problems;
}
