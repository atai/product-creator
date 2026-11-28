'use client';

import { useEffect, useMemo, useState, FormEvent, useRef } from 'react';
import { Project, AppEntity } from '@pc/core/types';
import { useRoots } from '@/hooks/useRoots';
import type { MatchedObject, SyncAction as SyncActionType } from '@pc/core/sync/matcher';
import type { MatchedFunction, SyncAction as CodeSyncAction } from '@pc/core/sync/codeMatcher';
import { t } from '@/i18n';

/** Actions of the schema sync and of the code sync (link / unlink, PRODUCTCREATOR-30) */
type AnySyncAction = SyncActionType | CodeSyncAction;

/** Shape of the JSON returned by the sync start/status endpoints */
interface SyncApiResponse {
  error?: string;
  message?: string;
  syncId?: string;
  stage?: string;
  progress?: { current: number; total: number; message?: string; error?: string };
  matchedObjects?: MatchedObject[];
  matchedFunctions?: MatchedFunction[];
  actions?: Record<string, SyncActionType>;
}

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
  const [matchedObjects, setMatchedObjects] = useState<MatchedObject[]>([]);
  const [matchedFunctions, setMatchedFunctions] = useState<MatchedFunction[]>([]);
  const [syncType, setSyncType] = useState<'schema' | 'code'>('schema');
  const [syncActions, setSyncActions] = useState<Record<string, AnySyncAction>>({});
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
        throw new Error(t('pr.loadProjectsFailed'));
      }
      if (!appRes.ok) {
        throw new Error(t('pr.loadAppsFailed'));
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
      setError(err instanceof Error ? err.message : t('pr.unexpected'));
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
      setError(t('pr.projectNameRequired'));
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
        throw new Error(data.error || t('pr.saveProjectFailed'));
      }

      setStatusMessage(
        projectForm.mode === 'create'
          ? t('pr.projectCreated', { id: data.project.id })
          : t('pr.projectUpdated', { id: data.project.id })
      );
      setShowProjectForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pr.saveProjectFailed'));
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
    if (!confirm(t('pr.deleteProjectConfirm', { name: project.name }))) return;
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t('pr.deleteProjectFailed'));
      }
      setStatusMessage(t('pr.projectDeleted', { id: project.id }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pr.deleteProjectFailed'));
    }
  };

  const handleAppSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!appForm.name.trim()) {
      setError(t('pr.appNameRequired'));
      return;
    }
    if (!selectedProjectId) {
      setError(t('pr.selectProjectFirst'));
      return;
    }
    const rootDirectory = appForm.directory || roots[0]?.path || '';
    if (!rootDirectory) {
      setError(t('pr.directoryRequired'));
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
        throw new Error(data.error || t('pr.saveAppFailed'));
      }
      setStatusMessage(
        appForm.mode === 'create' ? t('pr.appCreated', { id: data.app.id }) : t('pr.appUpdated', { id: data.app.id })
      );
      setShowAppForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pr.saveAppFailed'));
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
    if (!confirm(t('pr.deleteAppConfirm', { name: app.name }))) return;
    try {
      const response = await fetch(`/api/apps/${app.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t('pr.deleteAppFailed'));
      }
      setStatusMessage(t('pr.appDeleted', { id: app.id }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pr.deleteAppFailed'));
    }
  };

  const handleSyncFromCode = async (app: AppEntity) => {
    if (!app.codeBasePath) {
      setError(t('pr.noCodeBase'));
      return;
    }
    try {
      setError('');
      setSyncApp(app);
      setSyncType('code');
      setShowSyncForm(true);
      setSyncStage('loading');
      setSyncProgress({ current: 0, total: 1, message: t('pr.starting') });
      setMatchedFunctions([]);
      setMatchedObjects([]);
      setSyncActions({});

      // Start sync
      const response = await fetch(`/api/apps/${app.id}/sync-code/start`, {
        method: 'POST',
      });
      
      let data: SyncApiResponse;
      try {
        data = await response.json();
      } catch {
        throw new Error(t('pr.startFailedStatus', { status: response.statusText || t('pr.unknown') }));
      }
      
      if (!response.ok) {
        throw new Error(data.error || data.message || t('pr.startFailedStatus', { status: response.statusText }));
      }

      if (!data.syncId) {
        throw new Error(t('pr.noSyncId'));
      }
      setSyncId(data.syncId);
      
      // Start polling for status
      pollCodeSyncStatus(app.id, data.syncId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('pr.startCodeFailed');
      setError(errorMessage);
      setSyncStage('error');
      setSyncProgress({
        current: 0,
        total: 1,
        message: t('pr.startFailed'),
        error: errorMessage,
      });
    }
  };

  const handleSyncFromSchema = async (app: AppEntity) => {
    if (!app.dbSchemaPath) {
      setError(t('pr.noDbSchema'));
      return;
    }
    try {
      setError('');
      setSyncApp(app);
      setSyncType('schema');
      setShowSyncForm(true);
      setSyncStage('loading');
      setSyncProgress({ current: 0, total: 1, message: t('pr.starting') });
      setMatchedObjects([]);
      setMatchedFunctions([]);
      setSyncActions({});

      // Start sync
      const response = await fetch(`/api/apps/${app.id}/sync-schema/start`, {
        method: 'POST',
      });
      
      let data: SyncApiResponse;
      try {
        data = await response.json();
      } catch {
        // If response is not JSON, use the status text
        throw new Error(t('pr.startFailedStatus', { status: response.statusText || t('pr.unknown') }));
      }
      
      if (!response.ok) {
        throw new Error(data.error || data.message || t('pr.startFailedStatus', { status: response.statusText }));
      }

      if (!data.syncId) {
        throw new Error(t('pr.noSyncId'));
      }
      setSyncId(data.syncId);
      
      // Start polling for status
      pollSyncStatus(app.id, data.syncId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('pr.startSchemaFailed');
      setError(errorMessage);
      setSyncStage('error');
      setSyncProgress({
        current: 0,
        total: 1,
        message: t('pr.startFailed'),
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
            setError(t('pr.stateLost'));
            setSyncProgress({
              current: 0,
              total: 1,
              message: t('pr.stateNotFound'),
              error: t('pr.stateLostShort'),
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
          const actions: Record<string, AnySyncAction> = {};
          data.matchedFunctions.forEach((func: MatchedFunction) => {
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
          const errorMsg = data.progress.error || data.progress.message || t('pr.syncError');
          setError(errorMsg);
          setSyncProgress((prev) => ({
            ...prev,
            error: errorMsg,
            message: t('pr.errorPrefix', { message: errorMsg }),
          }));
        } else if (effectiveStage === 'completed') {
          // Stop polling on completion
          console.log('Sync completed successfully');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('pr.pollFailed');
        console.error('Failed to poll code sync status', err);
        setSyncStage('error');
        setSyncProgress({
          current: 0,
          total: 1,
          message: t('pr.pollFailed'),
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
          const actions: Record<string, AnySyncAction> = {};
          data.matchedObjects.forEach((obj: MatchedObject) => {
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
          setError(data.progress.error || t('pr.syncError'));
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('pr.pollFailed');
        console.error('Failed to poll sync status', err);
        setSyncStage('error');
        setSyncProgress({
          current: 0,
          total: 1,
          message: t('pr.pollFailed'),
          error: errorMessage,
        });
        setError(errorMessage);
      }
    };
    poll();
  };

  const handleSyncActionChange = async (key: string, action: AnySyncAction) => {
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
        throw new Error(data.error || t('pr.executeFailed'));
      }

      // Start polling for execution progress
      if (syncType === 'code') {
        pollCodeSyncStatus(syncApp.id, syncId);
      } else {
        pollSyncStatus(syncApp.id, syncId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pr.executeFailed'));
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
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border-strong bg-surface text-xs font-semibold text-muted hover:bg-bg focus:outline-none"
          aria-label={t('pr.help')}
        >
          ?
        </button>
        {isOpen && (
          <div
            ref={tooltipRef}
            className="absolute left-0 z-20 mt-2 w-64 rounded-md border border-border bg-surface p-3 shadow-lg"
          >
            <p className="text-sm text-muted">{text}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="bg-surface rounded-lg shadow px-6 py-5 mb-6">
        <h1 className="text-2xl font-semibold text-fg">{t('pr.title')}</h1>
        <p className="mt-2 text-muted">{t('pr.lead')}</p>
        {statusMessage && <div className="mt-3 text-sm text-success">{statusMessage}</div>}
        {error && <div className="mt-3 text-sm text-danger">{error}</div>}
      </div>

      {loading ? (
        <div className="text-center text-muted py-12">{t('pr.loading')}</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 h-[calc(100vh-12rem)]">
          <section className="bg-surface rounded-lg shadow p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-fg">{t('pr.projects')}</h2>
                <p className="text-sm text-muted">{t('pr.total', { count: projects.length })}</p>
              </div>
              <button
                type="button"
                className="text-sm text-accent hover:text-accent-fg"
                onClick={() => resetProjectForm(true)}
              >
                {t('pr.newProject')}
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
                        ? 'border-accent bg-accent-soft'
                        : 'border-border hover:border-border-strong'
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
                        if (!confirm(t('pr.unsavedApp'))) {
                          return;
                        }
                      }
                      setSelectedProjectId(project.id);
                      resetAppForm(project.id, '', false);
                    }}
                  >
                    <div className="flex-1">
                      <div className="text-sm text-meta uppercase tracking-wide">{project.id}</div>
                      <div className="text-lg font-semibold text-fg">{project.name}</div>
                      {project.description && (
                        <p className="text-sm text-muted mt-1">{project.description}</p>
                      )}
                      <div className="text-xs text-meta mt-2">
                        {t('pr.apps', { count: projectApps.length })}
                      </div>
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="px-3 py-1 text-sm border border-border-strong rounded hover:bg-bg"
                        onClick={() => {
                          handleProjectEdit(project);
                        }}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 text-sm border border-danger-border-soft text-danger rounded hover:bg-danger-muted"
                        onClick={() => handleProjectDelete(project)}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                );
              })}
              {projects.length === 0 && (
                  <div className="text-sm text-meta text-center py-6">
                  {t('pr.noProjects')}
                </div>
              )}
            </div>

            {((projectForm.mode === 'create' && showProjectForm) || projectForm.mode === 'edit') && (
              <form className="mt-6 space-y-4" onSubmit={handleProjectSubmit}>
                <h3 className="text-lg font-semibold text-fg">
                  {projectForm.mode === 'create' ? t('pr.createProject') : t('pr.editProject', { id: projectForm.id })}
                </h3>
                <div>
                  <label className="block text-sm font-medium text-fg-2">{t('pr.idLetters')}</label>
                  <input
                    type="text"
                    value={projectForm.id}
                    disabled={projectForm.mode === 'edit'}
                    onChange={(e) => setProjectForm((prev) => ({ ...prev, id: e.target.value }))}
                    placeholder={t('pr.auto')}
                    className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm disabled:bg-surface-muted"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2">{t('common.name')}</label>
                  <input
                    type="text"
                    value={projectForm.name}
                    onChange={(e) => setProjectForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2">{t('common.description')}</label>
                  <textarea
                    value={projectForm.description}
                    onChange={(e) =>
                      setProjectForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={3}
                    className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-accent text-on rounded text-sm hover:bg-accent-hover"
                  >
                    {projectForm.mode === 'create' ? t('pr.create') : t('common.save')}
                  </button>
                  {(projectForm.mode === 'edit' || showProjectForm) && (
                    <button
                      type="button"
                      className="px-4 py-2 border border-border-strong rounded text-sm hover:bg-bg"
                      onClick={() => resetProjectForm(false)}
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                </div>
              </form>
            )}
          </section>

          <section className="bg-surface rounded-lg shadow p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-fg">{t('pr.applications')}</h2>
                <p className="text-sm text-muted">
                  {selectedProjectId
                    ? t('pr.projectCount', { id: selectedProjectId, count: appsByProject.length })
                    : t('pr.selectProject')}
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-accent hover:text-accent-fg"
                onClick={() => {
                  if (!selectedProjectId) {
                    alert(t('pr.selectProjectFirst'));
                    return;
                  }
                  resetAppForm(selectedProjectId, '', true);
                }}
                disabled={!selectedProjectId}
              >
                {t('pr.newApp')}
              </button>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              {appsByProject.map((app) => (
                <div
                  key={app.id}
                  className="border border-border rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm text-meta uppercase tracking-wide">{app.id}</div>
                    <div className="text-lg font-semibold text-fg">{app.name}</div>
                    <div className="text-xs text-meta mt-2">
                      {t('pr.directory', { path: app.directory })}
                    </div>
                    <div className="text-xs text-meta">
                      {t('pr.paths', { code: app.codeBasePath || '-', db: app.dbSchemaPath || '-' })}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="px-3 py-1 text-sm border border-border-strong rounded hover:bg-bg disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleSyncFromCode(app)}
                      disabled={!app.codeBasePath}
                      title={app.codeBasePath ? t('pr.syncCodeTitle') : t('pr.noCodeBaseShort')}
                    >
                      {t('pr.syncCode')}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-sm border border-border-strong rounded hover:bg-bg disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleSyncFromSchema(app)}
                      disabled={!app.dbSchemaPath}
                      title={app.dbSchemaPath ? t('pr.syncSchemaTitle') : t('pr.noDbSchemaShort')}
                    >
                      {t('pr.syncSchema')}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-sm border border-border-strong rounded hover:bg-bg"
                      onClick={() => handleAppEdit(app)}
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-sm border border-danger-border-soft text-danger rounded hover:bg-danger-muted"
                      onClick={() => handleAppDelete(app)}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              ))}
              {appsByProject.length === 0 && (
                <div className="text-sm text-meta text-center py-6">
                  {t('pr.noApps')}
                </div>
              )}
            </div>

            {((appForm.mode === 'create' && showAppForm) || appForm.mode === 'edit') && (
              <form className="mt-6 space-y-4" onSubmit={handleAppSubmit}>
                <h3 className="text-lg font-semibold text-fg">
                  {appForm.mode === 'create' ? t('pr.createApp') : t('pr.editApp', { id: appForm.id })}
                </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-fg-2">{t('pr.appId')}</label>
                  <input
                    type="text"
                    value={appForm.id}
                    disabled={appForm.mode === 'edit'}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, id: e.target.value }))}
                    placeholder="project-abc"
                    className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm disabled:bg-surface-muted"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2">{t('common.name')}</label>
                  <input
                    type="text"
                    value={appForm.name}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {selectedProjectId && (
                <div>
                  <label className="block text-sm font-medium text-fg-2">{t('pr.project')}</label>
                  <input
                    type="text"
                    value={projects.find(p => p.id === selectedProjectId)?.name || selectedProjectId}
                    disabled
                    className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm bg-surface-muted text-muted"
                  />
                </div>
              )}
              
              <div className="mt-4 space-y-4 rounded-lg border border-border bg-bg p-4">
                <h4 className="text-sm font-semibold text-fg">{t('pr.pathsConfig')}</h4>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-fg-2">
                    {t('pr.directoryLabel')}
                    <HelpTooltip text={t('pr.directoryHelp')} />
                  </label>
                  <input
                    type="text"
                    value={appForm.directory}
                    disabled={appForm.mode === 'edit'}
                    onChange={(e) => setAppForm((prev) => ({ ...prev, directory: e.target.value }))}
                    placeholder={t('pr.directoryPlaceholder')}
                    className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm disabled:bg-surface-muted font-mono text-xs"
                    required
                  />
                </div>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-fg-2">
                    {t('pr.codeBase')}
                    <HelpTooltip text={t('pr.codeBaseHelp')} />
                  </label>
                  <input
                    type="text"
                    value={appForm.codeBasePath}
                    onChange={(e) =>
                      setAppForm((prev) => ({ ...prev, codeBasePath: e.target.value }))
                    }
                    className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm font-mono text-xs"
                    placeholder="./src"
                  />
                </div>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-fg-2">
                    {t('pr.dbSchema')}
                    <HelpTooltip text={t('pr.dbSchemaHelp')} />
                  </label>
                  <input
                    type="text"
                    value={appForm.dbSchemaPath}
                    onChange={(e) =>
                      setAppForm((prev) => ({ ...prev, dbSchemaPath: e.target.value }))
                    }
                    className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm font-mono text-xs"
                    placeholder="./db/schema"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent text-on rounded text-sm hover:bg-accent-hover"
                >
                  {appForm.mode === 'create' ? t('pr.create') : t('common.save')}
                </button>
                {(appForm.mode === 'edit' || showAppForm) && (
                  <button
                    type="button"
                    className="px-4 py-2 border border-border-strong rounded text-sm hover:bg-bg"
                    onClick={() => {
                      resetAppForm(selectedProjectId, '', false);
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                )}
              </div>
            </form>
            )}

            {showSyncForm && syncApp && (
              <div className="mt-6 space-y-4 border-t border-border pt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-fg">
                    {syncType === 'code' ? t('pr.syncFromCode', { name: syncApp.name }) : t('pr.syncFromSchema', { name: syncApp.name })}
                  </h3>
                  <button
                    type="button"
                    className="px-3 py-1 text-sm border border-border-strong rounded hover:bg-bg"
                    onClick={resetSyncForm}
                  >
                    {t('ws.close')}
                  </button>
                </div>

                {/* Stage 1: Loading */}
                {syncStage === 'loading' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm text-muted mb-2">
                        <span>{syncType === 'code' ? t('pr.loadingFromCode') : t('pr.loadingFromSchema')}</span>
                        <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-surface-strong rounded-full h-2">
                        <div
                          className="bg-accent h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                        />
                      </div>
                      {syncProgress.message && (
                        <p className="text-sm text-meta mt-2">{syncProgress.message}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Stage 2: Matching */}
                {syncStage === 'matching' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm text-muted mb-2">
                        <span>{t('pr.matching')}</span>
                        <span>{syncType === 'code' ? t('pr.functionsCount', { count: matchedFunctions.length }) : t('pr.objectsCount', { count: matchedObjects.length })}</span>
                      </div>
                      {syncProgress.message && (
                        <p className="text-sm text-meta mb-4">{syncProgress.message}</p>
                      )}
                    </div>

                    {/* Search and Filter */}
                    <div className="flex gap-4">
                      <input
                        type="text"
                        placeholder={t('pr.searchName')}
                        value={syncSearchQuery}
                        onChange={(e) => setSyncSearchQuery(e.target.value)}
                        className="flex-1 px-3 py-2 border border-border-strong rounded text-sm"
                      />
                      <select
                        value={syncStatusFilter}
                        onChange={(e) => setSyncStatusFilter(e.target.value)}
                        className="px-3 py-2 border border-border-strong rounded text-sm"
                      >
                        <option value="all">{t('pr.allStatuses')}</option>
                        {syncType === 'code' ? (
                          <>
                            <option value="proposed">{t('pr.status.proposed')}</option>
                            <option value="linked">{t('pr.status.linked')}</option>
                            <option value="candidate">{t('pr.status.candidate')}</option>
                            <option value="stale">{t('pr.status.stale')}</option>
                          </>
                        ) : (
                          <>
                            <option value="new">{t('pr.status.new')}</option>
                            <option value="matched">{t('pr.status.matched')}</option>
                            <option value="needs_matching">{t('pr.status.needs_matching')}</option>
                            <option value="delete">{t('pr.status.delete')}</option>
                          </>
                        )}
                      </select>
                    </div>

                    {/* Matched Objects/Functions Table */}
                    {((syncType === 'code' && matchedFunctions.length > 0) || (syncType === 'schema' && matchedObjects.length > 0)) && (
                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="max-h-96 overflow-y-auto">
                          <table className="w-full text-sm">
                          <thead className="bg-bg">
                            <tr>
                              {syncType === 'code' ? (
                                <>
                                  <th className="px-4 py-2 text-left font-semibold text-fg-2">{t('pr.colCodeFunction')}</th>
                                  <th className="px-4 py-2 text-left font-semibold text-fg-2">{t('pr.colFile')}</th>
                                  <th className="px-4 py-2 text-left font-semibold text-fg-2">{t('pr.colFeature')}</th>
                                  <th className="px-4 py-2 text-left font-semibold text-fg-2">{t('pr.colStatus')}</th>
                                  <th className="px-4 py-2 text-left font-semibold text-fg-2">{t('pr.colAction')}</th>
                                </>
                              ) : (
                                <>
                                  <th className="px-4 py-2 text-left font-semibold text-fg-2">{t('pr.colModel')}</th>
                                  <th className="px-4 py-2 text-left font-semibold text-fg-2">{t('pr.colObject')}</th>
                                  <th className="px-4 py-2 text-left font-semibold text-fg-2">{t('pr.colStatus')}</th>
                                  <th className="px-4 py-2 text-left font-semibold text-fg-2">{t('pr.colAction')}</th>
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
                                    <tr key={idx} className="border-t border-border hover:bg-bg">
                                      <td className="px-4 py-2">
                                        <div className="font-medium">{func.exportedFunction.name}</div>
                                        {func.exportedFunction.isAsync && (
                                          <span className="text-xs text-meta">async</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className="text-xs font-mono text-muted">{func.exportedFunction.relativePath}</span>
                                      </td>
                                      <td className="px-4 py-2">
                                        {func.functionCard ? (
                                          <span className="text-fg-2">{func.functionCard.name} ({func.functionCard.id})</span>
                                        ) : (
                                          <span className="text-meta" title={t('pr.createWouldUse')}>— {func.functionId && <span className="font-mono text-xs">({func.functionId})</span>}</span>
                                        )}
                                        {func.reason && <div className="text-xs text-meta">{func.reason}</div>}
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className={`px-2 py-1 rounded text-xs ${
                                          func.status === 'proposed' ? 'bg-warn-muted text-warn-fg' :
                                          func.status === 'linked' ? 'bg-accent-muted text-accent-fg' :
                                          func.status === 'candidate' ? 'bg-surface-muted text-fg' :
                                          'bg-danger-soft text-danger-fg-strong'
                                        }`}>
                                          {func.status === 'proposed' ? t('pr.status.proposed') :
                                           func.status === 'linked' ? t('pr.status.linked') :
                                           func.status === 'candidate' ? t('pr.status.candidate') :
                                           t('pr.status.stale')}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2">
                                        <select
                                          value={syncActions[key] || func.action}
                                          onChange={(e) => handleSyncActionChange(key, e.target.value as CodeSyncAction)}
                                          className="px-2 py-1 border border-border-strong rounded text-xs"
                                        >
                                          <option value="skip">{t('pr.action.skip')}</option>
                                          {func.functionCard && func.status !== 'stale' && <option value="link">{t('pr.action.link')}</option>}
                                          {!func.functionCard && <option value="create">{t('pr.action.createFeature')}</option>}
                                          {func.status === 'stale' && <option value="unlink">{t('pr.action.unlink')}</option>}
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
                                  <tr key={idx} className="border-t border-border hover:bg-bg">
                                    <td className="px-4 py-2">{obj.prismaModel.name}</td>
                                    <td className="px-4 py-2">
                                      {obj.businessObject ? (
                                        <span className="text-fg-2">{obj.businessObject.name}</span>
                                      ) : (
                                        <span className="text-meta">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2">
                                      <span className={`px-2 py-1 rounded text-xs ${
                                        obj.status === 'new' ? 'bg-success-muted text-success-fg' :
                                        obj.status === 'matched' ? 'bg-accent-muted text-accent-fg' :
                                        obj.status === 'needs_matching' ? 'bg-warn-muted text-warn-fg' :
                                        'bg-danger-soft text-danger-fg-strong'
                                      }`}>
                                        {obj.status === 'new' ? t('pr.status.new') :
                                         obj.status === 'matched' ? t('pr.status.matched') :
                                         obj.status === 'needs_matching' ? t('pr.status.needs_matching') :
                                         t('pr.status.delete')}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2">
                                      <select
                                        value={syncActions[obj.prismaModel.name] || obj.action}
                                        onChange={(e) => handleSyncActionChange(obj.prismaModel.name, e.target.value as SyncActionType)}
                                        className="px-2 py-1 border border-border-strong rounded text-xs"
                                      >
                                        <option value="skip">{t('pr.action.skip')}</option>
                                        <option value="update">{t('pr.action.update')}</option>
                                        <option value="create">{t('pr.action.create')}</option>
                                        <option value="delete">{t('pr.status.delete')}</option>
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
                      <div className="text-center py-8 text-meta">
                        <p>{t('pr.waiting')}</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="px-4 py-2 bg-accent text-on rounded text-sm hover:bg-accent-hover"
                        onClick={handleExecuteSync}
                      >
                        {t('pr.run')}
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 border border-border-strong rounded text-sm hover:bg-bg"
                        onClick={resetSyncForm}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Stage 3: Executing */}
                {syncStage === 'executing' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm text-muted mb-2">
                        <span>{t('pr.executing')}</span>
                        <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-surface-strong rounded-full h-2">
                        <div
                          className="bg-success-fill-strong h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                        />
                      </div>
                      {syncProgress.message && (
                        <p className="text-sm text-meta mt-2">{syncProgress.message}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Stage 4: Completed */}
                {syncStage === 'completed' && (
                  <div className="space-y-4">
                    <div className="bg-success-muted border border-success-border rounded-lg p-4">
                      <p className="text-sm text-success-fg font-semibold">{t('pr.done')}</p>
                      <p className="text-sm text-success mt-1">{syncProgress.message}</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="px-4 py-2 bg-accent text-on rounded text-sm hover:bg-accent-hover"
                        onClick={() => {
                          resetSyncForm();
                          loadData();
                        }}
                      >
                        {t('pr.closeRefresh')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Stage 5: Error */}
                {syncStage === 'error' && (
                  <div className="space-y-4">
                    <div className="bg-danger-muted border border-danger-border-soft rounded-lg p-4">
                      <p className="text-sm text-danger-fg-strong font-semibold">{t('pr.failed')}</p>
                      <p className="text-sm text-danger mt-1">
                        {syncProgress.error || syncProgress.message || t('pr.syncError')}
                      </p>
                      {(syncProgress.error || syncProgress.message) && (
                        <details className="mt-2">
                          <summary className="text-sm text-danger-fg cursor-pointer hover:text-danger-fg-strong">{t('pr.details')}</summary>
                          <pre className="mt-2 text-xs text-danger bg-danger-soft p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap break-words">
                            {syncProgress.error || syncProgress.message}
                          </pre>
                        </details>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="px-4 py-2 border border-border-strong rounded text-sm hover:bg-bg"
                        onClick={resetSyncForm}
                      >
                        {t('ws.close')}
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

