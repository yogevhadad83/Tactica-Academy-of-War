import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';
import { MultiplayerProvider } from './context/MultiplayerContext';
import { AudioProvider, useAudio } from './context/AudioContext';

const Home = lazy(() => import('./pages/Home'));
const Academy = lazy(() => import('./pages/Academy'));
const ArmyBuilder = lazy(() => import('./pages/ArmyBuilder'));
const BoardView = lazy(() => import('./pages/BoardView'));
const WarRoom = lazy(() => import('./pages/WarRoom'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DebugNetwork = lazy(() => import('./pages/DebugNetwork'));
const Training = lazy(() => import('./pages/Training'));
const TrainingRun = lazy(() => import('./pages/TrainingRun'));

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

function AppContent() {
  const [showIntro, setShowIntro] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { audioRef, isMuted } = useAudio();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isDebugFromEnv = import.meta.env.VITE_FORCE_DEBUG === 'true';
    const isDebug = params.has('debug') || isDebugFromEnv;

    // If debug is forced via env, ensure the URL contains ?debug
    // (Vite's `--open` may not preserve query strings reliably across platforms.)
    if (isDebugFromEnv && !params.has('debug')) {
      const existing = params.toString();
      const nextSearch = existing.length > 0 ? `?${existing}&debug` : '?debug';
      window.history.replaceState(null, '', `${window.location.pathname}${nextSearch}${window.location.hash}`);
    }

    // If debug is enabled, skip intro entirely
    if (isDebug) {
      setShowIntro(false);
    }

    const v = videoRef.current;
    if (!v) return;
    const onEnded = () => setShowIntro(false);
    const onError = () => setShowIntro(false);
    v.addEventListener('ended', onEnded);
    v.addEventListener('error', onError);
    return () => {
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('error', onError);
    };
  }, []);

  const handleStartIntro = () => {
    const a = audioRef.current;
    if (a) {
      a.volume = 0.6;
      a.play().then(() => {
        console.log('Audio playing');
      }).catch(err => {
        console.error('Audio play failed:', err);
      });
    }
    setShowTitle(false);
    
    // Start playing video
    setTimeout(() => {
      const v = videoRef.current;
      if (v) {
        v.play().catch(err => {
          console.error('Video play failed:', err);
        });
      }
    }, 50);
  };

  return (
    <>
      {/* Keep audio element mounted throughout app lifecycle */}
      <audio
        ref={audioRef}
        preload="auto"
        src="/audio/opening.mp3"
        muted={isMuted}
        loop
        style={{ display: 'none' }}
      />
      
      {showIntro ? (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
          {showTitle ? (
            <>
              <h1 style={{
                color: '#fff',
                fontSize: '48px',
                fontFamily: 'serif',
                fontWeight: 'bold',
                textAlign: 'center',
                margin: 0
              }}>
                Tactica: Academy of War
              </h1>
              <div 
                onClick={handleStartIntro}
                style={{
                  position: 'absolute',
                  bottom: '5%',
                  right: '5%',
                  color: '#fff',
                  fontSize: '20px',
                  fontFamily: 'sans-serif',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}>
                Continue...
              </div>
            </>
          ) : (
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              style={{
                width: '360px',
                height: 'auto',
                objectFit: 'contain'
              }}
              controls={false}
              onEnded={() => setShowIntro(false)}
            >
              <source src="/video/hb.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          )}
        </div>
      ) : (
        <BrowserRouter>
          <MultiplayerProvider>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/academy" replace />} />
                <Route path="academy" element={<RouteLoader><Academy /></RouteLoader>} />
                <Route path="home" element={<RouteLoader><Home /></RouteLoader>} />
                <Route path="army-builder" element={<RouteLoader><ArmyBuilder /></RouteLoader>} />
                <Route path="quartermaster" element={<RouteLoader><ArmyBuilder /></RouteLoader>} />
                <Route path="board" element={<RouteLoader><BoardView /></RouteLoader>} />
                <Route path="war-room" element={<RouteLoader><WarRoom /></RouteLoader>} />
                <Route path="login" element={<RouteLoader><Login /></RouteLoader>} />
                <Route path="signup" element={<RouteLoader><Signup /></RouteLoader>} />
                <Route path="training" element={<RouteLoader><Training /></RouteLoader>} />
                <Route path="training/:id" element={<RouteLoader><TrainingRun /></RouteLoader>} />
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
      )}
    </>
  );
}

function App() {
  return (
    <AudioProvider>
      <AppContent />
    </AudioProvider>
  );
}

export default App;
