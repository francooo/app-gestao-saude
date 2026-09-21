import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

const folhasEsquerda = require('../../assets/images/leaves-left.png');
const folhasDireita = require('../../assets/images/leaves-right.png');

type Props = {
  /** Paradas do gradiente. Ver `backgrounds` em @gestao/shared. */
  colors: readonly [string, string, ...string[]];
  /** Sem folhas, fica so o gradiente. */
  leaves?: boolean;
};

/**
 * Fundo das telas da area logada: gradiente mais as folhas em aquarela que
 * emolduram a referencia.
 *
 * As faixas de folhas foram recortadas do proprio mockup, das bordas onde
 * nao ha nenhum card por cima (68px de cada lado). Elas carregam o proprio
 * verde de fundo, que e o mesmo gradiente — por isso nao precisam de
 * transparencia, que seria inviavel de extrair de uma aquarela de baixo
 * contraste.
 *
 * A faixa (4,7% da largura) e mais ESTREITA que a margem dos cards (6,2%).
 * A diferenca fica preenchida pelo gradiente, e a emenda nao aparece porque
 * as duas coisas tem a mesma cor naquela altura.
 */
export function ScreenBackground({ colors, leaves = true }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* O tipo do LinearGradient exige a tupla, nao um array solto. */}
      <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />

      {leaves ? (
        <>
          <Image
            source={folhasEsquerda}
            // `cover` recorta; `stretch` distorceria as folhas em telas de
            // proporcao diferente da do mockup.
            contentFit="cover"
            contentPosition="top left"
            style={[styles.faixa, styles.esquerda]}
          />
          <Image
            source={folhasDireita}
            contentFit="cover"
            contentPosition="top right"
            style={[styles.faixa, styles.direita]}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    // 4,7% e a largura do recorte no mockup (68 de 1440).
    width: '4.7%',
  },
  esquerda: { left: 0 },
  direita: { right: 0 },
});
