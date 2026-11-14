import type { ReactNode } from 'react';
import { Link } from 'react-router';

import estilos from './CartaoDeResumo.module.css';
import { Icone } from './Icone';

type Props = {
  icone: string;
  /**
   * Cor do ladrilho. 'atencao' (mostarda) so quando ha algo a resolver —
   * nunca para enfeitar.
   */
  tom?: 'verde' | 'atencao' | 'escuro';
  rotulo: string;
  /** O dado: "Amoxicilina 500 mg", "6", "1 alerta". */
  valor: ReactNode;
  /** Linha de apoio sob o valor ("às 14:00"). */
  apoio?: ReactNode;
  /**
   * 'atalho': rotulo colorido em cima e o dado embaixo, com seta (os tres
   * cartoes da tela Inicio). 'indicador': o dado em numero grande (a faixa de
   * indicadores de Medicamentos).
   */
  formato?: 'atalho' | 'indicador';
  /** Com destino, o cartao inteiro e um link. */
  para?: string;
};

/** Cartao de resumo: ladrilho com icone, rotulo e um dado. */
export function CartaoDeResumo({
  icone,
  tom = 'verde',
  rotulo,
  valor,
  apoio,
  formato = 'atalho',
  para,
}: Props) {
  const miolo = (
    <>
      <span className={estilos.ladrilho} aria-hidden="true">
        <Icone nome={icone} size={formato === 'indicador' ? 26 : 28} />
      </span>
      <span className={estilos.textos}>
        <span className={estilos.rotulo}>{rotulo}</span>
        <span className={estilos.valor}>{valor}</span>
        {apoio ? <span className={estilos.apoio}>{apoio}</span> : null}
      </span>
      {para ? <Icone nome="chevron-right" size={22} className={estilos.seta} /> : null}
    </>
  );

  const atributos = { className: estilos.cartao, 'data-tom': tom, 'data-formato': formato };

  return para ? (
    <Link to={para} {...atributos}>
      {miolo}
    </Link>
  ) : (
    <div {...atributos}>{miolo}</div>
  );
}
