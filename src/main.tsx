import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import { UserProvider } from './context/UserContext';
import { PlayerProvider } from './context/PlayerContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <PlayerProvider>
        <UserProvider>
          <App />
        </UserProvider>
      </PlayerProvider>
    </AuthProvider>
  </StrictMode>
);
