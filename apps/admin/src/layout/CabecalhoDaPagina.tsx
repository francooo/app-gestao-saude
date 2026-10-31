import type { ReactNode } from 'react';

import estilos from './CabecalhoDaPagina.module.css';

/** Titulo + subtitulo da pagina, com a folhagem decorativa a direita. */
export function CabecalhoDaPagina({
  titulo,
  subtitulo,
  acoes,
}: {
  titulo: string;
  subtitulo: string;
  acoes?: ReactNode;
}) {
  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.textos}>
        <h1 className={estilos.titulo}>{titulo}</h1>
        <p className={estilos.subtitulo}>{subtitulo}</p>
      </div>
      {acoes && <div className={estilos.acoes}>{acoes}</div>}
      <img src="/folhas/ramo-canto.png" alt="" className={estilos.folha} aria-hidden />
    </header>
  );
}
