'use client';

import { useSearchParams } from 'next/navigation';

export default function DocPage() {
  const searchParams = useSearchParams();
  const selectedApp = searchParams.get('app') || '';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Product Documentation</h1>
        <p className="text-gray-600 mb-6">
          Comprehensive product and engineering documentation will appear here.
        </p>
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6">
          <p className="text-gray-700">
            Placeholder content — generating the documentation bundle for{' '}
            {selectedApp ? <span className="font-semibold">{selectedApp}</span> : 'all apps'}.
          </p>
          <p className="text-sm text-gray-500 mt-3">
            This section will aggregate business objects, functions, workflows, and presentation assets
            into a single shareable packet.
          </p>
        </div>
      </div>
    </div>
  );
}




