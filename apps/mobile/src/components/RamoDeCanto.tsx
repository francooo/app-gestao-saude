import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

const ramo = require('../../assets/images/folhas/ramo-canto.png');

/**
 * Ramo claro pintado DENTRO dos cartoes coloridos (caramelo -> verde), no
 * canto superior direito — como o do cartao do Assistente no mockup. Faz par
 * com os ramos do fundo (ScreenBackground): a folhagem continua dentro do
 * bloco, em vez de o bloco cortar a ilustracao.
 *
 * Vai como PRIMEIRO filho do gradiente, para ficar por tras do conteudo, e
 * sem toque, para nao roubar o Pressable do cartao.
 */
export function RamoDeCanto() {
  return (
    <Image
      source={ramo}
      contentFit="contain"
      pointerEvents="none"
      style={styles.ramo}
      accessible={false}
    />
  );
}

const styles = StyleSheet.create({
  ramo: {
    position: 'absolute',
    top: -24,
    right: -36,
    width: 190,
    height: 190,
    opacity: 0.4,
  },
});
