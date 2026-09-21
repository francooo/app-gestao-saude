import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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

/**
 * Quantos chips aparecem antes do "Ver mais".
 *
 * Contando "Todas", sao 4 visiveis — o mesmo do mockup, que mostra
 * Pediatria, Clinica geral, Dermatologia e Nutricao antes do "Ver mais".
 */
const VISIVEIS = 4;

export function FilterChips({ chips, selected, onSelect }: Props) {
  const [expandido, setExpandido] = useState(false);

  if (chips.length <= 1) return null;

  // O "Ver mais" so faz sentido quando ha algo escondido atras dele.
  const cabemTodos = chips.length <= VISIVEIS;
  const mostrar = expandido || cabemTodos ? chips : chips.slice(0, VISIVEIS);
  const escondidos = chips.length - mostrar.length;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.lista}
    >
      {mostrar.map((chip) => {
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

      {escondidos > 0 ? (
        <Pressable
          onPress={() => setExpandido(true)}
          accessibilityRole="button"
          accessibilityLabel={`Ver mais ${escondidos} especialidades`}
          style={[styles.chip, styles.chipMais]}
        >
          <Text style={styles.textoMais}>Ver mais</Text>
          <Feather name="chevron-right" size={16} color={colors.accentGreen} />
        </Pressable>
      ) : null}

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
  chipMais: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.chipMore,
    paddingRight: spacing.lg,
  },
  texto: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.sectionTitle,
  },
  textoAtivo: {
    color: colors.onAccent,
  },
  textoMais: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.accentGreen,
  },
  fim: { width: spacing.sm },
});
