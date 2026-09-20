import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { forgotPasswordRequestSchema, messageForError } from '@gestao/shared';

import { ApiRequestError, authApi } from '@/api/client';
import { GlassCard } from '@/components/GlassCard';
import { IllustrationRegion } from '@/components/IllustrationRegion';
import { PillInput } from '@/components/PillInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, spacing, typography } from '@/theme';

export default function EsqueciSenhaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setFormError(null);

    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'E-mail inválido');
      return;
    }

    setFieldError(undefined);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(parsed.data);
      // A API responde 200 mesmo se a conta nao existir — nao revelamos quais
      // e-mails estao cadastrados. A tela de sucesso e sempre a mesma.
      setSent(true);
    } catch (error) {
      setFormError(messageForError(error instanceof ApiRequestError ? error.code : undefined));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.screen}>
          <View style={[styles.cardArea, { paddingTop: insets.top + spacing.lg }]}>
            <GlassCard>
              {sent ? (
                <>
                  <Text style={styles.title} accessibilityRole="header">
                    Confira seu e-mail
                  </Text>
                  <Text style={styles.body}>
                    Se houver uma conta com esse e-mail, enviamos um link para criar uma nova
                    senha. O link vale por 30 minutos.
                  </Text>
                  <PrimaryButton
                    title="Voltar ao login"
                    onPress={() => router.replace('/login')}
                    style={styles.button}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.title} accessibilityRole="header">
                    Esqueci minha senha
                  </Text>
                  <Text style={styles.body}>
                    Informe seu e-mail para receber o link de redefinição.
                  </Text>

                  <PillInput
                    label="E-mail"
                    icon="mail"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Digite seu e-mail"
                    error={fieldError}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="username"
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit}
                    accessibilityLabel="E-mail da conta"
                    editable={!submitting}
                    containerStyle={styles.input}
                  />

                  {formError ? (
                    <Text style={styles.formError} accessibilityLiveRegion="polite">
                      {formError}
                    </Text>
                  ) : null}

                  <PrimaryButton
                    title="Enviar link de redefinição"
                    onPress={handleSubmit}
                    loading={submitting}
                    style={styles.button}
                  />

                  <Pressable
                    onPress={() => router.replace('/login')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="link"
                    style={styles.voltar}
                  >
                    <Text style={styles.voltarTexto}>Voltar para o login</Text>
                  </Pressable>
                </>
              )}
            </GlassCard>
          </View>

          <IllustrationRegion />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  screen: { flex: 1, backgroundColor: colors.sage },
  cardArea: { paddingHorizontal: spacing.xl },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    ...typography.subtitle,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  input: { marginBottom: 0 },
  formError: {
    ...typography.error,
    color: colors.textError,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  button: { marginTop: spacing.xl },
  voltar: { alignSelf: 'center', marginTop: spacing.lg },
  voltarTexto: {
    ...typography.link,
    color: colors.link,
    textDecorationLine: 'underline',
  },
});
