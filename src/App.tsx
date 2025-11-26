import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import './App.css';

const Home = lazy(() => import('./pages/Home'));
const ArmyBuilder = lazy(() => import('./pages/ArmyBuilder'));
const StrategyEditor = lazy(() => import('./pages/StrategyEditor'));
const BoardView = lazy(() => import('./pages/BoardView'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

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
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<RouteLoader><Home /></RouteLoader>} />
          <Route path="army-builder" element={<RouteLoader><ArmyBuilder /></RouteLoader>} />
          <Route path="strategy" element={<RouteLoader><StrategyEditor /></RouteLoader>} />
          <Route path="board" element={<RouteLoader><BoardView /></RouteLoader>} />
          <Route path="login" element={<RouteLoader><Login /></RouteLoader>} />
          <Route path="register" element={<RouteLoader><Register /></RouteLoader>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
