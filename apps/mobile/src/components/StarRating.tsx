import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/theme';

type Props = {
  /** 1 a 5, ou null quando ainda nao avaliado. */
  value: number | null;
  /** Sem onChange o componente e so leitura. */
  onChange?: (value: number) => void;
  size?: number;
  /** Texto ao lado, ex.: "Sua nota". */
  label?: string;
};

const ESTRELAS = [1, 2, 3, 4, 5];

/**
 * Nota PRIVADA do usuario sobre um profissional.
 *
 * Nao existe media entre contas: o valor mora em `professionals`, que ja e
 * escopado por user_id. O mockup mostrava "4,7 (128 avaliacoes)", de um
 * catalogo publico — aqui e so a sua impressao, que ninguem mais ve.
 */
export function StarRating({ value, onChange, size = 18, label }: Props) {
  const editavel = Boolean(onChange);

  return (
    <View style={styles.linha}>
      {ESTRELAS.map((n) => {
        const cheia = value !== null && n <= value;
        const estrela = (
          <Feather
            name="star"
            size={size}
            color={cheia ? colors.star : colors.starEmpty}
            style={styles.estrela}
          />
        );

        if (!editavel) return <View key={n}>{estrela}</View>;

        return (
          <Pressable
            key={n}
            onPress={() => onChange?.(n)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Dar nota ${n} de 5`}
            accessibilityState={{ selected: cheia }}
          >
            {estrela}
          </Pressable>
        );
      })}

      <Text style={styles.texto}>
        {value === null ? (label ?? 'Sem nota') : `${value},0`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  estrela: {
    marginRight: 2,
  },
  texto: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
});
