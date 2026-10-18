import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { colors, radii, sizes, typography } from '@/theme';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /**
   * Cor do botao. Padrao ambar (acao principal). "terracota" e o Salvar do
   * diario de sintomas, que o pacote final desenha nessa cor.
   */
  tom?: 'ambar' | 'terracota';
};

export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
  tom = 'ambar',
}: Props) {
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        tom === 'terracota' && styles.terracota,
        pressed && !inactive ? (tom === 'terracota' ? styles.terracotaPressed : styles.pressed) : null,
        inactive ? styles.inactive : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={styles.label}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: sizes.buttonHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5C4318',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  pressed: {
    backgroundColor: colors.accentPressed,
  },
  terracota: { backgroundColor: colors.terracotta, shadowColor: '#6B3A24' },
  terracotaPressed: { opacity: 0.85 },
  inactive: {
    opacity: 0.65,
  },
  label: {
    ...typography.button,
    color: colors.onAccent,
  },
});
