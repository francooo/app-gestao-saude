import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, spacing } from '@/theme';

export type Medication = {
  id: string;
  nome: string;
  /** Ex.: "1 cápsula · 8 em 8 horas" */
  posologia: string;
  /** Ex.: "Última dose há 2h" */
  ultimaDose: string;
  /** Para quem e o medicamento. */
  paraNome: string;
  paraCor?: string;
};

type Props = {
  medicamento: Medication;
  onPress?: () => void;
};

export function MedicationCard({ medicamento, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${medicamento.nome}. ${medicamento.posologia}. ${medicamento.ultimaDose}. Para ${medicamento.paraNome}.`}
      style={({ pressed }) => (pressed && onPress ? styles.pressionado : undefined)}
    >
      <SurfaceCard style={styles.card}>
        <View style={styles.conteudo}>
          <View style={styles.icone}>
            <Feather name="thermometer" size={24} color={colors.accent} />
          </View>

          <View style={styles.textos}>
            <Text style={styles.nome} numberOfLines={1}>
              {medicamento.nome}
            </Text>
            <Text style={styles.posologia} numberOfLines={1}>
              {medicamento.posologia}
            </Text>
            <View style={styles.linhaDose}>
              <Feather name="clock" size={13} color={colors.textSecondary} />
              <Text style={styles.dose} numberOfLines={1}>
                {medicamento.ultimaDose} · {medicamento.paraNome.split(' ')[0]}
              </Text>
            </View>
          </View>

          <Avatar nome={medicamento.paraNome} color={medicamento.paraCor} size={44} />
        </View>
      </SurfaceCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressionado: { opacity: 0.85 },
  card: { padding: spacing.lg },
  conteudo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icone: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  textos: {
    flex: 1,
    marginRight: spacing.md,
  },
  nome: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.sectionTitle,
  },
  posologia: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  linhaDose: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  dose: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
