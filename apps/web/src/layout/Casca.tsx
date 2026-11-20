import { NavLink, Outlet, useLocation } from 'react-router';

import { AvisosProvider } from '@/lib/avisos';
import { PessoaAtivaProvider } from '@/lib/pessoaAtiva';
import { Icone } from '@/ui/Icone';
import { Sino } from '@/ui/ScreenHeader';
import { SeletorDeMembros } from '@/ui/SeletorDeMembros';

import estilos from './Casca.module.css';

/** As cinco areas, na ordem do cabecalho dos mocks. */
const AREAS = [
  { para: '/inicio', rotulo: 'Início', icone: 'home' },
  { para: '/remedios', rotulo: 'Remédios', icone: 'mci:pill' },
  { para: '/medicos', rotulo: 'Médicos', icone: 'mci:medical-bag' },
  { para: '/assistente', rotulo: 'Assistente', icone: 'message-square' },
  { para: '/ajustes', rotulo: 'Ajustes', icone: 'settings' },
] as const;

/**
 * Onde a barra inferior aparece no celular: so nas cinco areas (e na pilha de
 * Remedios). Abas embaixo de um formulario longo convidam a sair no meio do
 * preenchimento.
 */
function mostraBarra(caminho: string): boolean {
  return AREAS.some(({ para }) => caminho === para) || caminho.startsWith('/remedios/');
}

/**
 * Moldura da area logada (repaginacao Organic Contemporary).
 *
 * - Computador: cabecalho horizontal fino, sem logo e sem menu lateral. As
 *   cinco areas a esquerda (a atual numa capsula pistache); a direita o
 *   seletor de membros e o sino de avisos.
 * - Tablet: o mesmo cabecalho, com icones no lugar dos rotulos e so os
 *   avatares no seletor.
 * - Celular: a barra de abas flutuante embaixo, e no topo uma fileira rolavel
 *   com os membros e o sino.
 *
 * O membro escolhido vale para o site inteiro (lib/pessoaAtiva).
 */
export function Casca() {
  const { pathname } = useLocation();

  return (
    // Os avisos sao calculados uma vez aqui e lidos pelo sino.
    <AvisosProvider>
      <PessoaAtivaProvider>
        <div className={estilos.casca} data-sem-barra={mostraBarra(pathname) ? undefined : ''}>
          <header className={estilos.cabecalho}>
            <nav className={estilos.menu} aria-label="Áreas do site">
              <ul className={estilos.areas}>
                {AREAS.map(({ para, rotulo, icone }) => (
                  <li key={para}>
                    <NavLink to={para} className={estilos.item} title={rotulo}>
                      <Icone nome={icone} size={22} />
                      <span className={estilos.rotulo}>{rotulo}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>

            <div className={estilos.membrosLargo}>
              <SeletorDeMembros formato="cabecalho" />
            </div>
            <div className={estilos.membrosFileira}>
              <SeletorDeMembros formato="fileira" />
            </div>

            {pathname !== '/notificacoes' ? <Sino className={estilos.sino} /> : null}
          </header>

          <div className={estilos.conteudo}>
            <Outlet />
          </div>
        </div>
      </PessoaAtivaProvider>
    </AvisosProvider>
  );
}
