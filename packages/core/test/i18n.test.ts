import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { fingerprint, localize, stampTranslations, translatablePaths, translationProblems } from '../src/i18n';
import { catalogSchemas } from '../src/validation/schemas';
import { openProject, projectLanguages, readProject, updateProject } from '../src/project/model';
import type { Feature } from '../src/types';

const feature = (extra: Partial<Feature> = {}): Feature => ({
  id: 'shop.order.create',
  name: 'Create order',
  bounded_context: 'shop',
  entity: 'order',
  action: 'create',
  owner: 't',
  lifecycle: 'draft',
  description: 'A buyer creates an order',
  requirements: [{ id: 'R1', text: 'The buyer sees the total' }, { id: 'R2', text: 'Taxes are shown' }],
  ...extra,
});
const schema = catalogSchemas.feature;

describe('translations (PRODUCTCREATOR-37)', () => {
  it('translatable fields come from the schema (x-translatable), list items keyed by id or x-i18n-key', () => {
    const paths = translatablePaths(schema).map((p) => ('list' in p ? `${p.list}[${p.key}].${p.field}` : p.field));
    expect(paths).toEqual(expect.arrayContaining(['name', 'description', 'requirements[id].text', 'acceptance[id].then', 'decisions[id].reason', 'screens[id].title']));
    expect(paths).not.toContain('id');
    expect(translatablePaths(catalogSchemas.business_object).map((p) => ('list' in p ? `${p.list}[${p.key}].${p.field}` : p.field))).toContain('fields[name].description');
  });

  it('localize overlays the translation and counts what falls back to the primary language', () => {
    const f = feature({ i18n: { ru: { name: 'Создать заказ', requirements: { R1: { text: 'Покупатель видит сумму' } } } } });
    const { data, untranslated } = localize(f, schema, 'ru', 'en');
    expect(data.name).toBe('Создать заказ');
    expect(data.requirements?.[0].text).toBe('Покупатель видит сумму');
    expect(data.requirements?.[1].text).toBe('Taxes are shown');
    expect(untranslated).toBe(2); // description and R2
    expect(localize(f, schema, 'en', 'en').untranslated).toBe(0);
  });

  it('saving stamps fingerprints; a changed primary text makes the translation stale until it is updated', () => {
    const v1 = stampTranslations(null, feature({ i18n: { ru: { name: 'Создать заказ' } } }), schema);
    const sources = (v1 as unknown as { i18n: { ru: { _source: { name: string } } } }).i18n.ru._source;
    expect(sources.name).toBe(fingerprint('Create order'));
    expect(translationProblems(v1, schema, ['en', 'ru'])).toEqual([]);

    // the primary changes, the translation does not: stale
    const v2 = stampTranslations(v1, { ...v1, name: 'Place an order' }, schema);
    expect(translationProblems(v2, schema, ['en', 'ru'])).toEqual([{ kind: 'stale', language: 'ru', path: 'name' }]);
    // the translation is updated: current again
    const v3 = stampTranslations(v2, { ...v2, i18n: { ru: { ...v2.i18n?.ru, name: 'Оформить заказ' } } }, schema);
    expect(translationProblems(v3, schema, ['en', 'ru'])).toEqual([]);
  });

  it('reports translations of removed items and of languages the project does not have', () => {
    const f = stampTranslations(null, feature({ i18n: { ru: { requirements: { R9: { text: 'Старое' } } }, fr: { name: 'Créer' } } }), schema);
    const problems = translationProblems(f, schema, ['en', 'ru']);
    expect(problems).toEqual(expect.arrayContaining([{ kind: 'orphan', language: 'ru', path: 'requirements.R9.text' }, { kind: 'unknown_language', language: 'fr' }]));
  });
});

describe('project languages (PRODUCTCREATOR-37)', () => {
  let root: string;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('languages are saved in product-creator.yml, first is primary; the product context is translated and stamped', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-lang-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"demo"}');
    openProject(root);
    expect(projectLanguages(readProject(root)!)).toEqual(['en']);
    updateProject(root, { languages: ['ru', 'en'], vision: 'Видение', i18n: { en: { vision: 'Vision' } } });
    const p = readProject(root)!;
    expect(projectLanguages(p)).toEqual(['ru', 'en']);
    expect((p.i18n as { en: { _source: { vision: string } } }).en._source.vision).toBe(fingerprint('Видение'));
    expect(() => updateProject(root, { languages: ['ru', 'ru'] })).toThrow(/repeat/);
    expect(() => updateProject(root, { languages: ['Russian'] })).toThrow(/tag/);
  });
});
