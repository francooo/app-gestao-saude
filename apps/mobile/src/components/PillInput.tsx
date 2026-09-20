import { Feather } from '@expo/vector-icons';
import { forwardRef, useState, type ComponentRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, radii, sizes, spacing, typography } from '@/theme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  /** Exibe o olho de mostrar/ocultar e comeca com o texto escondido. */
  secure?: boolean;
  /** Mensagem de validacao exibida abaixo do campo. */
  error?: string;
  containerStyle?: ViewStyle;
};

/**
 * A partir do React Native 0.87 o TextInput nao e mais uma classe, entao o
 * tipo da instancia nao e mais `TextInput`. ComponentRef extrai o tipo certo
 * sem depender do interno _TextInputInstance.
 */
export type PillInputHandle = ComponentRef<typeof TextInput>;

/**
 * Campo em formato de pilula com icone a esquerda, como no mockup.
 * Usa forwardRef para a tela encadear o foco do usuario para a senha.
 */
export const PillInput = forwardRef<PillInputHandle, Props>(function PillInput(
  { label, icon, secure = false, error, containerStyle, onFocus, onBlur, ...inputProps },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secure);

  const borderColor = error
    ? colors.inputBorderError
    : focused
      ? colors.inputBorderFocused
      : colors.inputBorder;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.field, { borderColor }]}>
        <Feather
          name={icon}
          size={sizes.iconSize}
          color={colors.textSecondary}
          style={styles.icon}
        />

        <TextInput
          ref={ref}
          style={styles.input}
          placeholderTextColor={colors.textPlaceholder}
          secureTextEntry={hidden}
          // No Android, o teclado seguro desativa o autocorretor de qualquer
          // forma; explicitar evita sugestoes vazando na barra do teclado.
          autoCorrect={false}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...inputProps}
        />

        {secure ? (
          <Pressable
            onPress={() => setHidden((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar senha' : 'Ocultar senha'}
            style={styles.eye}
          >
            <Feather
              name={hidden ? 'eye' : 'eye-off'}
              size={sizes.iconSize - 2}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: sizes.inputHeight,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: colors.inputFill,
    paddingHorizontal: spacing.lg,
  },
  icon: {
    marginRight: spacing.md,
  },
  input: {
    flex: 1,
    height: '100%',
    ...typography.input,
    color: colors.textPrimary,
    // Remove o padding vertical que o Android aplica por padrao e que
    // desalinha o texto dentro da pilula.
    paddingVertical: 0,
  },
  eye: {
    paddingLeft: spacing.sm,
  },
  error: {
    ...typography.error,
    color: colors.textError,
    marginTop: spacing.xs,
    marginLeft: spacing.lg,
  },
});
