import { StyleSheet, Text, View } from 'react-native';

import type { Permissao } from '@/api/acompanhantes';
import { Icone, ICONES, type NomeIcone } from '@/components/Icone';
import { colors, fonts, radii, spacing } from '@/theme';

/**
 * A bolha de previa de uma mensagem de WhatsApp.
 *
 * Componente proprio porque as duas telas de acompanhante mostram uma — o
 * convite no cadastro, o lembrete de dose nos ajustes — e as duas precisam
 * parecer a mesma conversa.
 */
export function PreviaDeMensagem({ texto }: { texto: string }) {
  return (
    <View style={styles.linha} accessible accessibilityLabel={`Prévia da mensagem: ${texto}`}>
      <View style={styles.icone}>
        <Icone nome="mci:dots-horizontal" size={22} color={colors.surface} />
      </View>
      <View style={styles.bolha}>
        <Text style={styles.texto}>{texto}</Text>
      </View>
    </View>
  );
}

/** Icone de cada permissao, na ordem do mockup — o mesmo nas duas telas. */
export const ICONE_DO_AVISO: Record<Permissao, NomeIcone> = {
  notifyDose: 'clock',
  notifyLate: ICONES.pilula,
  notifyLowStock: 'alert-triangle',
  notifyTaken: 'check-circle',
};

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.pillTabletIcon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bolha: {
    flex: 1,
    backgroundColor: colors.assistantBubble,
    borderRadius: radii.card - 8,
    // O canto achatado do lado do icone e o "rabinho" da bolha de conversa.
    borderTopLeftRadius: 4,
    padding: spacing.md,
  },
  texto: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.sectionTitle },
});
