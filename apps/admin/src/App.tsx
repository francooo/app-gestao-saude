import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';

import { useAuth } from './auth/AuthProvider';
import { Layout } from './layout/Layout';
import { Login } from './telas/Login';

// Cada tela num arquivo proprio: o login nao baixa a biblioteca de graficos.
const VisaoGeral = lazy(() => import('./telas/VisaoGeral').then((m) => ({ default: m.VisaoGeral })));
const Usuarios = lazy(() => import('./telas/Usuarios').then((m) => ({ default: m.Usuarios })));
const Assinaturas = lazy(() => import('./telas/Assinaturas').then((m) => ({ default: m.Assinaturas })));
const Medicamentos = lazy(() => import('./telas/Medicamentos').then((m) => ({ default: m.Medicamentos })));
const Medicos = lazy(() => import('./telas/Medicos').then((m) => ({ default: m.Medicos })));
const Relatorios = lazy(() => import('./telas/Relatorios').then((m) => ({ default: m.Relatorios })));
const Configuracoes = lazy(() => import('./telas/Configuracoes').then((m) => ({ default: m.Configuracoes })));

/** Sem sessao, manda ao login lembrando de onde veio. */
function RotaProtegida({ children }: { children: ReactNode }) {
  const { sessao } = useAuth();
  const local = useLocation();
  if (sessao.estado === 'carregando') return <p className="so-leitor-de-tela">Carregando…</p>;
  if (sessao.estado === 'anonimo') return <Navigate to="/entrar" replace state={{ de: local.pathname }} />;
  return children;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/entrar" element={<Login />} />
        <Route
          element={
            <RotaProtegida>
              <Suspense>
                <Layout />
              </Suspense>
            </RotaProtegida>
          }
        >
          <Route path="/" element={<VisaoGeral />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/assinaturas" element={<Assinaturas />} />
          <Route path="/medicamentos" element={<Medicamentos />} />
          <Route path="/medicos" element={<Medicos />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
