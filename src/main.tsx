import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Imported early so beforeinstallprompt is captured even if it fires before React mounts.
import './hooks/useInstallPrompt';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
