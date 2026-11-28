/**
 * Translatable texts of a catalog entry (PRODUCTCREATOR-37), without Node dependencies: the renderer uses it too
 * (translation forms, reading a translation). Fingerprints and checks are in `./index`.
 */
export const SOURCE_KEY = '_source';

interface SchemaNode {
  type?: string | string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  'x-translatable'?: boolean;
  'x-i18n-key'?: string;
}

/** A translatable text: `[field]`, or `[list, key-property, field]` for a field of list items */
export type TextPath = { field: string } | { list: string; key: string; field: string };

/** Translatable text paths declared by a schema (one level of lists, as in the catalog schemas) */
export function translatablePaths(schema: object): TextPath[] {
  const root = schema as SchemaNode;
  const paths: TextPath[] = [];
  for (const [name, node] of Object.entries(root.properties ?? {})) {
    if (node['x-translatable']) paths.push({ field: name });
    const item = node.items;
    if (item?.properties) {
      const key = node['x-i18n-key'] ?? (item.properties.id ? 'id' : item.properties.name ? 'name' : 'term');
      for (const [field, sub] of Object.entries(item.properties)) if (sub['x-translatable']) paths.push({ list: name, key, field });
    }
  }
  return paths;
}

export type Rec = Record<string, unknown>;
export const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
export const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

/** Every primary text of an entry: [path in the i18n block, text] — e.g. [['requirements','R1','text'], '…'] */
export function primaryTexts(entry: unknown, schema: object): [string[], string][] {
  const data = isRec(entry) ? entry : {};
  const out: [string[], string][] = [];
  for (const p of translatablePaths(schema)) {
    if ('list' in p) {
      for (const item of Array.isArray(data[p.list]) ? (data[p.list] as unknown[]) : []) {
        if (!isRec(item)) continue;
        const key = item[p.key];
        const value = text(item[p.field]);
        if (typeof key === 'string' && key && value) out.push([[p.list, key, p.field], value]);
      }
    } else {
      const value = text(data[p.field]);
      if (value) out.push([[p.field], value]);
    }
  }
  return out;
}

export const getAt = (obj: unknown, path: string[]): unknown => path.reduce<unknown>((o, k) => (isRec(o) ? o[k] : undefined), obj);

export function setAt(obj: Rec, path: string[], value: unknown) {
  let o = obj;
  for (const k of path.slice(0, -1)) {
    if (!isRec(o[k])) o[k] = {};
    o = o[k] as Rec;
  }
  o[path[path.length - 1]] = value;
}

/** Removes a text from a translation block (and empty groups left behind) */
export function unsetAt(obj: Rec, path: string[]) {
  const parents: Rec[] = [obj];
  for (const k of path.slice(0, -1)) {
    const next = parents[parents.length - 1][k];
    if (!isRec(next)) return;
    parents.push(next);
  }
  delete parents[parents.length - 1][path[path.length - 1]];
  for (let i = parents.length - 1; i > 0; i--) if (Object.keys(parents[i]).length === 0) delete parents[i - 1][path[i - 1]];
}

/** Languages that have a translation block */
export const translationLanguages = (entry: unknown): string[] => (isRec(entry) && isRec(entry.i18n) ? Object.keys(entry.i18n) : []);

export interface Localized<T> {
  data: T;
  /** Texts shown in the primary language because there is no translation */
  untranslated: number;
}

/** The entry in `lang`: translated texts replace the primary ones; missing ones stay primary (counted) */
export function localize<T>(entry: T, schema: object, lang: string, primary: string, mark?: (text: string) => string): Localized<T> {
  if (lang === primary || !isRec(entry)) return { data: entry, untranslated: 0 };
  const data = JSON.parse(JSON.stringify(entry)) as Rec;
  const block = isRec(data.i18n) ? data.i18n[lang] : undefined;
  let untranslated = 0;
  for (const p of translatablePaths(schema)) {
    if ('list' in p) {
      for (const item of Array.isArray(data[p.list]) ? (data[p.list] as unknown[]) : []) {
        if (!isRec(item) || !text(item[p.field]) || typeof item[p.key] !== 'string') continue;
        const translated = text(getAt(block, [p.list, item[p.key] as string, p.field]));
        if (translated) item[p.field] = translated;
        else {
          untranslated++;
          if (mark) item[p.field] = mark(item[p.field] as string);
        }
      }
    } else if (text(data[p.field])) {
      const translated = text(getAt(block, [p.field]));
      if (translated) data[p.field] = translated;
      else {
        untranslated++;
        if (mark) data[p.field] = mark(data[p.field] as string);
      }
    }
  }
  return { data: data as T, untranslated };
}
