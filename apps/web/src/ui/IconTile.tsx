import type { FormaVisual } from '@gestao/shared/lib/posologia';

import { Icone } from './Icone';

type Props = {
  icone: string;
  fundo: string;
  traco: string;
  /** 54 nas linhas de lista, 44 nos resumos. */
  size?: number;
  className?: string;
};

const RAIO: Record<number, number> = { 44: 14, 54: 16 };

/** Ladrilho colorido com icone: a marca visual de cada linha de lista. */
export function IconTile({ icone, fundo, traco, size = 44, className }: Props) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: RAIO[size] ?? Math.round(size * 0.3),
        background: fundo,
      }}
    >
      <Icone nome={icone} size={Math.round(size * 0.45)} color={traco} />
    </span>
  );
}

const QUENTE = { fundo: 'var(--cor-surface-warm)', traco: 'var(--cor-accent)' } as const;
const SALVIA = { fundo: 'var(--cor-pill-tablet)', traco: 'var(--cor-pill-tablet-icon)' } as const;

export const LADRILHO_POR_FORMA: Record<
  FormaVisual,
  { fundo: string; traco: string; icone: string }
> = {
  capsula: { ...QUENTE, icone: 'mci:pill' },
  comprimido: { ...SALVIA, icone: 'mci:minus-circle-outline' },
  gotas: { ...QUENTE, icone: 'droplet' },
  ml: { ...SALVIA, icone: 'thermometer' },
  jato: { ...QUENTE, icone: 'wind' },
};

/** Neutro: registro sem pendencia. */
export const LADRILHO_NEUTRO = SALVIA;

/** Ambar: "tem coisa para fazer" — nunca use so para enfeitar. */
export const LADRILHO_ATENCAO = QUENTE;
