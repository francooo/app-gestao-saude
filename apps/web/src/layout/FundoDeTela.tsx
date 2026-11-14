import ramoA from '@/imagens/folhas/ramo-a.png';
import ramoB from '@/imagens/folhas/ramo-b.png';
import ramoC from '@/imagens/folhas/ramo-c.png';

import estilos from './FundoDeTela.module.css';

const RAMOS = { a: ramoA, b: ramoB, c: ramoC } as const;

type Ramo = {
  ramo: keyof typeof RAMOS;
  lado: 'esquerda' | 'direita';
  /** Fracao da altura da janela. */
  top: number;
  /** Fracao da largura da janela; o CSS limita o tamanho em tela larga. */
  largura: number;
  rotacao: number;
};

/**
 * Os mesmos arranjos do ScreenBackground do aplicativo: os ramos entram pelas
 * bordas, em alturas alternadas, e passam POR TRAS dos cartoes. La as posicoes
 * sao fracoes da tela do celular; aqui cada ramo e ancorado na sua borda, para
 * a folha continuar saindo da janela — e nao boiar no meio — quando ela e larga.
 */
const ARRANJOS: Record<'home' | 'padrao', Ramo[]> = {
  // Na web os ramos ficam so nos cantos da direita: o da esquerda e o do pe
  // do menu lateral (layout/Casca). O miolo da tela fica livre para o conteudo.
  home: [{ ramo: 'c', lado: 'direita', top: 0.7, largura: 0.22, rotacao: -12 }],
  padrao: [
    { ramo: 'b', lado: 'direita', top: -0.06, largura: 0.24, rotacao: -10 },
    { ramo: 'c', lado: 'direita', top: 0.72, largura: 0.2, rotacao: -12 },
  ],
};

export type AreaDoFundo = 'home' | 'doctors' | 'medications' | 'family' | 'assistant' | 'settings';

type Props = {
  /** Qual degrade usar: os de `backgrounds` em @gestao/shared. */
  area: AreaDoFundo;
  /** Sem folhas, fica so o degrade. */
  folhas?: boolean;
  arranjo?: keyof typeof ARRANJOS;
};

/**
 * Fundo das telas da area logada: degrade mais ramos de folhas em aquarela.
 *
 * Fica preso a janela (position: fixed), atras de tudo: o conteudo rola por
 * cima e os cartoes translucidos deixam a folha aparecer de leve.
 */
export function FundoDeTela({ area, folhas = true, arranjo = 'padrao' }: Props) {
  return (
    <div className={estilos.fundo} style={{ background: `var(--fundo-${area})` }} aria-hidden="true">
      {folhas
        ? ARRANJOS[arranjo].map((r, i) => (
            <img
              key={i}
              src={RAMOS[r.ramo]}
              alt=""
              className={estilos.ramo}
              data-lado={r.lado}
              style={{
                top: `${r.top * 100}%`,
                ['--largura' as string]: `${r.largura * 100}vw`,
                ['--rotacao' as string]: `${r.rotacao}deg`,
              }}
            />
          ))
        : null}
    </div>
  );
}
