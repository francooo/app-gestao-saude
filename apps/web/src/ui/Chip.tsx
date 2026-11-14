import type { ReactNode } from 'react';

import estilos from './Chip.module.css';

/** Selo ambar ao lado de um rotulo: o valor veio da leitura da foto ou da IA. */
export function SeloDaIA() {
  // Fora do leitor de tela: o aviso do campo ja diz de onde o valor veio.
  return (
    <span className={estilos.selo} aria-hidden="true">
      da foto
    </span>
  );
}

/** Uma fileira de chips que quebra linha. */
export function Chips({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className={estilos.chips} role="group" aria-label={rotulo}>
      {children}
    </div>
  );
}

/** Chip de escolha dentro de um formulario: verde quando escolhido. */
export function Chip({
  rotulo,
  ativo,
  disabled,
  onClick,
}: {
  rotulo: string;
  ativo: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={estilos.chip}
      aria-pressed={ativo}
      disabled={disabled}
      onClick={onClick}
    >
      {rotulo}
    </button>
  );
}
