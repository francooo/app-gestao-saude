import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radii, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /** Remove o padding interno, para cards que sangram conteudo ate a borda. */
  flush?: boolean;
};

/**
 * Card da area logada.
 *
 * E o equivalente do GlassCard para a home, com uma diferenca importante: aqui
 * o fundo e creme SOLIDO, nao translucido. Nas telas de autenticacao o card
 * deixa a ilustracao aparecer por tras; aqui ele carrega conteudo denso e
 * precisa de contraste estavel.
 */
export function SurfaceCard({ children, style, flush = false }: Props) {
  return <View style={[styles.card, !flush && styles.padded, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    overflow: 'hidden',
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
