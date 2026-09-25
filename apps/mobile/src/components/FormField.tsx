import { Feather } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, radii, sizes, spacing } from '@/theme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  /** Texto de apoio abaixo do campo, quando nao ha erro. */
  hint?: string;
  /** Indicador a direita, usado na busca de CEP. */
  loading?: boolean;
  /**
   * Campo de senha, com o olho de mostrar e ocultar.
   *
   * O unico campo de senha que existia era o PillInput das telas de
   * autenticacao, com o visual translucido que ficaria errado sobre creme.
   */
  secure?: boolean;
  containerStyle?: ViewStyle;
};

export type FormFieldHandle = TextInput;

/**
 * Campo de formulario da area logada.
 *
 * Difere do PillInput das telas de autenticacao: aqui o fundo e creme solido
 * e o campo e retangular arredondado, nao pilula — formularios longos ficam
 * mais legiveis assim, e sem icone sobrando em cada linha.
 */
export const FormField = forwardRef<TextInput, Props>(function FormField(
  { label, error, hint, loading, secure, containerStyle, multiline, ...inputProps },
  ref,
) {
  const [oculto, setOculto] = useState(true);

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.campo, multiline && styles.campoMultiline, error && styles.campoErro]}>
        <TextInput
          ref={ref}
          style={[styles.input, multiline && styles.inputMultiline]}
          placeholderTextColor={colors.textPlaceholder}
          multiline={multiline}
          secureTextEntry={secure ? oculto : undefined}
          {...inputProps}
        />
        {loading ? <ActivityIndicator size="small" color={colors.accentGreen} /> : null}
        {secure ? (
          <Pressable
            onPress={() => setOculto((v) => !v)}
            // O icone tem 20; o hitSlop leva o alvo de toque aos 44 minimos.
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={oculto ? 'Mostrar senha' : 'Ocultar senha'}
          >
            <Feather
              name={oculto ? 'eye' : 'eye-off'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.erro} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  label: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.sectionTitle,
    marginBottom: spacing.sm,
  },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.inputHeight,
    borderRadius: radii.card - 10,
    borderWidth: 1,
    borderColor: 'rgba(57, 67, 44, 0.12)',
    backgroundColor: colors.onAccent,
    paddingHorizontal: spacing.lg,
  },
  campoMultiline: {
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    minHeight: 96,
  },
  campoErro: {
    borderColor: colors.inputBorderError,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  inputMultiline: {
    textAlignVertical: 'top',
    minHeight: 72,
  },
  erro: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textError,
    marginTop: spacing.xs,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
