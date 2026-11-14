import { Link } from 'react-router';

import folha from '@/imagens/leaf-icon.png';

import { Icone } from './Icone';
import estilos from './SectionHeader.module.css';

type Props = {
  title: string;
  /** Destino do link a direita ("Ver todos"). */
  verTodos?: string;
  /** Em vez de navegar, a acao a direita alterna algo na propria tela. */
  onVerTodos?: () => void;
  verTodosLabel?: string;
  /** Folha da marca antes do titulo. */
  icon?: 'leaf';
};

/** Titulo de secao com a acao "Ver todos" a direita. */
export function SectionHeader({
  title,
  verTodos,
  onVerTodos,
  verTodosLabel = 'Ver todos',
  icon,
}: Props) {
  const conteudo = (
    <>
      {verTodosLabel}
      <Icone nome="chevron-right" size={18} />
    </>
  );

  return (
    <div className={estilos.linha}>
      <div className={estilos.tituloLinha}>
        {icon === 'leaf' ? <img src={folha} alt="" width={26} height={26} /> : null}
        <h2 className={estilos.titulo}>{title}</h2>
      </div>
      {verTodos ? (
        <Link to={verTodos} className={estilos.link} aria-label={`${verTodosLabel}: ${title}`}>
          {conteudo}
        </Link>
      ) : onVerTodos ? (
        <button type="button" className={estilos.link} onClick={onVerTodos}>
          {conteudo}
        </button>
      ) : null}
    </div>
  );
}
