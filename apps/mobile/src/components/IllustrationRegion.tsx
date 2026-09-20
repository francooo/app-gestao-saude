import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

const source = require('../../assets/images/login-bg.jpg');

/**
 * Regiao inferior da tela: a ilustracao da mae com o bebe.
 *
 * O truque esta em contentPosition="bottom center" com contentFit="cover".
 * O asset tem 28% de verde chapado no topo; ancorando embaixo, o recorte
 * vertical come sempre essa faixa vazia primeiro — nunca o rosto da mae.
 * Isso vale em qualquer proporcao de tela, sem condicional por aparelho.
 *
 * Como a faixa do asset e o mesmo verde do fundo da tela, a emenda entre
 * esta regiao e o card acima e invisivel.
 */
export function IllustrationRegion() {
  return (
    <View style={styles.region}>
      <Image
        source={source}
        contentFit="cover"
        contentPosition="bottom center"
        style={StyleSheet.absoluteFill}
        // A imagem e decorativa: o conteudo da tela ja esta nos rotulos, entao
        // o leitor de tela deve ignora-la.
        accessible={false}
        transition={200}
      />
      {/* Seguro contra banding do JPEG na transicao para o verde solido
          em paineis Android mais simples. */}
      <LinearGradient
        colors={[colors.sage, 'transparent']}
        style={styles.seam}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  region: {
    flex: 1,
    // Garante que a ilustracao nao suma de vez com o teclado aberto.
    minHeight: 200,
    overflow: 'hidden',
  },
  seam: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 28,
  },
});
