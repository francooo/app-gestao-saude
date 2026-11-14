import type { ReactNode } from 'react';
import { Link } from 'react-router';

import estilos from './Ajustes.module.css';
import { Icone } from './Icone';

/** Agrupa linhas num cartao, com um filete entre elas (alinhado ao texto). */
export function SettingsGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={[estilos.grupo, className].filter(Boolean).join(' ')}>{children}</div>;
}

type Props = {
  /** Marcador de 44 px a esquerda: um <IconTile /> ou um <Avatar size={44} />. */
  marcador: ReactNode;
  rotulo: string;
  /** Segunda linha: o estado da linha (o e-mail, quantas pessoas). */
  valor?: string;
  /** Reserva a altura da segunda linha enquanto o valor nao chegou. */
  reservarValor?: boolean;
  /** Destino da linha. Com ele, a linha e um link com seta. */
  para?: string;
  /** Com `ligado` definido, a linha inteira e um interruptor. */
  ligado?: boolean;
  onChange?: (valor: boolean) => void;
  desabilitado?: boolean;
  /** Substitui o `valor` quando desabilitado. */
  motivoDesabilitado?: string;
};

/**
 * Uma linha de ajuste: marcador, rotulo, segunda linha e um acessorio (seta,
 * interruptor ou nada). O clique e da linha inteira, como no aplicativo.
 */
export function SettingsRow({
  marcador,
  rotulo,
  valor,
  reservarValor = false,
  para,
  ligado,
  onChange,
  desabilitado = false,
  motivoDesabilitado,
}: Props) {
  const segundaLinha = desabilitado && motivoDesabilitado ? motivoDesabilitado : valor;

  const miolo = (
    <>
      <span className={estilos.marcador}>{marcador}</span>
      <span className={estilos.textos}>
        <span className={estilos.rotulo}>{rotulo}</span>
        {segundaLinha || reservarValor ? (
          <span className={estilos.valor}>{segundaLinha ?? ' '}</span>
        ) : null}
      </span>
    </>
  );

  if (ligado !== undefined) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        className={estilos.linha}
        disabled={desabilitado}
        onClick={() => onChange?.(!ligado)}
      >
        {miolo}
        <Interruptor ligado={ligado} />
      </button>
    );
  }

  if (para && !desabilitado) {
    return (
      <Link to={para} className={estilos.linha}>
        {miolo}
        <Icone nome="chevron-right" size={20} className={estilos.seta} />
      </Link>
    );
  }

  return (
    <div className={estilos.linha} data-inerte="" data-apagada={desabilitado ? '' : undefined}>
      {miolo}
    </div>
  );
}

/** O desenho do interruptor. O estado e o clique sao de quem o envolve. */
export function Interruptor({ ligado }: { ligado: boolean }) {
  return <span className={estilos.interruptor} data-ligado={ligado ? '' : undefined} aria-hidden="true" />;
}
