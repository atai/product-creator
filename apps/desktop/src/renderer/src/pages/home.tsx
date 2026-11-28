import { t } from '@/i18n';

export default function Home() {
  const sections = [
    [t('nav.features'), t('home.features')],
    [t('nav.objects'), t('home.objects')],
    [t('nav.workflows'), t('home.workflows')],
    [t('nav.streams'), t('home.streams')],
  ];
  return (
    <div className="min-h-full bg-bg">
      <div className="max-w-4xl mx-auto px-8 py-16">
        <div className="bg-surface rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold text-fg mb-6">Product Creator</h1>
          <p className="text-lg text-fg-2 mb-4">{t('home.lead')}</p>
          <p className="text-muted mb-6">{t('home.navHint')}</p>
          <ul className="space-y-3 text-fg-2">
            {sections.map(([name, text]) => (
              <li key={name} className="flex items-start">
                <span className="font-semibold mr-2">•</span>
                <span>
                  <strong>{name}</strong> — {text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
