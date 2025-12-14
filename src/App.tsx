import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';
import { MultiplayerProvider } from './context/MultiplayerContext';

const Home = lazy(() => import('./pages/Home'));
const ArmyBuilder = lazy(() => import('./pages/ArmyBuilder'));
const BoardView = lazy(() => import('./pages/BoardView'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DebugNetwork = lazy(() => import('./pages/DebugNetwork'));

const RouteLoader = ({ children }: { children: React.ReactNode }) => (
  <Suspense
    fallback={
      <div className="route-loading" aria-live="polite">
        Loading…
      </div>
    }
  >
    {children}
  </Suspense>
);

function App() {
  return (
    <BrowserRouter>
      <MultiplayerProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<RouteLoader><Home /></RouteLoader>} />
            <Route path="army-builder" element={<RouteLoader><ArmyBuilder /></RouteLoader>} />
            <Route path="board" element={<RouteLoader><BoardView /></RouteLoader>} />
            <Route path="login" element={<RouteLoader><Login /></RouteLoader>} />
            <Route path="signup" element={<RouteLoader><Signup /></RouteLoader>} />
            <Route
              path="dashboard"
              element={(
                <ProtectedRoute>
                  <RouteLoader><Dashboard /></RouteLoader>
                </ProtectedRoute>
              )}
            />
            <Route path="debug" element={<RouteLoader><DebugNetwork /></RouteLoader>} />
          </Route>
        </Routes>
      </MultiplayerProvider>
    </BrowserRouter>
  );
}

export default App;
