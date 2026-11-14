import { Link, NavLink, Outlet, useLocation } from 'react-router';

import ramo from '@/imagens/folhas/ramo-canto.png';
import { AvisosProvider } from '@/lib/avisos';
import { Icone } from '@/ui/Icone';
import { Logo } from '@/ui/Logo';

import estilos from './Casca.module.css';

/** As cinco areas, na ordem do menu das telas de referencia. */
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
 * Moldura da area logada.
 *
 * - Tela larga: painel lateral de cima a baixo, com a marca e as cinco areas.
 * - Tablet: o mesmo painel, recolhido em icones.
 * - Celular: a barra de abas embaixo.
 *
 * E uma lista de links so; o CSS decide a forma. Os avisos nao estao no menu:
 * o sino mora no cabecalho de cada tela (ui/ScreenHeader).
 */
export function Casca() {
  const { pathname } = useLocation();

  return (
    // Os avisos sao calculados uma vez aqui e lidos pelo sino de cada tela.
    <AvisosProvider>
      <div className={estilos.casca} data-sem-barra={mostraBarra(pathname) ? undefined : ''}>
        <nav className={estilos.menu} aria-label="Áreas do site">
          <Link to="/inicio" className={estilos.marca} aria-label="Família Saúde, ir para o início">
            <Logo tamanho={52} className={estilos.marcaCompleta} />
            <Logo formato="simbolo" tamanho={44} className={estilos.marcaRecolhida} />
          </Link>

          <ul className={estilos.areas}>
            {AREAS.map(({ para, rotulo, icone }) => (
              <li key={para}>
                <NavLink to={para} className={estilos.item} title={rotulo}>
                  <Icone nome={icone} size={24} />
                  <span className={estilos.rotulo}>{rotulo}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          <img src={ramo} alt="" className={estilos.ramo} />
        </nav>

        <div className={estilos.conteudo}>
          <Outlet />
        </div>
      </div>
    </AvisosProvider>
  );
}
