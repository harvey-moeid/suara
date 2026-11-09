import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LOGO_SRC } from './logo';
import './index.css';

// Favicon dari logo maskot byga.
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
icon.type = 'image/webp';
icon.href = LOGO_SRC;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
