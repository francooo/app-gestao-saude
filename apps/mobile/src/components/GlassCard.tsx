import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radii, sizes, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

/**
 * Cartao translucido do mockup. A cor ja e um branco-creme com alpha, entao a
 * ilustracao verde por tras aparece atenuada — sem precisar de blur real.
 *
 * Se um dia quisermos o desfoque de verdade, e so trocar a View por
 * <BlurView intensity={30} tint="light"> do expo-blur, mantendo o resto igual.
 */
export function GlassCard({ children, style }: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    // Impede o card de virar uma faixa larguissima em tablet.
    width: '100%',
    maxWidth: sizes.cardMaxWidth,
    alignSelf: 'center',
    backgroundColor: colors.cardFill,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    // Sombra suave para o cartao descolar da ilustracao.
    shadowColor: '#2C3520',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
});
