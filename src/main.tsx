import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { Toaster } from '@/components/ui/sonner';
import './App.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster position="top-center" richColors />
  </StrictMode>
);
