import ramoInfDir from '@/imagens/repag/ramo-inf-dir.webp';
import ramoInfEsq from '@/imagens/repag/ramo-inf-esq.webp';
import ramoSupDir from '@/imagens/repag/ramo-sup-dir.webp';
import ramoSupEsq from '@/imagens/repag/ramo-sup-esq.webp';

import estilos from './FundoDeTela.module.css';

export type AreaDoFundo = 'home' | 'doctors' | 'medications' | 'family' | 'assistant' | 'settings';

type Props = {
  /** Qual degrade usar (hoje todos apontam para o creme da repaginacao). */
  area: AreaDoFundo;
  /** Sem folhas, fica so o fundo. */
  folhas?: boolean;
  /** Aceito por compatibilidade: todas as telas usam o mesmo arranjo. */
  arranjo?: string;
};

/**
 * Fundo das telas da area logada: creme e os ramos aquarelados nos quatro
 * cantos, recortados dos mocks da repaginacao.
 *
 * Os ramos sao MOLDURA (regra do design system): ficam presos aos cantos da
 * janela, em baixa opacidade, por tras de tudo — nunca atras de um campo, de
 * um numero ou de um botao no meio da tela.
 */
export function FundoDeTela({ area, folhas = true }: Props) {
  return (
    <div className={estilos.fundo} style={{ background: `var(--fundo-${area})` }} aria-hidden="true">
      {folhas ? (
        <>
          <img src={ramoSupEsq} alt="" className={estilos.ramo} data-canto="sup-esq" />
          <img src={ramoInfEsq} alt="" className={estilos.ramo} data-canto="inf-esq" />
          <img src={ramoSupDir} alt="" className={estilos.ramo} data-canto="sup-dir" />
          <img src={ramoInfDir} alt="" className={estilos.ramo} data-canto="inf-dir" />
        </>
      ) : null}
    </div>
  );
}
