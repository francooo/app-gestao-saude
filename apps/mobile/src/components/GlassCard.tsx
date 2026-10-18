import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';

import { colors, radii, sizes, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

/**
 * Fracao da largura da tela ocupada pelo card. O mockup usa ~65%; 75% deixa
 * os campos com folga para o texto digitado sem perder o ar de card estreito.
 */
const FRACAO_DA_TELA = 0.75;
/**
 * Piso da largura. Abaixo disso os campos ficam apertados demais; numa tela
 * de 320pt o `width: '100%'` (largura disponivel, ~272) vence o piso e o card
 * simplesmente ocupa a linha toda, como antes.
 */
const LARGURA_MINIMA = 280;

/**
 * Cartao translucido do mockup. A cor ja e um branco-creme com alpha, entao a
 * ilustracao verde por tras aparece atenuada — sem precisar de blur real.
 *
 * Se um dia quisermos o desfoque de verdade, e so trocar a View por
 * <BlurView intensity={30} tint="light"> do expo-blur, mantendo o resto igual.
 */
export function GlassCard({ children, style }: Props) {
  const { width: larguraTela } = useWindowDimensions();

  // Mais estreito e centralizado, como no mockup. Continua limitado por
  // cardMaxWidth para nao virar uma faixa larguissima em tablet.
  const larguraMaxima = Math.min(
    sizes.cardMaxWidth,
    Math.max(larguraTela * FRACAO_DA_TELA, LARGURA_MINIMA),
  );

  return <View style={[styles.card, { maxWidth: larguraMaxima }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: colors.cardFill,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
    // Um pouco menos que o xl: com o card estreito, 24 de cada lado
    // espremia os campos. O mockup tem ~20.
    paddingHorizontal: 20,
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
