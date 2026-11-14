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
  home: [
    { ramo: 'a', lado: 'esquerda', top: -0.02, largura: 0.42, rotacao: 8 },
    { ramo: 'b', lado: 'direita', top: 0.05, largura: 0.45, rotacao: -10 },
    { ramo: 'c', lado: 'esquerda', top: 0.4, largura: 0.34, rotacao: 15 },
    { ramo: 'a', lado: 'direita', top: 0.46, largura: 0.38, rotacao: -6 },
    { ramo: 'b', lado: 'esquerda', top: 0.72, largura: 0.46, rotacao: 4 },
    { ramo: 'c', lado: 'direita', top: 0.8, largura: 0.3, rotacao: -12 },
  ],
  // Telas de lista e formulario: menos ramos, para nao competir com o conteudo.
  padrao: [
    { ramo: 'b', lado: 'direita', top: -0.03, largura: 0.44, rotacao: -10 },
    { ramo: 'a', lado: 'esquerda', top: 0.3, largura: 0.4, rotacao: 8 },
    { ramo: 'c', lado: 'direita', top: 0.62, largura: 0.3, rotacao: -12 },
    { ramo: 'b', lado: 'esquerda', top: 0.78, largura: 0.42, rotacao: 4 },
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
