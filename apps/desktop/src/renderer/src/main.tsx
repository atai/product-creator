import './api-bridge';
import './globals.css';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Header from '@/components/Header';
import Home from '@/pages/home';
import Functions from '@/pages/functions';
import FunctionView from '@/pages/f-id';
import NewFunction from '@/pages/new';
import BusinessObjects from '@/pages/business-objects';
import NewBusinessObject from '@/pages/business-objects-new';
import Workflows from '@/pages/workflows';
import WorkflowView from '@/pages/workflows-id';
import Streams from '@/pages/streams';
import StreamView from '@/pages/streams-id';
import Graph from '@/pages/graph';
import Matrix from '@/pages/matrix';
import Doc from '@/pages/doc';
import Projects from '@/pages/projects';
import WorkspacePage from '@/pages/workspace';
import InterfacesPage from '@/pages/interfaces';
import SettingsPage from '@/pages/settings';

// Header and pages read apps/projects once; reload when the set of opened projects changes
window.pc.onWorkspaceChanged(() => window.location.reload());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Suspense fallback={null}>
        <div className="app-shell">
          <Header />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/functions" element={<Functions />} />
              <Route path="/f/:id" element={<FunctionView />} />
              <Route path="/new" element={<NewFunction />} />
              <Route path="/business-objects" element={<BusinessObjects />} />
              <Route path="/business-objects/new" element={<NewBusinessObject />} />
              <Route path="/workflows" element={<Workflows />} />
              <Route path="/workflows/:id" element={<WorkflowView />} />
              <Route path="/streams" element={<Streams />} />
              <Route path="/streams/:id" element={<StreamView />} />
              <Route path="/graph" element={<Graph />} />
              <Route path="/matrix" element={<Matrix />} />
              <Route path="/doc" element={<Doc />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/workspace" element={<WorkspacePage />} />
              <Route path="/interfaces" element={<InterfacesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
        </div>
      </Suspense>
    </HashRouter>
  </StrictMode>
);
