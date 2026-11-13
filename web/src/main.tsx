import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LOGO_SRC } from './logo';
import { initPwa } from './pwa';
import './index.css';

// Pasang listener PWA sebelum render: `beforeinstallprompt` bisa terbit lebih awal dari mount React.
initPwa();

// Favicon dari logo maskot byga.
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
icon.type = 'image/webp';
icon.href = LOGO_SRC;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
