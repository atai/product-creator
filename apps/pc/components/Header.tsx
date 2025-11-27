'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function Header() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [apps, setApps] = useState<{ id: string; name: string; directory: string; projectId: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedApp, setSelectedApp] = useState<string>('');
  const rootAwarePaths = new Set([
    '/',
    '/graph',
    '/matrix',
    '/workflows',
    '/streams',
    '/business-objects',
    '/functions',
    '/doc',
  ]);

  const buildHrefWithParams = (path: string, appValue?: string) => {
    const resolvedApp = appValue ?? selectedApp;
    const targetPath = rootAwarePaths.has(path) ? path : '/';
    const params = new URLSearchParams();
    if (resolvedApp) {
      params.set('app', resolvedApp);
    }
    const query = params.toString();
    return query ? `${targetPath}?${query}` : targetPath;
  };

  const navigateWithApp = (path: string, appValue?: string) => {
    const href = buildHrefWithParams(path, appValue);
    router.push(href);
  };

  useEffect(() => {
    const appParam = searchParams.get('app');
    if (appParam) {
      setSelectedApp(appParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [appsResponse, projectsResponse] = await Promise.all([
          fetch('/api/apps'),
          fetch('/api/projects'),
        ]);
        
        if (!appsResponse.ok || !projectsResponse.ok) {
          throw new Error('Failed to fetch data');
        }
        
        const appsData = await appsResponse.json();
        const projectsData = await projectsResponse.json();
        
        setApps(appsData.apps || []);
        setProjects(projectsData.projects || []);
      } catch (error) {
        console.error('Failed to load apps or projects', error);
      }
    };
    loadData();
  }, []);

  // Create a map of project IDs to project names for quick lookup
  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((project) => {
      map.set(project.id, project.name);
    });
    return map;
  }, [projects]);

  const handleAppChange = (newApp: string) => {
    setSelectedApp(newApp);
    const href = buildHrefWithParams(pathname, newApp || undefined);
    router.push(href);
  };

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname.startsWith(path)) return true;
    return false;
  };

  const presentationItems = [
    { label: 'Graph', path: '/graph' },
    { label: 'Matrix', path: '/matrix' },
    { label: 'Doc', path: '/doc' },
  ];

  const [presentationOpen, setPresentationOpen] = useState(false);
  const presentationRef = useRef<HTMLDivElement | null>(null);
  const togglePresentation = () => setPresentationOpen((prev) => !prev);
  const closePresentation = () => setPresentationOpen(false);

  useEffect(() => {
    if (!presentationOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (presentationRef.current && !presentationRef.current.contains(event.target as Node)) {
        setPresentationOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [presentationOpen]);

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="w-full px-4 sm:px-8 py-4">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-4 lg:gap-8">
            <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-gray-700">
              Product Creator
            </Link>

            <nav className="flex flex-wrap gap-1 relative">
              {[
                { label: 'Objects', path: '/business-objects' },
                { label: 'Workflows', path: '/workflows' },
                { label: 'Functions', path: '/functions' },
                { label: 'Streams', path: '/streams' },
              ].map((item) => (
                <Link
                  key={item.path}
                  href={buildHrefWithParams(item.path)}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateWithApp(item.path);
                  }}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </Link>
              ))}

              <div className="relative" ref={presentationRef}>
                <button
                  type="button"
                  onClick={togglePresentation}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
                    presentationItems.some((item) => isActive(item.path))
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  Presentation
                  <span className="text-xs">{presentationOpen ? '▲' : '▼'}</span>
                </button>
                {presentationOpen && (
                  <div className="absolute left-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                    {presentationItems.map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => {
                          navigateWithApp(item.path);
                          closePresentation();
                        }}
                        className={`w-full text-left px-4 py-2 text-sm ${
                          isActive(item.path)
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Apps:</label>
              <select
                value={selectedApp}
                onChange={(e) => handleAppChange(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded bg-white text-gray-900 text-sm min-w-[200px]"
              >
                <option value="">All apps</option>
                {apps.map((app) => {
                  const projectName = projectMap.get(app.projectId) || app.projectId;
                  return (
                    <option key={app.id} value={app.id}>
                      {projectName}: {app.name}
                    </option>
                  );
                })}
              </select>
            </div>

            <Link
              href="/projects"
              className="inline-flex items-center justify-center rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              title="Manage projects and apps"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 3a1 1 0 011 1v2.268a2 2 0 010 3.464V14a1 1 0 11-2 0v-2.268a2 2 0 010-3.464V6a1 1 0 011-1z"
                  fill="currentColor"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
