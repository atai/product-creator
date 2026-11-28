import { afterEach, describe, expect, it } from 'vitest';
import { resolveUiLanguage, setMainLanguage, tm } from './i18n';

describe('interface language (PRODUCTCREATOR-37)', () => {
  afterEach(() => setMainLanguage('en'));

  it('env override, then the setting, then the first supported OS language, then English', () => {
    expect(resolveUiLanguage('system', ['fr-FR', 'de-AT', 'en'], {})).toBe('de');
    expect(resolveUiLanguage('system', ['fr-FR'], {})).toBe('en');
    expect(resolveUiLanguage('ru', ['de'], {})).toBe('ru');
    expect(resolveUiLanguage('ru', ['de'], { PC_UI_LANGUAGE: 'de-DE' })).toBe('de');
    expect(resolveUiLanguage('ru', ['de'], { PC_UI_LANGUAGE: 'xx' })).toBe('ru');
  });

  it('main-process texts follow the language and fill placeholders', () => {
    setMainLanguage('ru');
    expect(tm('file')).toBe('Файл');
    expect(tm('upToDate', { version: '1.2.3' })).toContain('1.2.3');
    setMainLanguage('de');
    expect(tm('file')).toBe('Datei');
  });
});
