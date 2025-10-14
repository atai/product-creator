'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

interface RootInfo {
  path: string;
  label: string;
}

export default function Header() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [roots, setRoots] = useState<RootInfo[]>([]);
  const [selectedRoot, setSelectedRoot] = useState<string>('');

  useEffect(() => {
    // Load roots
    fetch('/api/roots')
      .then((res) => res.json())
      .then((data) => {
        const rootList = data.roots || [];
        setRoots(rootList);

        // Use root from URL if present, otherwise use first root
        const rootParam = searchParams.get('root');
        if (rootParam) {
          setSelectedRoot(rootParam);
        } else if (rootList.length > 0) {
          setSelectedRoot(rootList[0].path);
        }
      })
      .catch((err) => {
        console.error('Failed to load roots', err);
      });
  }, [searchParams]);

  const handleRootChange = (newRoot: string) => {
    setSelectedRoot(newRoot);
    // Redirect with new root filter, preserving current page if it supports root filtering
    if (pathname === '/' || pathname === '/graph' || pathname === '/matrix' || pathname === '/workflows' || pathname === '/streams') {
      window.location.href = `${pathname}?root=${encodeURIComponent(newRoot)}`;
    } else {
      // For other pages, redirect to home
      window.location.href = `/?root=${encodeURIComponent(newRoot)}`;
    }
  };

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-8 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-gray-700">
              Product Creator
            </Link>

            <nav className="flex gap-1">
              <Link
                href="/"
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  isActive('/')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Functions
              </Link>
              <Link
                href="/workflows"
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  isActive('/workflows')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Workflows
              </Link>
              <Link
                href="/streams"
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  isActive('/streams')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Streams
              </Link>
              <Link
                href="/graph"
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  isActive('/graph')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Graph
              </Link>
              <Link
                href="/matrix"
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  isActive('/matrix')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Matrix
              </Link>
            </nav>
          </div>

          {roots.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Directory:</label>
              <select
                value={selectedRoot}
                onChange={(e) => handleRootChange(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded bg-white text-gray-900 text-sm"
              >
                {roots.map((root) => (
                  <option key={root.path} value={root.path}>
                    {root.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
