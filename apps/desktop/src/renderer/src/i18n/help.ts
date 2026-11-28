import { t, type MessageKey } from './index';

/** Help hints of pages and forms (formerly @pc/core/helpTexts), texts in the UI catalogs */
export type HelpHintKey = 'matrix' | 'featureForm' | 'featureDetail' | 'businessObjects' | 'streams' | 'streamDetail' | 'workflows' | 'workflowDetail' | 'graph' | 'home';

export interface HelpHint {
  title: string;
  description: string;
}

export const getHelpHint = (key: HelpHintKey): HelpHint => ({
  title: t(`help.${key}.title` as MessageKey),
  description: t(`help.${key}.description` as MessageKey),
});
