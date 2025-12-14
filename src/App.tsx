import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';
import { MultiplayerProvider } from './context/MultiplayerContext';
import { AudioProvider, useAudio } from './context/AudioContext';

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

function AppContent() {
  const [showIntro, setShowIntro] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { audioRef } = useAudio();

  useEffect(() => {
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
