import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme';

export type Chip = {
  /** null representa "todas". */
  value: string | null;
  label: string;
};

type Props = {
  chips: Chip[];
  selected: string | null;
  onSelect: (value: string | null) => void;
};

export function FilterChips({ chips, selected, onSelect }: Props) {
  if (chips.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.lista}
    >
      {chips.map((chip) => {
        const ativo = chip.value === selected;
        return (
          <Pressable
            key={chip.value ?? '__todas__'}
            onPress={() => onSelect(chip.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: ativo }}
            style={[styles.chip, ativo && styles.chipAtivo]}
          >
            <Text style={[styles.texto, ativo && styles.textoAtivo]} numberOfLines={1}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
      {/* Respiro no fim para o ultimo chip nao colar na borda ao rolar. */}
      <View style={styles.fim} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  lista: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  chipAtivo: {
    backgroundColor: colors.chipActive,
  },
  texto: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.sectionTitle,
  },
  textoAtivo: {
    color: colors.onAccent,
  },
  fim: { width: spacing.sm },
});
