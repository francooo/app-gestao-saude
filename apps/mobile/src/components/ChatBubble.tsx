import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  /** 'assistant' ganha o circulo de faisca a esquerda, como no mockup. */
  autor: 'user' | 'assistant';
  texto: string;
  /** Bolha de espera, com reticencias no lugar do texto. */
  pensando?: boolean;
};

export function ChatBubble({ autor, texto, pensando = false }: Props) {
  const doAssistente = autor === 'assistant';

  return (
    <View
      style={[styles.linha, doAssistente ? styles.linhaAssistente : styles.linhaUsuario]}
      accessibilityRole="text"
      // Sem isto o leitor de tela le a bolha sem dizer de quem e.
      accessibilityLabel={`${doAssistente ? 'Assistente' : 'Você'}: ${pensando ? 'pensando' : texto}`}
      accessibilityLiveRegion={pensando ? 'polite' : 'none'}
    >
      {doAssistente ? (
        <View style={styles.faisca}>
          <Feather name="zap" size={18} color={colors.accentGreen} />
        </View>
      ) : null}

      <View
        style={[styles.bolha, doAssistente ? styles.bolhaAssistente : styles.bolhaUsuario]}
      >
        {pensando ? (
          <Text style={[styles.texto, styles.pensando]}>• • •</Text>
        ) : (
          <Text style={[styles.texto, !doAssistente && styles.textoUsuario]}>{texto}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  linhaAssistente: { justifyContent: 'flex-start' },
  // A pergunta encosta na direita: e a convencao de chat que todo mundo ja le
  // sem precisar de rotulo.
  linhaUsuario: { justifyContent: 'flex-end', paddingLeft: spacing.xxl },
  faisca: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.assistantBubble,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bolha: {
    flexShrink: 1,
    borderRadius: radii.card - 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bolhaAssistente: { backgroundColor: colors.assistantBubble },
  bolhaUsuario: { backgroundColor: colors.accentGreen },
  texto: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  textoUsuario: { color: colors.onAccent },
  pensando: { letterSpacing: 2, color: colors.textSecondary },
});
