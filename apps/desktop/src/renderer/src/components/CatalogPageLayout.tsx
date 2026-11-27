import { ReactNode } from 'react';
import FormHelpHint from './FormHelpHint';
import { HelpHintKey } from '@pc/core/helpTexts';

interface CatalogPageLayoutProps {
  title: string;
  description?: string;
  hintKey?: HelpHintKey;
  actions?: ReactNode;
  search?: ReactNode;
  children: ReactNode;
}

export default function CatalogPageLayout({
  title,
  description,
  hintKey,
  actions,
  search,
  children,
}: CatalogPageLayoutProps) {
  return (
    <div className="min-h-full bg-bg">
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold text-fg">{title}</h1>
                {hintKey && <FormHelpHint hintKey={hintKey} />}
              </div>
              {description && <p className="text-muted mt-2 max-w-2xl">{description}</p>}
            </div>
            {actions}
          </div>

          {search && <div>{search}</div>}
        </div>

        {children}
      </div>
    </div>
  );
}





