import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme';

/**
 * A pilula "Assinatura" com cadeado, nos cartoes de IA da tela inicial.
 *
 * Pequena de proposito: o cartao continua sendo o convite para o recurso, e o
 * selo so avisa, ANTES do toque, que ele leva a tela de assinatura e nao a
 * camera. Sem ele a pessoa tocaria esperando a camera e cairia numa tela de
 * plano — parece pegadinha.
 *
 * Creme opaco com texto verde, como os chips do CartaoLerReceita: o branco
 * translucido some sobre a metade ambar do degrade.
 *
 * Escondido do leitor de tela: o rotulo do cartao ja diz "faz parte da
 * assinatura" por extenso.
 */
export function SeloDeAssinatura({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.selo, style]} importantForAccessibility="no-hide-descendants">
      <Feather name="lock" size={12} color={colors.accentGreen} />
      <Text style={styles.texto}>Assinatura</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  selo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  texto: { fontFamily: fonts.bold, fontSize: 11, color: colors.accentGreen },
});
