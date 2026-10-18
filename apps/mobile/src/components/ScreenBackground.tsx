import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type DimensionValue } from 'react-native';

const RAMOS = {
  a: { fonte: require('../../assets/images/folhas/ramo-a.png'), proporcao: 675 / 1050 },
  b: { fonte: require('../../assets/images/folhas/ramo-b.png'), proporcao: 750 / 825 },
  c: { fonte: require('../../assets/images/folhas/ramo-c.png'), proporcao: 465 / 615 },
} as const;

type Ramo = {
  ramo: keyof typeof RAMOS;
  /** Fracoes da TELA: funcionam em qualquer tamanho de celular. */
  left: number;
  top: number;
  largura: number;
  rotacao: number;
  espelhar?: boolean;
};

/**
 * Onde ficam os ramos. As posicoes de 'home' sao as da previa aprovada (e as
 * mesmas de ARRANJO_HOME em assets-source/gerador-folhas/gerar_folhas.py):
 * entram pelas bordas, em alturas alternadas, e passam POR TRAS dos cartoes.
 * Valores negativos e acima de 1 sao de proposito — a folha sai da tela em vez
 * de terminar num corte reto.
 */
const ARRANJOS: Record<'home' | 'padrao', Ramo[]> = {
  home: [
    { ramo: 'a', left: -0.16, top: -0.02, largura: 0.42, rotacao: 8 },
    { ramo: 'b', left: 0.7, top: 0.05, largura: 0.45, rotacao: -10, espelhar: true },
    { ramo: 'c', left: -0.14, top: 0.4, largura: 0.34, rotacao: 15 },
    { ramo: 'a', left: 0.74, top: 0.46, largura: 0.38, rotacao: -6, espelhar: true },
    { ramo: 'b', left: -0.2, top: 0.72, largura: 0.46, rotacao: 4 },
    { ramo: 'c', left: 0.8, top: 0.8, largura: 0.3, rotacao: -12, espelhar: true },
  ],
  // Telas de lista/formulario: menos ramos, para nao competir com o conteudo.
  padrao: [
    { ramo: 'b', left: 0.68, top: -0.03, largura: 0.44, rotacao: -10, espelhar: true },
    { ramo: 'a', left: -0.18, top: 0.3, largura: 0.4, rotacao: 8 },
    { ramo: 'c', left: 0.8, top: 0.62, largura: 0.3, rotacao: -12, espelhar: true },
    { ramo: 'b', left: -0.2, top: 0.78, largura: 0.42, rotacao: 4 },
  ],
};

type Props = {
  /** Paradas do gradiente. Ver `backgrounds` em @gestao/shared. */
  colors: readonly [string, string, ...string[]];
  /** Sem folhas, fica so o gradiente. */
  leaves?: boolean;
  arranjo?: keyof typeof ARRANJOS;
};

const pct = (f: number) => `${f * 100}%` as DimensionValue;

/**
 * Fundo das telas da area logada: gradiente mais ramos de folhas em aquarela.
 *
 * Os ramos sao PNG com transparencia gerados por
 * assets-source/gerador-folhas/gerar_folhas.py (o pacote de telas so tem
 * composicoes achatadas). Substituem as faixas de 68 px recortadas do mockup,
 * que terminavam em linha reta e faziam os cartoes parecerem colados por
 * cima. Junto com os cartoes translucidos (colors.surfaceCard), a folha passa
 * por tras do cartao, aparece de leve atraves dele e continua do outro lado.
 */
export function ScreenBackground({ colors, leaves = true, arranjo = 'padrao' }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* O tipo do LinearGradient exige a tupla, nao um array solto. */}
      <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />

      {leaves
        ? ARRANJOS[arranjo].map((r, i) => (
            <Image
              key={i}
              source={RAMOS[r.ramo].fonte}
              contentFit="contain"
              style={{
                position: 'absolute',
                left: pct(r.left),
                top: pct(r.top),
                width: pct(r.largura),
                aspectRatio: RAMOS[r.ramo].proporcao,
                transform: [{ rotate: `${r.rotacao}deg` }, { scaleX: r.espelhar ? -1 : 1 }],
              }}
            />
          ))
        : null}
    </View>
  );
}
