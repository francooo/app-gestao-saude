import type { CSSProperties, ReactNode } from 'react';

import estilos from './SurfaceCard.module.css';

type Props = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Sem padding interno: o conteudo encosta nas bordas (cabecalho ilustrado). */
  flush?: boolean;
  /** Creme solido em vez do translucido que deixa as folhas aparecerem. */
  solido?: boolean;
};

/** Cartao creme de raio 28 — a superficie de quase tudo na area logada. */
export function SurfaceCard({ children, className, style, flush = false, solido = false }: Props) {
  return (
    <div
      className={[estilos.cartao, className].filter(Boolean).join(' ')}
      data-flush={flush ? '' : undefined}
      data-solido={solido ? '' : undefined}
      style={style}
    >
      {children}
    </div>
  );
}
