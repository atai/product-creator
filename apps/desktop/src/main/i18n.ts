/**
 * Language of the app interface (PRODUCTCREATOR-37): a per-user setting, independent of project languages.
 * `system` follows the OS; PC_UI_LANGUAGE overrides it (smoke runs, screenshots). Texts of the main process
 * (menu, dialogs, notifications) live here; the renderer has its own catalogs (renderer/src/i18n).
 */
export const UI_LANGUAGES = ['en', 'ru', 'de'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
export type UiLanguageSetting = 'system' | UiLanguage;

const isUi = (v: string | undefined): v is UiLanguage => !!v && (UI_LANGUAGES as readonly string[]).includes(v);

/** The language to show: env override, then the setting, then the first supported OS language, then English */
export function resolveUiLanguage(setting: UiLanguageSetting, systemLanguages: string[], env: NodeJS.ProcessEnv = process.env): UiLanguage {
  const forced = env.PC_UI_LANGUAGE?.toLowerCase().split('-')[0];
  if (isUi(forced)) return forced;
  if (setting !== 'system') return setting;
  for (const tag of systemLanguages) {
    const base = tag.toLowerCase().split('-')[0];
    if (isUi(base)) return base;
  }
  return 'en';
}

const en = {
  file: 'File',
  openProject: 'Open Project Folder…',
  checkUpdates: 'Check for Updates…',
  github: 'GitHub Repository',
  openProjectTitle: 'Open project folder',
  updatesUnavailable: 'Updates are not available for this build',
  updatesUnavailableDetail: 'Auto-update works in installed release builds (macOS .dmg/.zip, Windows installer, Linux AppImage).',
  upToDate: 'Product Creator {version} is up to date',
  updateAvailable: 'Product Creator {version} is available',
  updateAvailableDetail: 'It is downloading in the background and will be installed when you quit the app.',
  updateCheckFailed: 'Could not check for updates',
  stoppingScreenshots: 'Stopping the screenshot run: services and teardown commands are finishing.',
};
type MainMessages = Record<keyof typeof en, string>;

const ru: MainMessages = {
  file: 'Файл',
  openProject: 'Открыть папку проекта…',
  checkUpdates: 'Проверить обновления…',
  github: 'Репозиторий на GitHub',
  openProjectTitle: 'Открыть папку проекта',
  updatesUnavailable: 'Для этой сборки обновления недоступны',
  updatesUnavailableDetail: 'Автообновление работает в установленных релизных сборках (macOS .dmg/.zip, установщик Windows, Linux AppImage).',
  upToDate: 'Product Creator {version} — последняя версия',
  updateAvailable: 'Доступен Product Creator {version}',
  updateAvailableDetail: 'Обновление загружается в фоне и установится, когда вы закроете приложение.',
  updateCheckFailed: 'Не удалось проверить обновления',
  stoppingScreenshots: 'Останавливаем съёмку скриншотов: сервисы и команды teardown завершаются.',
};

const de: MainMessages = {
  file: 'Datei',
  openProject: 'Projektordner öffnen…',
  checkUpdates: 'Nach Updates suchen…',
  github: 'GitHub-Repository',
  openProjectTitle: 'Projektordner öffnen',
  updatesUnavailable: 'Für diesen Build sind keine Updates verfügbar',
  updatesUnavailableDetail: 'Automatische Updates funktionieren in installierten Release-Builds (macOS .dmg/.zip, Windows-Installer, Linux AppImage).',
  upToDate: 'Product Creator {version} ist aktuell',
  updateAvailable: 'Product Creator {version} ist verfügbar',
  updateAvailableDetail: 'Das Update wird im Hintergrund geladen und beim Beenden der App installiert.',
  updateCheckFailed: 'Nach Updates suchen fehlgeschlagen',
  stoppingScreenshots: 'Screenshot-Lauf wird beendet: Dienste und Teardown-Befehle laufen noch.',
};

const CATALOGS: Record<UiLanguage, MainMessages> = { en, ru, de };
let current: UiLanguage = 'en';

export function setMainLanguage(language: UiLanguage) {
  current = language;
}

/** Text of the main process in the current UI language; {name} placeholders are replaced from params */
export function tm(key: keyof typeof en, params: Record<string, string | number> = {}): string {
  return CATALOGS[current][key].replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
