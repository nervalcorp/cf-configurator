import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme } from './theme/brands';
import './theme/tokens.css';
import './styles.css';

applyTheme(new URLSearchParams(location.search).get('theme'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
