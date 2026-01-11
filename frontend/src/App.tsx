import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import ErrorBoundary, { PageErrorBoundary } from './components/ErrorBoundary';

// Layout
import Layout from './components/Layout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DataIngestion from './pages/DataIngestion';
import StandardsCompliance from './pages/StandardsCompliance';
import TaxonomyResolver from './pages/TaxonomyResolver';
import OceanographyViewer from './pages/OceanographyViewer';
import SpeciesExplorer from './pages/SpeciesExplorer';
import SpeciesDetail from './pages/SpeciesDetail';
import OtolithAnalysis from './pages/OtolithAnalysis';
import FishIdentifier from './pages/FishIdentifier';
import EdnaManager from './pages/EdnaManager';
import Analytics from './pages/Analytics';
import AIAssistant from './pages/AIAssistant';
import AIResearchAssistant from './pages/AIResearchAssistant';
import NicheModeling from './pages/NicheModeling';
import ReportGenerator from './pages/ReportGenerator';
import AdminConsole from './pages/AdminConsole';
import ApiDocs from './pages/ApiDocs';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PageErrorBoundary><Dashboard /></PageErrorBoundary>} />
            <Route path="ingest" element={<PageErrorBoundary><DataIngestion /></PageErrorBoundary>} />
            <Route path="standards" element={<PageErrorBoundary><StandardsCompliance /></PageErrorBoundary>} />
            <Route path="taxonomy" element={<PageErrorBoundary><TaxonomyResolver /></PageErrorBoundary>} />
            <Route path="oceanography" element={<PageErrorBoundary><OceanographyViewer /></PageErrorBoundary>} />
            <Route path="species" element={<PageErrorBoundary><SpeciesExplorer /></PageErrorBoundary>} />
            <Route path="species/:id" element={<PageErrorBoundary><SpeciesDetail /></PageErrorBoundary>} />
            <Route path="fish-id" element={<PageErrorBoundary><FishIdentifier /></PageErrorBoundary>} />
            <Route path="otolith" element={<PageErrorBoundary><OtolithAnalysis /></PageErrorBoundary>} />
            <Route path="edna" element={<PageErrorBoundary><EdnaManager /></PageErrorBoundary>} />
            <Route path="analytics" element={<PageErrorBoundary><Analytics /></PageErrorBoundary>} />
            <Route path="niche-modeling" element={<PageErrorBoundary><NicheModeling /></PageErrorBoundary>} />
            <Route path="reports" element={<PageErrorBoundary><ReportGenerator /></PageErrorBoundary>} />
            <Route path="ai-assistant" element={<PageErrorBoundary><AIAssistant /></PageErrorBoundary>} />
            <Route path="research-assistant" element={<PageErrorBoundary><AIResearchAssistant /></PageErrorBoundary>} />
            <Route path="admin" element={<PageErrorBoundary><AdminConsole /></PageErrorBoundary>} />
            <Route path="api-docs" element={<PageErrorBoundary><ApiDocs /></PageErrorBoundary>} />
          </Route>
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
export default App;
