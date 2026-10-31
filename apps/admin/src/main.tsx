import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import './estilos/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Painel interno: dado de 1 minuto atras e aceitavel, e evita refazer
      // consultas pesadas a cada troca de aba.
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
