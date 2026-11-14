import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';

import { useAuth } from './auth/AuthProvider';
import { Casca } from './layout/Casca';
import { Carregando } from './ui/Carregando';

/**
 * As rotas espelham as do aplicativo (apps/mobile/app), para um link ou um
 * habito valer nos dois lugares.
 *
 * Telas com lazy(): quem so quer conferir o remedio de hoje nao baixa o mapa.
 */
const Login = lazy(() => import('./telas/entrada/Login').then((m) => ({ default: m.Login })));
const Cadastro = lazy(() =>
  import('./telas/entrada/Cadastro').then((m) => ({ default: m.Cadastro })),
);
const EsqueciSenha = lazy(() =>
  import('./telas/entrada/EsqueciSenha').then((m) => ({ default: m.EsqueciSenha })),
);
const Inicio = lazy(() => import('./telas/Inicio').then((m) => ({ default: m.Inicio })));
const RemediosLayout = lazy(() =>
  import('./telas/remedios/RemediosLayout').then((m) => ({ default: m.RemediosLayout })),
);
const RemediosIndex = lazy(() =>
  import('./telas/remedios/RemediosLayout').then((m) => ({ default: m.RemediosIndex })),
);
const RemedioDetalhe = lazy(() =>
  import('./telas/remedios/RemedioDetalhe').then((m) => ({ default: m.RemedioDetalhe })),
);
const Estoque = lazy(() =>
  import('./telas/remedios/Estoque').then((m) => ({ default: m.Estoque })),
);
const Compra = lazy(() => import('./telas/remedios/Compra').then((m) => ({ default: m.Compra })));
const HistoricoCompleto = lazy(() =>
  import('./telas/remedios/HistoricoCompleto').then((m) => ({ default: m.HistoricoCompleto })),
);
const MedicamentoForm = lazy(() =>
  import('./telas/medicamento/MedicamentoForm').then((m) => ({ default: m.MedicamentoForm })),
);
const NovoRemedio = lazy(() =>
  import('./telas/remedios/NovoRemedio').then((m) => ({ default: m.NovoRemedio })),
);
const RevisarReceita = lazy(() =>
  import('./telas/medicamento/RevisarReceita').then((m) => ({ default: m.RevisarReceita })),
);
const Medicos = lazy(() => import('./telas/medicos/Medicos').then((m) => ({ default: m.Medicos })));
const Mapa = lazy(() => import('./telas/medicos/Medicos').then((m) => ({ default: m.Mapa })));
const MedicoForm = lazy(() =>
  import('./telas/medicos/MedicoForm').then((m) => ({ default: m.MedicoForm })),
);
const NovaConsulta = lazy(() =>
  import('./telas/medicos/NovaConsulta').then((m) => ({ default: m.NovaConsulta })),
);
const Assistente = lazy(() =>
  import('./telas/Assistente').then((m) => ({ default: m.Assistente })),
);
const Sintomas = lazy(() => import('./telas/Sintomas').then((m) => ({ default: m.Sintomas })));
const Avisos = lazy(() => import('./telas/Avisos').then((m) => ({ default: m.Avisos })));
const Ajustes = lazy(() => import('./telas/Ajustes').then((m) => ({ default: m.Ajustes })));
const Membro = lazy(() => import('./telas/conta/Membro').then((m) => ({ default: m.Membro })));
const Acesso = lazy(() => import('./telas/conta/Acesso').then((m) => ({ default: m.Acesso })));
const Familia = lazy(() => import('./telas/conta/Familia').then((m) => ({ default: m.Familia })));
const Assinatura = lazy(() =>
  import('./telas/conta/Assinatura').then((m) => ({ default: m.Assinatura })),
);
const Privacidade = lazy(() =>
  import('./telas/conta/Privacidade').then((m) => ({ default: m.Privacidade })),
);
const Whatsapp = lazy(() =>
  import('./telas/conta/Whatsapp').then((m) => ({ default: m.Whatsapp })),
);
const Acompanhante = lazy(() =>
  import('./telas/conta/Acompanhante').then((m) => ({ default: m.Acompanhante })),
);

/** Rotas publicas: quem ja entrou vai direto para o Inicio. */
function SoVisitante() {
  const { user } = useAuth();
  return user ? <Navigate to="/inicio" replace /> : <Outlet />;
}

/**
 * Area logada. A guarda tambem cobre a expiracao da sessao: quando a
 * renovacao e recusada, o AuthProvider zera o usuario e o redirecionamento
 * dispara.
 */
function RotaProtegida() {
  const { user } = useAuth();
  return user ? <Casca /> : <Navigate to="/login" replace />;
}

export function App() {
  const { initializing } = useAuth();

  // Enquanto o cookie vira sessao, nenhuma rota e decidida: mostrar o login
  // por um instante a quem ja esta logado parece que a sessao caiu.
  if (initializing) return <Carregando telaCheia />;

  return (
    <Suspense fallback={<Carregando telaCheia />}>
      <Routes>
        <Route element={<SoVisitante />}>
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        </Route>

        <Route element={<RotaProtegida />}>
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/remedios" element={<RemediosLayout />}>
            <Route index element={<RemediosIndex />} />
            <Route path="novo" element={<NovoRemedio />} />
            <Route path="estoque" element={<Estoque />} />
            <Route path="compra" element={<Compra />} />
            <Route path="historico" element={<HistoricoCompleto />} />
            <Route path=":id" element={<RemedioDetalhe />} />
          </Route>
          <Route path="/medicamento/form/:id" element={<MedicamentoForm />} />
          <Route path="/medicamento/receita" element={<RevisarReceita />} />
          <Route path="/medicos" element={<Medicos />} />
          <Route path="/mapa" element={<Mapa />} />
          <Route path="/assistente" element={<Assistente />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="/notificacoes" element={<Avisos />} />
          <Route path="/sintomas" element={<Sintomas />} />
          <Route path="/membro/:id" element={<Membro />} />
          <Route path="/medico/:id" element={<MedicoForm />} />
          <Route path="/consulta/nova" element={<NovaConsulta />} />
          <Route path="/conta/acesso" element={<Acesso />} />
          <Route path="/conta/familia" element={<Familia />} />
          <Route path="/conta/assinatura" element={<Assinatura />} />
          <Route path="/conta/privacidade" element={<Privacidade />} />
          <Route path="/conta/whatsapp" element={<Whatsapp />} />
          <Route path="/conta/acompanhante" element={<Acompanhante />} />
        </Route>

        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </Suspense>
  );
}
