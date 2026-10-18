import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radii, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /** Remove o padding interno, para cards que sangram conteudo ate a borda. */
  flush?: boolean;
  /** Creme opaco, para quem precisa de contraste maximo (formulario longo). */
  solido?: boolean;
};

/**
 * Card da area logada.
 *
 * Creme a 85% (colors.surfaceCard): os ramos do fundo passam por tras e
 * aparecem de leve atraves do cartao — e o que da continuidade as folhas, em
 * vez de o cartao parecer colado por cima. 85% e o minimo que mantem o texto
 * secundario em 4,5:1 com a folha mais escura atras.
 *
 * Sombra DIFERENTE por plataforma, e isso e load-bearing: no Android a
 * `elevation` desenha a sombra por baixo do card inteiro, e com fundo
 * translucido ela aparece DENTRO dele como uma mancha escura. La a sombra
 * sai e entra um filete claro na borda, que separa o cartao do fundo.
 */
export function SurfaceCard({ children, style, flush = false, solido = false }: Props) {
  return (
    <View
      style={[
        styles.card,
        solido ? styles.solido : styles.translucido,
        !flush && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  translucido: {
    backgroundColor: colors.surfaceCard,
    ...Platform.select({
      android: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
      default: {
        shadowColor: '#2C3520',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
    }),
  },
  solido: {
    backgroundColor: colors.surface,
    shadowColor: '#2C3520',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  padded: {
    padding: spacing.xl,
  },
});
