import './api-bridge';
import './globals.css';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import Header from '@/components/Header';
import { setUiLanguage } from '@/i18n';
import Home from '@/pages/home';
import Features from '@/pages/features';
import FeatureView from '@/pages/features-id';
import NewFeature from '@/pages/features-new';
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
import ProblemsPage from '@/pages/problems';

// Old routes of features (named "functions" before PRODUCTCREATOR-28), kept as redirects
function LegacyFunctions() {
  return <Navigate to={`/features${useLocation().search}`} replace />;
}
function LegacyFunction() {
  const { id = '' } = useParams();
  return <Navigate to={`/features/${encodeURIComponent(id)}${useLocation().search}`} replace />;
}

// Header and pages read apps/projects once; reload when the set of opened projects changes
window.pc.onWorkspaceChanged(() => window.location.reload());

function render() {
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Suspense fallback={null}>
        <div className="app-shell">
          <Header />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/features" element={<Features />} />
              <Route path="/features/new" element={<NewFeature />} />
              <Route path="/features/:id" element={<FeatureView />} />
              <Route path="/functions" element={<LegacyFunctions />} />
              <Route path="/f/:id" element={<LegacyFunction />} />
              <Route path="/new" element={<Navigate to="/features/new" replace />} />
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
              <Route path="/problems" element={<ProblemsPage />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
        </div>
      </Suspense>
    </HashRouter>
  </StrictMode>
);
}

// the interface language comes from the app settings (PRODUCTCREATOR-37); a change reloads the window
void window.pc.ui
  .language()
  .then(({ language }) => setUiLanguage(language))
  .catch(() => setUiLanguage('en'))
  .finally(render);
