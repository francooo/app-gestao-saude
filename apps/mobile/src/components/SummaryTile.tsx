import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  icone: keyof typeof Feather.glyphMap;
  /** Cor do ladrilho. Ambar para "Hoje", oliva para "Proxima dose". */
  corDoLadrilho: string;
  rotulo: string;
  /** O numero grande: "2 doses", "14:00". */
  valor: string;
  detalhe: string;
};

/** Um dos dois cards de resumo do topo da tela de Remedios. */
export function SummaryTile({ icone, corDoLadrilho, rotulo, valor, detalhe }: Props) {
  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.linha}>
        <View style={[styles.ladrilho, { backgroundColor: corDoLadrilho }]}>
          <Feather name={icone} size={22} color={colors.onAccent} />
        </View>

        <View style={styles.textos}>
          <Text style={styles.rotulo} numberOfLines={1}>
            {rotulo}
          </Text>
          <Text style={styles.valor} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {valor}
          </Text>
          <Text style={styles.detalhe} numberOfLines={1}>
            {detalhe}
          </Text>
        </View>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  // flex: 1 para os dois ficarem com a mesma largura lado a lado.
  card: { flex: 1, padding: spacing.lg },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ladrilho: {
    width: 44,
    height: 44,
    borderRadius: radii.card - 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { flex: 1 },
  rotulo: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  valor: {
    fontFamily: fonts.extrabold,
    fontSize: 21,
    color: colors.sectionTitle,
  },
  detalhe: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
