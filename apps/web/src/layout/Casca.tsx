import { NavLink, Outlet, useLocation } from 'react-router';

import folha from '@/imagens/leaf-icon.png';
import { AvisosProvider } from '@/lib/avisos';
import { Icone } from '@/ui/Icone';
import { PontoDeAvisos } from '@/ui/PontoDeAvisos';

import estilos from './Casca.module.css';

/** As cinco areas, na ordem e com os icones da barra de abas do aplicativo. */
const AREAS = [
  { para: '/inicio', rotulo: 'Início', icone: 'home' },
  { para: '/remedios', rotulo: 'Remédios', icone: 'mci:pill' },
  { para: '/medicos', rotulo: 'Médicos', icone: 'map-pin' },
  { para: '/assistente', rotulo: 'Assistente', icone: 'message-square' },
  { para: '/ajustes', rotulo: 'Ajustes', icone: 'mci:tune-variant' },
] as const;

/**
 * Onde a barra inferior aparece no celular.
 *
 * Regra do aplicativo: formularios e telas secundarias escondem a barra,
 * porque abas embaixo de um formulario longo convidam a sair no meio do
 * preenchimento. So as cinco areas (e a pilha de Remedios) a mostram.
 */
function mostraBarra(caminho: string): boolean {
  return AREAS.some(({ para }) => caminho === para) || caminho.startsWith('/remedios/');
}

/**
 * Moldura da area logada.
 *
 * - Celular: a barra de abas flutuante do aplicativo, embaixo.
 * - Tablet: a mesma barra vira coluna a esquerda, so com os icones.
 * - Tela larga: menu lateral fixo, com rotulos.
 *
 * E uma lista de links so; o CSS decide a forma. O fundo (degrade e folhas) e
 * de cada tela, como no aplicativo — a moldura fica transparente por cima.
 */
export function Casca() {
  const { pathname } = useLocation();

  return (
    // Os avisos sao calculados uma vez aqui e lidos pelo sino de cada tela.
    <AvisosProvider>
    <div className={estilos.casca} data-sem-barra={mostraBarra(pathname) ? undefined : ''}>
      <nav className={estilos.menu} aria-label="Áreas do aplicativo">
        <div className={estilos.marca}>
          <img src={folha} alt="" width={34} height={34} />
          <span className={estilos.nomeDaMarca}>Gestão Saúde</span>
        </div>

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

        <NavLink to="/notificacoes" className={estilos.avisos} title="Avisos">
          <span className={estilos.sino}>
            <Icone nome="bell" size={22} />
            <PontoDeAvisos />
          </span>
          <span className={estilos.rotulo}>Avisos</span>
        </NavLink>
      </nav>

      <div className={estilos.conteudo}>
        <Outlet />
      </div>
    </div>
    </AvisosProvider>
  );
}
