import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { Icone } from './Icone';
import { PontoDeAvisos } from './PontoDeAvisos';
import estilos from './ScreenHeader.module.css';

type Props = {
  title: string;
  /** Frase curta sob o titulo ("Acompanhe os medicamentos de toda a familia"). */
  subtitle?: string;
  /**
   * Para onde o voltar leva: um caminho fixo, ou 'historico' para a pagina
   * anterior do navegador. Sem ele, a tela e uma das areas do menu.
   */
  voltar?: string | 'historico';
  /** Acoes da tela, a direita do titulo (antes do sino). */
  acoes?: ReactNode;
  /**
   * Aceito por compatibilidade e ignorado: o sino agora aparece em todas as
   * telas, porque os avisos sairam do menu lateral.
   */
  mostrarSino?: boolean;
};

/**
 * Cabecalho de pagina: voltar redondo (nas telas internas), titulo grande a
 * esquerda com subtitulo, as acoes da tela e o sino de avisos a direita.
 */
export function ScreenHeader({ title, subtitle, voltar, acoes }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Um sino que abre a tela em que voce ja esta e botao morto.
  const comSino = pathname !== '/notificacoes';

  return (
    <header className={estilos.cabecalho}>
      {voltar === 'historico' ? (
        <button
          type="button"
          className={estilos.botao}
          onClick={() => navigate(-1)}
          aria-label="Voltar"
        >
          <Icone nome="chevron-left" size={24} />
        </button>
      ) : voltar ? (
        <Link to={voltar} className={estilos.botao} aria-label="Voltar">
          <Icone nome="chevron-left" size={24} />
        </Link>
      ) : null}

      <div className={estilos.textos}>
        <h1 className={estilos.titulo}>{title}</h1>
        {subtitle ? <p className={estilos.subtitulo}>{subtitle}</p> : null}
      </div>

      {acoes ? <div className={estilos.acoes}>{acoes}</div> : null}

      {comSino ? <Sino /> : null}
    </header>
  );
}

/** O sino de avisos, com o ponto de "ha novidades". Tambem usado na tela Inicio. */
export function Sino({ className }: { className?: string }) {
  return (
    <Link
      to="/notificacoes"
      className={[estilos.botao, estilos.sino, className].filter(Boolean).join(' ')}
      aria-label="Avisos"
      title="Avisos"
    >
      <Icone nome="bell" size={22} />
      <PontoDeAvisos />
    </Link>
  );
}
