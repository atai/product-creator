'use client';

import { useEffect, useMemo, useState, FormEvent, useRef } from 'react';
import { Project, AppEntity } from '@/lib/types';
import { useRoots } from '@/hooks/useRoots';

type FormMode = 'create' | 'edit';

interface ProjectFormState {
  id: string;
  name: string;
  description: string;
  mode: FormMode;
}

interface AppFormState {
  id: string;
  name: string;
  projectId: string;
  directory: string;
  codeBasePath: string;
  dbSchemaPath: string;
  mode: FormMode;
}

const defaultProjectForm: ProjectFormState = {
  id: '',
  name: '',
  description: '',
  mode: 'create',
};

const defaultAppForm: AppFormState = {
  id: '',
  name: '',
  projectId: '',
  directory: '',
  codeBasePath: '',
  dbSchemaPath: '',
  mode: 'create',
};

export default function ProjectsManagementPage() {
  const { roots } = useRoots();
  const [projects, setProjects] = useState<Project[]>([]);
  const [apps, setApps] = useState<AppEntity[]>([]);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(defaultProjectForm);
  const [appForm, setAppForm] = useState<AppFormState>(defaultAppForm);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [showAppForm, setShowAppForm] = useState<boolean>(false);
  const [showProjectForm, setShowProjectForm] = useState<boolean>(false);

  const resetProjectForm = (showForm: boolean = false) => {
    setProjectForm(defaultProjectForm);
    setShowProjectForm(showForm);
  };

  const resetAppForm = (projectId?: string, directory?: string, showForm: boolean = false) => {
    setAppForm({
      ...defaultAppForm,
      projectId: projectId || defaultAppForm.projectId,
      directory: directory || defaultAppForm.directory,
    });
    setShowAppForm(showForm);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [projectRes, appRes] = await Promise.all([fetch('/api/projects'), fetch('/api/apps')]);
      if (!projectRes.ok) {
        throw new Error('Failed to load projects');
      }
      if (!appRes.ok) {
        throw new Error('Failed to load apps');
      }
      const projectData = await projectRes.json();
      const appData = await appRes.json();
      const fetchedProjects: Project[] = projectData.projects || [];
      setProjects(fetchedProjects);
      setApps(appData.apps || []);
      const resolvedSelection =
        selectedProjectId && fetchedProjects.some((project) => project.id === selectedProjectId)
          ? selectedProjectId
          : fetchedProjects[0]?.id || '';
      setSelectedProjectId(resolvedSelection);
      resetProjectForm(false);
      resetAppForm(resolvedSelection, '', false);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProjectSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectForm.name.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setStatusMessage('');
      const payload: Record<string, string> = {
        name: projectForm.name.trim(),
      };
      if (projectForm.description) {
        payload.description = projectForm.description;
      }
      if (projectForm.mode === 'create' && projectForm.id) {
        payload.id = projectForm.id.toLowerCase();
      }

      const response = await fetch(
        projectForm.mode === 'create' ? '/api/projects' : `/api/projects/${projectForm.id}`,
        {
          method: projectForm.mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save project');
      }

      setStatusMessage(
        projectForm.mode === 'create'
          ? `Project ${data.project.id} created`
          : `Project ${data.project.id} updated`
      );
      setShowProjectForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
    }
  };

  const handleProjectEdit = (project: Project) => {
    setProjectForm({
      id: project.id,
      name: project.name,
      description: project.description || '',
      mode: 'edit',
    });
    setShowProjectForm(true);
  };

  const handleProjectDelete = async (project: Project) => {
    if (!confirm(`Delete project ${project.name}?`)) return;
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete project');
      }
      setStatusMessage(`Project ${project.id} deleted`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  const handleAppSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!appForm.name.trim()) {
      setError('App name is required');
      return;
    }
    if (!selectedProjectId) {
      setError('Please select a project first');
      return;
    }
    const rootDirectory = appForm.directory || roots[0]?.path || '';
    if (!rootDirectory) {
      setError('Directory is required');
      return;
    }

    try {
      setStatusMessage('');
      const payload: Record<string, string> = {
        name: appForm.name.trim(),
        projectId: selectedProjectId, // Always use selected project
        directory: rootDirectory,
      };
      if (appForm.codeBasePath) payload.codeBasePath = appForm.codeBasePath;
      if (appForm.dbSchemaPath) payload.dbSchemaPath = appForm.dbSchemaPath;
      if (appForm.mode === 'create' && appForm.id) payload.id = appForm.id.toLowerCase();

      const response = await fetch(
        appForm.mode === 'create' ? '/api/apps' : `/api/apps/${appForm.id}`,
        {
          method: appForm.mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save app');
      }
      setStatusMessage(
        appForm.mode === 'create' ? `App ${data.app.id} created` : `App ${data.app.id} updated`
      );
      setShowAppForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save app');
    }
  };

  const handleAppEdit = (app: AppEntity) => {
    setAppForm({
      id: app.id,
      name: app.name,
      projectId: app.projectId,
      directory: app.directory,
      codeBasePath: app.codeBasePath || '',
      dbSchemaPath: app.dbSchemaPath || '',
      mode: 'edit',
    });
  };

  const handleAppDelete = async (app: AppEntity) => {
    if (!confirm(`Delete app ${app.name}?`)) return;
    try {
      const response = await fetch(`/api/apps/${app.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete app');
      }
      setStatusMessage(`App ${app.id} deleted`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete app');
    }
  };

  useEffect(() => {
    // Update app form projectId when selectedProjectId changes (only in create mode)
    if (appForm.mode === 'create' && selectedProjectId) {
      setAppForm((prev) => ({ ...prev, projectId: selectedProjectId }));
    }
  }, [selectedProjectId, appForm.mode]);

  // Removed auto-fill for directory - let user choose manually

  const appsByProject = useMemo(() => {
    if (!selectedProjectId) return apps;
    return apps.filter((app) => app.projectId === selectedProjectId);
  }, [apps, selectedProjectId]);

  // Help tooltip component
  const HelpTooltip = ({ text }: { text: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (event: MouseEvent) => {
        if (
          tooltipRef.current &&
          buttonRef.current &&
          !tooltipRef.current.contains(event.target as Node) &&
          !buttonRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      };

      const handleEsc = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEsc);
      };
    }, [isOpen]);

    return (
      <div className="relative inline-block">
        <button
          type="button"
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 focus:outline-none"
          aria-label="Help"
        >
          ?
        </button>
        {isOpen && (
          <div
            ref={tooltipRef}
            className="absolute left-0 z-20 mt-2 w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg"
          >
            <p className="text-sm text-gray-600">{text}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="bg-white rounded-lg shadow px-6 py-5 mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Projects & Apps</h1>
        <p className="mt-2 text-gray-600">
          Manage projects and their associated applications. IDs are generated automatically, but
          you can set them when creating. After creation, identifiers become immutable.
        </p>
        {statusMessage && <div className="mt-3 text-sm text-green-600">{statusMessage}</div>}
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      </div>

      {loading ? (
        <div className="text-center text-gray-600 py-12">Loading projects and apps...</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Projects</h2>
                <p className="text-sm text-gray-600">Total: {projects.length}</p>
              </div>
              <button
                type="button"
                className="text-sm text-blue-600 hover:text-blue-800"
                onClick={() => resetProjectForm(true)}
              >
                + New Project
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {projects.map((project) => {
                const projectApps = apps.filter((app) => app.projectId === project.id);
                const isSelected = selectedProjectId === project.id;
                return (
                  <div
                    key={project.id}
                    className={`border rounded-lg p-4 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => {
                      // Check if app form has unsaved changes (compare with default form, ignore projectId as it's set automatically)
                      const hasChanges = appForm.mode === 'create' && (
                        appForm.name.trim() !== defaultAppForm.name ||
                        appForm.directory.trim() !== defaultAppForm.directory ||
                        appForm.codeBasePath.trim() !== defaultAppForm.codeBasePath ||
                        appForm.dbSchemaPath.trim() !== defaultAppForm.dbSchemaPath ||
                        appForm.id.trim() !== defaultAppForm.id
                      );
                      if (hasChanges) {
                        if (!confirm('You have unsaved changes in the Create App form. Changing the project will discard these changes. Continue?')) {
                          return;
                        }
                      }
                      setSelectedProjectId(project.id);
                      resetAppForm(project.id, '', false);
                    }}
                  >
                    <div className="flex-1">
                      <div className="text-sm text-gray-500 uppercase tracking-wide">{project.id}</div>
                      <div className="text-lg font-semibold text-gray-900">{project.name}</div>
                      {project.description && (
                        <p className="text-sm text-gray-600 mt-1">{project.description}</p>
                      )}
                      <div className="text-xs text-gray-500 mt-2">
                        Apps: {projectApps.length}
                      </div>
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        onClick={() => {
                          handleProjectEdit(project);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50"
                        onClick={() => handleProjectDelete(project)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {projects.length === 0 && (
                  <div className="text-sm text-gray-500 text-center py-6">
                  No projects yet. Create the first project to add applications.
                </div>
              )}
            </div>

            {((projectForm.mode === 'create' && showProjectForm) || projectForm.mode === 'edit') && (
              <form className="mt-6 space-y-4" onSubmit={handleProjectSubmit}>
                <h3 className="text-lg font-semibold text-gray-900">
                  {projectForm.mode === 'create' ? 'Create Project' : `Edit Project ${projectForm.id}`}
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700">ID (5 letters)</label>
                  <input
                    type="text"
                    value={projectForm.id}
                    disabled={projectForm.mode === 'edit'}
                    onChange={(e) => setProjectForm((prev) => ({ ...prev, id: e.target.value }))}
                    placeholder="auto"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={projectForm.name}
                    onChange={(e) => setProjectForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={projectForm.description}
                    onChange={(e) =>
                      setProjectForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={3}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    {projectForm.mode === 'create' ? 'Create' : 'Save'}
                  </button>
                  {(projectForm.mode === 'edit' || showProjectForm) && (
                    <button
                      type="button"
                      className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
                      onClick={() => resetProjectForm(false)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
          </section>

          <section className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Applications</h2>
                <p className="text-sm text-gray-600">
                  {selectedProjectId
                    ? `Project: ${selectedProjectId} (${appsByProject.length})`
                    : `Select a project to view applications`}
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-blue-600 hover:text-blue-800"
                onClick={() => {
                  if (!selectedProjectId) {
                    alert('Please select a project first');
                    return;
                  }
                  resetAppForm(selectedProjectId, '', true);
                }}
                disabled={!selectedProjectId}
              >
                + New Application
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {appsByProject.map((app) => (
                <div
                  key={app.id}
                  className="border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm text-gray-500 uppercase tracking-wide">{app.id}</div>
                    <div className="text-lg font-semibold text-gray-900">{app.name}</div>
                    <div className="text-xs text-gray-500 mt-2">
                      Directory: <span className="font-mono">{app.directory}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Code: {app.codeBasePath || '-'} | DB: {app.dbSchemaPath || '-'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                      onClick={() => handleAppEdit(app)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50"
                      onClick={() => handleAppDelete(app)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {appsByProject.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-6">
                  No applications for the selected project.
                </div>
              )}
            </div>

            {((appForm.mode === 'create' && showAppForm) || appForm.mode === 'edit') && (
              <form className="mt-6 space-y-4" onSubmit={handleAppSubmit}>
                <h3 className="text-lg font-semibold text-gray-900">
                  {appForm.mode === 'create' ? 'Create App' : `Edit App ${appForm.id}`}
                </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">App ID</label>
                  <input
                    type="text"
                    value={appForm.id}
                    disabled={appForm.mode === 'edit'}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, id: e.target.value }))}
                    placeholder="project-abc"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={appForm.name}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {selectedProjectId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Project</label>
                  <input
                    type="text"
                    value={projects.find(p => p.id === selectedProjectId)?.name || selectedProjectId}
                    disabled
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm bg-gray-100 text-gray-600"
                  />
                </div>
              )}
              
              <div className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h4 className="text-sm font-semibold text-gray-900">Paths Configuration</h4>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    Directory
                    <HelpTooltip text="YAML files describing all project entities will be created at this path." />
                  </label>
                  <input
                    type="text"
                    value={appForm.directory}
                    disabled={appForm.mode === 'edit'}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, directory: e.target.value }))}
                    placeholder="/absolute/path/to/directory"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 font-mono text-xs"
                    required
                  />
                </div>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    Code base
                    <HelpTooltip text="This path is used for application code analysis and should point to the root folder containing the application code." />
                  </label>
                  <input
                    type="text"
                    value={appForm.codeBasePath}
                    onChange={(e) =>
                      setAppForm((prev) => ({ ...prev, codeBasePath: e.target.value }))
                    }
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono text-xs"
                    placeholder="./src"
                  />
                </div>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    DB schema
                    <HelpTooltip text="This path points to the database schema and is used for analyzing the application's database schema." />
                  </label>
                  <input
                    type="text"
                    value={appForm.dbSchemaPath}
                    onChange={(e) =>
                      setAppForm((prev) => ({ ...prev, dbSchemaPath: e.target.value }))
                    }
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono text-xs"
                    placeholder="./db/schema"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  {appForm.mode === 'create' ? 'Create' : 'Save'}
                </button>
                {(appForm.mode === 'edit' || showAppForm) && (
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
                    onClick={() => {
                      resetAppForm(selectedProjectId, '', false);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

