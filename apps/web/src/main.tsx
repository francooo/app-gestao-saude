import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { ApiRequestError } from './api/cliente';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import './estilos/global.css';
import { DialogoProvider } from './ui/Dialogo';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * No aplicativo cada tela busca de novo ao ganhar foco. Aqui o
       * equivalente e buscar ao montar a tela e ao voltar para a aba do
       * navegador: dose marcada no celular aparece assim que a pessoa olha.
       */
      staleTime: 0,
      refetchOnWindowFocus: true,
      // Erro da API (4xx) nao melhora repetindo; so falha de rede vale outra tentativa.
      retry: (tentativas, erro) =>
        tentativas < 1 && erro instanceof ApiRequestError && erro.status === 0,
    },
  },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DialogoProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </DialogoProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
