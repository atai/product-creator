'use client';

import { useSearchParams } from 'next/navigation';

export default function DocPage() {
  const searchParams = useSearchParams();
  const selectedApp = searchParams.get('app') || '';

  return (
    <div className="min-h-full bg-bg">
      <div className="max-w-4xl mx-auto px-8 py-12">
        <h1 className="text-3xl font-bold text-fg mb-4">Product Documentation</h1>
        <p className="text-muted mb-6">
          Comprehensive product and engineering documentation will appear here.
        </p>
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6">
          <p className="text-fg-2">
            Placeholder content — generating the documentation bundle for{' '}
            {selectedApp ? <span className="font-semibold">{selectedApp}</span> : 'all apps'}.
          </p>
          <p className="text-sm text-meta mt-3">
            This section will aggregate business objects, functions, workflows, and presentation assets
            into a single shareable packet.
          </p>
        </div>
      </div>
    </div>
  );
}




