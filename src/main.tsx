import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setSupabaseStorage } from '@data/supabase/client';
import { capacitorPreferencesStorage } from '@platform/storage/capacitorPreferencesStorage';

// Inicialización de la persistencia nativa/web de sesión en la raíz de composición
setSupabaseStorage(capacitorPreferencesStorage);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
