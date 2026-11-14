import { Link, useNavigate } from 'react-router';

import { Icone } from './Icone';
import { PontoDeAvisos } from './PontoDeAvisos';
import estilos from './ScreenHeader.module.css';

type Props = {
  title: string;
  /**
   * Para onde o voltar leva. Um caminho fixo, como no aplicativo (que usa
   * router.replace para a origem conhecida), ou 'historico' para a pagina
   * anterior do navegador.
   */
  voltar?: string | 'historico';
  /** Sino de avisos a direita. So aparece no celular: em tela larga ele esta no menu. */
  mostrarSino?: boolean;
};

/** Cabecalho das telas internas: voltar, titulo centrado e, as vezes, o sino. */
export function ScreenHeader({ title, voltar, mostrarSino = false }: Props) {
  const navigate = useNavigate();

  return (
    <header className={estilos.linha}>
      <div className={estilos.lado}>
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
      </div>

      <h1 className={estilos.titulo}>{title}</h1>

      <div className={estilos.lado}>
        {mostrarSino ? (
          <Link to="/notificacoes" className={`${estilos.botao} ${estilos.sino}`} aria-label="Avisos">
            <Icone nome="bell" size={20} />
            <PontoDeAvisos />
          </Link>
        ) : null}
      </div>
    </header>
  );
}
