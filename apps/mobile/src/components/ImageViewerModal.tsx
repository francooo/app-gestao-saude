import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

type Props = {
  uri: string | null;
  visivel: boolean;
  /** Anunciado pelo leitor de tela ao abrir. */
  descricao?: string;
  onClose: () => void;
};

/**
 * Imagem em tela cheia, com zoom.
 *
 * Existe por causa da receita medica: a miniatura serve para saber que ela
 * esta ali, mas ler uma posologia escrita a mao exige aproximar. O zoom vem do
 * ScrollView, que e o caminho sem dependencia nova — um gestor de gestos so
 * para isto nao se paga.
 *
 * `contentFit="contain"` e nao "cover": cortar um documento para preencher a
 * tela esconderia justamente a borda onde costumam estar a data e a
 * assinatura.
 */
export function ImageViewerModal({ uri, visivel, descricao, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visivel && !!uri}
      animationType="fade"
      onRequestClose={onClose}
      // Sem isto o leitor de tela continua alcancando a tela de tras.
      accessibilityViewIsModal
      statusBarTranslucent
    >
      <View style={styles.fundo}>
        <ScrollView
          contentContainerStyle={styles.centro}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          {uri ? (
            <Image
              source={{ uri }}
              contentFit="contain"
              style={styles.imagem}
              accessibilityLabel={descricao ?? 'Imagem em tela cheia'}
            />
          ) : null}
        </ScrollView>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          hitSlop={8}
          style={[styles.fechar, { top: insets.top + 12 }]}
        >
          <Feather name="x" size={22} color={colors.onAccent} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: colors.overlay },
  centro: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  imagem: { width: '100%', height: '100%', minHeight: 400 },
  fechar: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
});
