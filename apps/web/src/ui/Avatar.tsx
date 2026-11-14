import { initialsFor, pickAvatarColor } from '@gestao/shared';
import { useEffect, useState } from 'react';

import estilos from './Avatar.module.css';

type Props = {
  nome: string;
  size?: number;
  color?: string;
  /** Data URI da foto. Sem ela (ou se quebrar), ficam as iniciais. */
  photo?: string | null;
  /** Desenha o anel verde de "selecionado" em volta. */
  selected?: boolean;
  className?: string;
};

/**
 * Avatar redondo: iniciais sobre a cor da pessoa, com a foto por cima.
 *
 * As iniciais ficam SEMPRE desenhadas. Assim o estado degradado — foto
 * quebrada, ainda carregando — e as iniciais, e nunca um buraco.
 */
export function Avatar({ nome, size = 52, color, photo, selected = false, className }: Props) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [photo]);

  return (
    <span
      className={[estilos.avatar, className].filter(Boolean).join(' ')}
      data-selecionado={selected ? '' : undefined}
      style={{
        width: size,
        height: size,
        background: color ?? pickAvatarColor(nome),
        fontSize: size * 0.36,
      }}
      aria-hidden="true"
    >
      {initialsFor(nome)}
      {photo && !falhou ? (
        <img src={photo} alt="" className={estilos.foto} onError={() => setFalhou(true)} />
      ) : null}
    </span>
  );
}
