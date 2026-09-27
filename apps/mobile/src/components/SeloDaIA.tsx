import { StyleSheet, Text } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme';

/**
 * A pilula "da foto", ao lado do rotulo de um campo preenchido pela leitura.
 *
 * O QUE ELE SIGNIFICA: este valor foi escrito pela maquina e AINDA NAO FOI
 * CONFERIDO por gente. Some no primeiro toque no campo, porque editar e o ato
 * de conferir.
 *
 * Existe porque o modelo corrige grafia em silencio, e isso foi reproduzido
 * contra a API. Sem a marcacao, os campos chegariam no formulario parecendo
 * digitados pela propria pessoa, e ninguem confere o que acha que escreveu.
 *
 * Escondido do leitor de tela: o rotulo do campo ja anuncia o aviso por
 * extenso, e uma pilula solta anunciada como "da foto" no meio de um
 * formulario nao ajuda ninguem.
 */
export function SeloDaIA() {
  return (
    <Text style={styles.selo} importantForAccessibility="no-hide-descendants">
      da foto
    </Text>
  );
}

const styles = StyleSheet.create({
  selo: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.accent,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginLeft: spacing.sm,
    overflow: 'hidden',
  },
});
