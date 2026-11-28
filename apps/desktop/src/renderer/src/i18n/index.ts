import { en, type MessageKey } from './en';
import { ru } from './ru';
import { de } from './de';

/**
 * Interface texts (PRODUCTCREATOR-37). `en` is the source catalog; `ru` and `de` must have every key (typecheck).
 * The language is the app setting (Settings → Interface language), loaded before the first render; a change reloads
 * the window, so `t` reads a module-level language.
 */
export type UiLanguage = 'en' | 'ru' | 'de';
export type { MessageKey };

const CATALOGS: Record<UiLanguage, Record<MessageKey, string>> = { en, ru, de };
let current: UiLanguage = 'en';

export function setUiLanguage(language: UiLanguage) {
  current = language;
  document.documentElement.lang = language;
}

export const uiLanguage = () => current;

/** Text for a key; {name} placeholders are replaced from params */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const text = CATALOGS[current][key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
