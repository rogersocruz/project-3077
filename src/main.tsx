import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadGameData } from './data';
import { initI18n } from './i18n';
import { App } from './ui/App';
import './ui/theme/fonts';
import './ui/theme/global.css';
import { cssVariables } from './ui/theme/tokens';

// Dados inválidos falham aqui, na carga — nunca no meio da partida.
loadGameData();

for (const [name, value] of Object.entries(cssVariables())) {
  document.documentElement.style.setProperty(name, value);
}

await initI18n();

const root = document.getElementById('root');
if (!root) throw new Error('#root ausente em index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
