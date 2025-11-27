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
  const [showSyncForm, setShowSyncForm] = useState<boolean>(false);
  const [syncApp, setSyncApp] = useState<AppEntity | null>(null);
  const [syncId, setSyncId] = useState<string | null>(null);
  const [syncStage, setSyncStage] = useState<'loading' | 'matching' | 'executing' | 'completed' | 'error'>('loading');
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; message?: string; error?: string }>({ current: 0, total: 1 });
  const [matchedObjects, setMatchedObjects] = useState<any[]>([]);
  const [matchedFunctions, setMatchedFunctions] = useState<any[]>([]);
  const [syncType, setSyncType] = useState<'schema' | 'code'>('schema');
  const [syncActions, setSyncActions] = useState<Record<string, 'skip' | 'update' | 'create' | 'delete'>>({});
  const [syncSearchQuery, setSyncSearchQuery] = useState<string>('');
  const [syncStatusFilter, setSyncStatusFilter] = useState<string>('all');

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

  const handleSyncFromCode = async (app: AppEntity) => {
    if (!app.codeBasePath) {
      setError('Code base path is not set for this application');
      return;
    }
    try {
      setError('');
      setSyncApp(app);
      setSyncType('code');
      setShowSyncForm(true);
      setSyncStage('loading');
      setSyncProgress({ current: 0, total: 1, message: 'Starting synchronization...' });
      setMatchedFunctions([]);
      setMatchedObjects([]);
      setSyncActions({});

      // Start sync
      const response = await fetch(`/api/apps/${app.id}/sync-code/start`, {
        method: 'POST',
      });
      
      let data: any;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error(`Failed to start sync: ${response.statusText || 'Unknown error'}`);
      }
      
      if (!response.ok) {
        throw new Error(data.error || data.message || `Failed to start sync: ${response.statusText}`);
      }

      setSyncId(data.syncId);
      
      // Start polling for status
      pollCodeSyncStatus(app.id, data.syncId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start sync from code';
      setError(errorMessage);
      setSyncStage('error');
      setSyncProgress({
        current: 0,
        total: 1,
        message: 'Не удалось запустить синхронизацию',
        error: errorMessage,
      });
    }
  };

  const handleSyncFromSchema = async (app: AppEntity) => {
    if (!app.dbSchemaPath) {
      setError('DB schema path is not set for this application');
      return;
    }
    try {
      setError('');
      setSyncApp(app);
      setSyncType('schema');
      setShowSyncForm(true);
      setSyncStage('loading');
      setSyncProgress({ current: 0, total: 1, message: 'Starting synchronization...' });
      setMatchedObjects([]);
      setMatchedFunctions([]);
      setSyncActions({});

      // Start sync
      const response = await fetch(`/api/apps/${app.id}/sync-schema/start`, {
        method: 'POST',
      });
      
      let data: any;
      try {
        data = await response.json();
      } catch (e) {
        // If response is not JSON, use the status text
        throw new Error(`Failed to start sync: ${response.statusText || 'Unknown error'}`);
      }
      
      if (!response.ok) {
        throw new Error(data.error || data.message || `Failed to start sync: ${response.statusText}`);
      }

      setSyncId(data.syncId);
      
      // Start polling for status
      pollSyncStatus(app.id, data.syncId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start sync from schema';
      setError(errorMessage);
      setSyncStage('error');
      setSyncProgress({
        current: 0,
        total: 1,
        message: 'Не удалось запустить синхронизацию',
        error: errorMessage,
      });
      // Don't hide the form - show error instead
    }
  };

  const pollCodeSyncStatus = async (appId: string, currentSyncId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/apps/${appId}/sync-code/status/${currentSyncId}`);
        if (!response.ok) {
          if (response.status === 404) {
            // State was lost - show error to user
            console.error('Sync state not found (404)', { syncId: currentSyncId });
            setSyncStage('error');
            setError('Состояние синхронизации потеряно. Попробуйте запустить синхронизацию заново.');
            setSyncProgress({
              current: 0,
              total: 1,
              message: 'Ошибка: состояние синхронизации не найдено',
              error: 'Состояние синхронизации потеряно',
            });
            return; // Stop polling
          }
          console.error('Failed to fetch sync status', response.status, response.statusText);
          // Retry after delay for other errors
          setTimeout(poll, 1000);
          return;
        }
        const data = await response.json();
        
        if (data.syncId !== currentSyncId) {
          console.log('Different sync session, stopping poll');
          return; // Different sync session
        }

        // Only switch to 'matching' stage if we have matched functions
        const hasMatchedFunctions = data.matchedFunctions && Array.isArray(data.matchedFunctions) && data.matchedFunctions.length > 0;
        const effectiveStage = data.stage === 'matching' && !hasMatchedFunctions ? 'loading' : data.stage;

        console.log('Sync status update', {
          stage: effectiveStage,
          progress: data.progress,
          hasMatchedFunctions,
          matchedCount: data.matchedFunctions?.length || 0,
        });

        setSyncStage(effectiveStage);
        setSyncProgress({
          current: data.progress.current || 0,
          total: data.progress.total || 1,
          message: data.progress.message,
          error: data.progress.error,
        });

        if (data.matchedFunctions && Array.isArray(data.matchedFunctions)) {
          setMatchedFunctions(data.matchedFunctions);
          // Initialize actions from matched functions
          const actions: Record<string, 'skip' | 'update' | 'create' | 'delete'> = {};
          data.matchedFunctions.forEach((func: any) => {
            const key = `${func.exportedFunction.relativePath}:${func.exportedFunction.name}`;
            actions[key] = func.action;
          });
          // Merge with existing actions (user may have changed them)
          setSyncActions((prev) => ({ ...prev, ...actions, ...data.actions }));
        }

        // Continue polling if not completed or error
        if (effectiveStage === 'loading' || (effectiveStage === 'matching' && hasMatchedFunctions) || effectiveStage === 'executing') {
          setTimeout(poll, 500);
        } else if (effectiveStage === 'error') {
          const errorMsg = data.progress.error || data.progress.message || 'Произошла ошибка при синхронизации';
          setError(errorMsg);
          setSyncProgress((prev) => ({
            ...prev,
            error: errorMsg,
            message: `Ошибка: ${errorMsg}`,
          }));
        } else if (effectiveStage === 'completed') {
          // Stop polling on completion
          console.log('Sync completed successfully');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to poll sync status';
        console.error('Failed to poll code sync status', err);
        setSyncStage('error');
        setSyncProgress({
          current: 0,
          total: 1,
          message: 'Не удалось получить статус синхронизации',
          error: errorMessage,
        });
        setError(errorMessage);
      }
    };
    // Start polling immediately
    poll();
  };

  const pollSyncStatus = async (appId: string, currentSyncId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/apps/${appId}/sync-schema/status/${currentSyncId}`);
        if (!response.ok) return;
        const data = await response.json();
        
        if (data.syncId !== currentSyncId) return; // Different sync session

        setSyncStage(data.stage);
        setSyncProgress({
          current: data.progress.current || 0,
          total: data.progress.total || 1,
          message: data.progress.message,
          error: data.progress.error,
        });

        if (data.matchedObjects) {
          setMatchedObjects(data.matchedObjects);
          // Initialize actions from matched objects
          const actions: Record<string, 'skip' | 'update' | 'create' | 'delete'> = {};
          data.matchedObjects.forEach((obj: any) => {
            actions[obj.prismaModel.name] = obj.action;
          });
          // Merge with existing actions (user may have changed them)
          setSyncActions((prev) => ({ ...prev, ...actions, ...data.actions }));
        }

        // Continue polling if not completed or error
        if (data.stage === 'loading' || data.stage === 'matching' || data.stage === 'executing') {
          setTimeout(poll, 500);
        } else if (data.stage === 'error') {
          // Stop polling on error, error is already displayed
          setError(data.progress.error || 'Произошла ошибка при синхронизации');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to poll sync status';
        console.error('Failed to poll sync status', err);
        setSyncStage('error');
        setSyncProgress({
          current: 0,
          total: 1,
          message: 'Не удалось получить статус синхронизации',
          error: errorMessage,
        });
        setError(errorMessage);
      }
    };
    poll();
  };

  const handleSyncActionChange = async (key: string, action: 'skip' | 'update' | 'create' | 'delete') => {
    if (!syncApp || !syncId) return;
    
    setSyncActions((prev) => ({ ...prev, [key]: action }));

    // Save action to server
    try {
      const endpoint = syncType === 'code' ? 'sync-code' : 'sync-schema';
      const paramName = syncType === 'code' ? 'functionKey' : 'modelName';
      await fetch(`/api/apps/${syncApp.id}/${endpoint}/actions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncId,
          [paramName]: key,
          action,
        }),
      });
    } catch (err) {
      console.error('Failed to save action', err);
    }
  };

  const handleExecuteSync = async () => {
    if (!syncApp || !syncId) return;

    try {
      setSyncStage('executing');
      setError('');

      const endpoint = syncType === 'code' ? 'sync-code' : 'sync-schema';

      // Save all actions
      await fetch(`/api/apps/${syncApp.id}/${endpoint}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncId,
          actions: syncActions,
        }),
      });

      // Start execution
      const response = await fetch(`/api/apps/${syncApp.id}/${endpoint}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to execute sync');
      }

      // Start polling for execution progress
      if (syncType === 'code') {
        pollCodeSyncStatus(syncApp.id, syncId);
      } else {
        pollSyncStatus(syncApp.id, syncId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute sync');
      setSyncStage('error');
    }
  };

  const resetSyncForm = () => {
    setShowSyncForm(false);
    setSyncApp(null);
    setSyncId(null);
    setSyncStage('loading');
    setSyncProgress({ current: 0, total: 1 });
    setMatchedObjects([]);
    setMatchedFunctions([]);
    setSyncType('schema');
    setSyncActions({});
    setSyncSearchQuery('');
    setSyncStatusFilter('all');
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
        <div className="grid gap-6 lg:grid-cols-2 h-[calc(100vh-12rem)]">
          <section className="bg-white rounded-lg shadow p-6 flex flex-col h-full">
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

            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
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

          <section className="bg-white rounded-lg shadow p-6 flex flex-col h-full">
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

            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
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
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleSyncFromCode(app)}
                      disabled={!app.codeBasePath}
                      title={app.codeBasePath ? 'Synchronize objects from code' : 'Code base path is not set'}
                    >
                      Sync from Code
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleSyncFromSchema(app)}
                      disabled={!app.dbSchemaPath}
                      title={app.dbSchemaPath ? 'Synchronize objects from DB schema' : 'DB schema path is not set'}
                    >
                      Sync from Schema
                    </button>
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

            {showSyncForm && syncApp && (
              <div className="mt-6 space-y-4 border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Sync From {syncType === 'code' ? 'Code' : 'Schema'}: {syncApp.name}
                  </h3>
                  <button
                    type="button"
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    onClick={resetSyncForm}
                  >
                    Close
                  </button>
                </div>

                {/* Stage 1: Loading */}
                {syncStage === 'loading' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                        <span>Загрузка данных {syncType === 'code' ? 'из кода' : 'из схемы'}</span>
                        <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                        />
                      </div>
                      {syncProgress.message && (
                        <p className="text-sm text-gray-500 mt-2">{syncProgress.message}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Stage 2: Matching */}
                {syncStage === 'matching' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                        <span>Сопоставление данных</span>
                        <span>{syncType === 'code' ? matchedFunctions.length : matchedObjects.length} {syncType === 'code' ? 'функций' : 'объектов'}</span>
                      </div>
                      {syncProgress.message && (
                        <p className="text-sm text-gray-500 mb-4">{syncProgress.message}</p>
                      )}
                    </div>

                    {/* Search and Filter */}
                    <div className="flex gap-4">
                      <input
                        type="text"
                        placeholder="Поиск по имени..."
                        value={syncSearchQuery}
                        onChange={(e) => setSyncSearchQuery(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                      <select
                        value={syncStatusFilter}
                        onChange={(e) => setSyncStatusFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded text-sm"
                      >
                        <option value="all">Все статусы</option>
                        <option value="new">Новый</option>
                        <option value="matched">Сопоставлен</option>
                        <option value="needs_matching">Нужно сопоставить</option>
                        <option value="delete">Удалить</option>
                      </select>
                    </div>

                    {/* Matched Objects/Functions Table */}
                    {((syncType === 'code' && matchedFunctions.length > 0) || (syncType === 'schema' && matchedObjects.length > 0)) && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="max-h-96 overflow-y-auto">
                          <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              {syncType === 'code' ? (
                                <>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Функция</th>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Файл</th>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Функция в YAML</th>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Статус</th>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Действие</th>
                                </>
                              ) : (
                                <>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Модель</th>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Бизнес-объект</th>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Статус</th>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Действие</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {syncType === 'code' ? (
                              matchedFunctions
                                .filter((func) => {
                                  const matchesSearch = func.exportedFunction.name.toLowerCase().includes(syncSearchQuery.toLowerCase()) ||
                                    func.exportedFunction.relativePath.toLowerCase().includes(syncSearchQuery.toLowerCase());
                                  const matchesFilter = syncStatusFilter === 'all' || func.status === syncStatusFilter;
                                  return matchesSearch && matchesFilter;
                                })
                                .map((func, idx) => {
                                  const key = `${func.exportedFunction.relativePath}:${func.exportedFunction.name}`;
                                  return (
                                    <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                                      <td className="px-4 py-2">
                                        <div className="font-medium">{func.exportedFunction.name}</div>
                                        {func.exportedFunction.isAsync && (
                                          <span className="text-xs text-gray-500">async</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className="text-xs font-mono text-gray-600">{func.exportedFunction.relativePath}</span>
                                      </td>
                                      <td className="px-4 py-2">
                                        {func.functionCard ? (
                                          <span className="text-gray-700">{func.functionCard.name} ({func.functionCard.id})</span>
                                        ) : (
                                          <span className="text-gray-400">—</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className={`px-2 py-1 rounded text-xs ${
                                          func.status === 'new' ? 'bg-green-100 text-green-800' :
                                          func.status === 'matched' ? 'bg-blue-100 text-blue-800' :
                                          func.status === 'needs_matching' ? 'bg-yellow-100 text-yellow-800' :
                                          'bg-red-100 text-red-800'
                                        }`}>
                                          {func.status === 'new' ? 'Новый' :
                                           func.status === 'matched' ? 'Сопоставлен' :
                                           func.status === 'needs_matching' ? 'Нужно сопоставить' :
                                           'Удалить'}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2">
                                        <select
                                          value={syncActions[key] || func.action}
                                          onChange={(e) => handleSyncActionChange(key, e.target.value as any)}
                                          className="px-2 py-1 border border-gray-300 rounded text-xs"
                                        >
                                          <option value="skip">Пропустить</option>
                                          <option value="update">Обновить</option>
                                          <option value="create">Создать</option>
                                          <option value="delete">Удалить</option>
                                        </select>
                                      </td>
                                    </tr>
                                  );
                                })
                            ) : (
                              matchedObjects
                                .filter((obj) => {
                                  const matchesSearch = obj.prismaModel.name.toLowerCase().includes(syncSearchQuery.toLowerCase());
                                  const matchesFilter = syncStatusFilter === 'all' || obj.status === syncStatusFilter;
                                  return matchesSearch && matchesFilter;
                                })
                                .map((obj, idx) => (
                                  <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                                    <td className="px-4 py-2">{obj.prismaModel.name}</td>
                                    <td className="px-4 py-2">
                                      {obj.businessObject ? (
                                        <span className="text-gray-700">{obj.businessObject.name}</span>
                                      ) : (
                                        <span className="text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2">
                                      <span className={`px-2 py-1 rounded text-xs ${
                                        obj.status === 'new' ? 'bg-green-100 text-green-800' :
                                        obj.status === 'matched' ? 'bg-blue-100 text-blue-800' :
                                        obj.status === 'needs_matching' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {obj.status === 'new' ? 'Новый' :
                                         obj.status === 'matched' ? 'Сопоставлен' :
                                         obj.status === 'needs_matching' ? 'Нужно сопоставить' :
                                         'Удалить'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2">
                                      <select
                                        value={syncActions[obj.prismaModel.name] || obj.action}
                                        onChange={(e) => handleSyncActionChange(obj.prismaModel.name, e.target.value as any)}
                                        className="px-2 py-1 border border-gray-300 rounded text-xs"
                                      >
                                        <option value="skip">Пропустить</option>
                                        <option value="update">Обновить</option>
                                        <option value="create">Создать</option>
                                        <option value="delete">Удалить</option>
                                      </select>
                                    </td>
                                  </tr>
                                ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    )}

                    {((syncType === 'code' && matchedFunctions.length === 0) || (syncType === 'schema' && matchedObjects.length === 0)) && syncStage === 'matching' && (
                      <div className="text-center py-8 text-gray-500">
                        <p>Ожидание данных...</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        onClick={handleExecuteSync}
                      >
                        Выполнить синхронизацию
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
                        onClick={resetSyncForm}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}

                {/* Stage 3: Executing */}
                {syncStage === 'executing' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                        <span>Создание и удаление данных</span>
                        <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                        />
                      </div>
                      {syncProgress.message && (
                        <p className="text-sm text-gray-500 mt-2">{syncProgress.message}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Stage 4: Completed */}
                {syncStage === 'completed' && (
                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-sm text-green-800 font-semibold">Синхронизация завершена успешно</p>
                      <p className="text-sm text-green-600 mt-1">{syncProgress.message}</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        onClick={() => {
                          resetSyncForm();
                          loadData();
                        }}
                      >
                        Закрыть и обновить
                      </button>
                    </div>
                  </div>
                )}

                {/* Stage 5: Error */}
                {syncStage === 'error' && (
                  <div className="space-y-4">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-red-800 font-semibold">Ошибка синхронизации</p>
                      <p className="text-sm text-red-600 mt-1">
                        {syncProgress.error || syncProgress.message || 'Произошла ошибка при синхронизации'}
                      </p>
                      {(syncProgress.error || syncProgress.message) && (
                        <details className="mt-2">
                          <summary className="text-sm text-red-700 cursor-pointer hover:text-red-800">Подробности ошибки</summary>
                          <pre className="mt-2 text-xs text-red-600 bg-red-100 p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap break-words">
                            {syncProgress.error || syncProgress.message}
                          </pre>
                        </details>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
                        onClick={resetSyncForm}
                      >
                        Закрыть
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

