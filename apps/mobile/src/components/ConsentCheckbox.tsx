import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

type Props = {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
  error?: string;
  disabled?: boolean;
};

/**
 * Aceite do consentimento LGPD.
 *
 * Nasce SEMPRE desmarcado, e o toque na linha inteira alterna o estado — a lei
 * pede manifestacao ativa, entao nao existe versao pre-marcada disto.
 */
export function ConsentCheckbox({ checked, onChange, children, error, disabled }: Props) {
  return (
    <View>
      <Pressable
        onPress={() => onChange(!checked)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        hitSlop={8}
        style={styles.row}
      >
        <View style={[styles.box, checked && styles.boxChecked, error && styles.boxError]}>
          {checked ? <Feather name="check" size={15} color={colors.onAccent} /> : null}
        </View>
        <Text style={styles.label}>{children}</Text>
      </Pressable>

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    backgroundColor: colors.inputFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    // Alinha o quadrado com a primeira linha do texto, e nao com o bloco todo.
    marginTop: 2,
  },
  boxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  boxError: {
    borderColor: colors.inputBorderError,
  },
  label: {
    flex: 1,
    ...typography.error,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  error: {
    ...typography.error,
    color: colors.textError,
    marginTop: spacing.xs,
  },
});
