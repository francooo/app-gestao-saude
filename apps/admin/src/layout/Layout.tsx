import {
  ChartColumn,
  CreditCard,
  LayoutGrid,
  Leaf,
  LogOut,
  Menu,
  Pill,
  Settings,
  Stethoscope,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { useAuth } from '../auth/AuthProvider';
import estilos from './Layout.module.css';

/** Navegacao oficial do DS: 7 itens, sem Notificacoes. */
const ITENS: { rota: string; rotulo: string; Icone: LucideIcon }[] = [
  { rota: '/', rotulo: 'Visão geral', Icone: LayoutGrid },
  { rota: '/usuarios', rotulo: 'Usuários', Icone: Users },
  { rota: '/assinaturas', rotulo: 'Assinaturas', Icone: CreditCard },
  { rota: '/medicamentos', rotulo: 'Medicamentos', Icone: Pill },
  { rota: '/medicos', rotulo: 'Médicos', Icone: Stethoscope },
  { rota: '/relatorios', rotulo: 'Relatórios', Icone: ChartColumn },
  { rota: '/configuracoes', rotulo: 'Configurações', Icone: Settings },
];

export function Logo() {
  return (
    <div className={estilos.logo}>
      <span className={estilos.logoIcone} aria-hidden>
        <Leaf size={22} strokeWidth={2} />
      </span>
      <span className={estilos.logoTexto}>
        Família
        <br />
        Saúde
      </span>
    </div>
  );
}

export function Layout() {
  const { sessao, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();
  const admin = sessao.estado === 'autenticado' ? sessao.admin : null;

  // Em tela estreita o menu e gaveta; fecha ao trocar de pagina.
  useEffect(() => setMenuAberto(false), [local.pathname]);

  return (
    <div className={estilos.casca}>
      <button
        type="button"
        className={estilos.botaoMenu}
        onClick={() => setMenuAberto(true)}
        aria-label="Abrir menu"
      >
        <Menu size={22} />
      </button>

      {menuAberto && <div className={estilos.veu} onClick={() => setMenuAberto(false)} aria-hidden />}

      <aside className={estilos.sidebar} data-aberto={menuAberto}>
        <div className={estilos.topoSidebar}>
          <Logo />
          <button
            type="button"
            className={estilos.fecharMenu}
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav aria-label="Seções do painel">
          <ul className={estilos.navegacao}>
            {ITENS.map(({ rota, rotulo, Icone }) => (
              <li key={rota}>
                <NavLink
                  to={rota}
                  end={rota === '/'}
                  className={({ isActive }) => (isActive ? `${estilos.item} ${estilos.ativo}` : estilos.item)}
                >
                  <Icone size={20} strokeWidth={1.8} aria-hidden />
                  {rotulo}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <img src="/folhas/ramo-b.png" alt="" className={estilos.folhaSidebar} aria-hidden />

        {admin && (
          <div className={estilos.perfil}>
            <span className={estilos.avatar} aria-hidden>
              {iniciais(admin.nome)}
            </span>
            <span className={estilos.perfilTexto}>
              <strong>{admin.nome}</strong>
              <span>{admin.email}</span>
            </span>
            <button type="button" className={estilos.sair} onClick={() => void sair()} title="Sair">
              <LogOut size={18} aria-hidden />
              <span className="so-leitor-de-tela">Sair</span>
            </button>
          </div>
        )}
      </aside>

      <main className={estilos.conteudo}>
        <Outlet />
      </main>
    </div>
  );
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '')).toUpperCase();
}
