// React entry point — mounts <App/> into #root. Vite serves this in dev and bundles
// it into teams-app/tab/dist for the container image (served by the teams-app host).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
