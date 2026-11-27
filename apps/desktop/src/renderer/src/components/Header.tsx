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
    '/features',
    '/doc',
    '/interfaces',
    '/problems',
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
    <header className="app-header">
      <div className="w-full px-4 sm:px-8 py-4">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-4 lg:gap-8">
            <Link href="/" className="app-header__brand">
              Product Creator
            </Link>

            <nav className="flex flex-wrap gap-1 relative">
              {[
                { label: 'Objects', path: '/business-objects' },
                { label: 'Workflows', path: '/workflows' },
                { label: 'Features', path: '/features' },
                { label: 'Streams', path: '/streams' },
                { label: 'Interfaces', path: '/interfaces' },
                { label: 'Problems', path: '/problems' },
              ].map((item) => (
                <Link
                  key={item.path}
                  href={buildHrefWithParams(item.path)}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateWithApp(item.path);
                  }}
                  className={`app-nav-link ${isActive(item.path) ? 'app-nav-link--active' : ''}`}
                >
                  {item.label}
                </Link>
              ))}

              <div className="relative" ref={presentationRef}>
                <button
                  type="button"
                  onClick={togglePresentation}
                  className={`app-nav-link flex items-center gap-2 ${
                    presentationItems.some((item) => isActive(item.path)) ? 'app-nav-link--active' : ''
                  }`}
                >
                  Presentation
                  <span className="text-xs">{presentationOpen ? '▲' : '▼'}</span>
                </button>
                {presentationOpen && (
                  <div className="app-nav-menu">
                    {presentationItems.map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => {
                          navigateWithApp(item.path);
                          closePresentation();
                        }}
                        className={`app-nav-menu__item ${
                          isActive(item.path) ? 'app-nav-menu__item--active' : ''
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
              <label className="text-sm font-medium text-fg-2">Apps:</label>
              <select
                value={selectedApp}
                onChange={(e) => handleAppChange(e.target.value)}
                className="px-3 py-1.5 border border-border-strong rounded bg-surface text-fg text-sm min-w-[200px]"
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
              href="/workspace"
              className="inline-flex items-center justify-center rounded border border-border-strong bg-surface px-3 py-1.5 text-sm text-fg-2 hover:bg-bg"
              title="Workspace: opened projects and services"
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
            <Link
              href="/settings"
              className="inline-flex items-center justify-center rounded border border-border-strong bg-surface px-3 py-1.5 text-sm text-fg-2 hover:bg-bg"
              title="Settings: MCP server for AI agents"
            >
              Settings
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
