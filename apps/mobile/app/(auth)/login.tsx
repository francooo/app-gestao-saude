import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loginRequestSchema, messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { GlassCard } from '@/components/GlassCard';
import { IllustrationRegion } from '@/components/IllustrationRegion';
import { PillInput, type PillInputHandle } from '@/components/PillInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, fonts, spacing, typography } from '@/theme';

type FieldErrors = { email?: string; password?: string };

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn } = useAuth();
  const { height } = useWindowDimensions();

  // Em telas baixas o card precisa encolher, senao ele empurra a ilustracao
  // a ponto de cortar o rosto da mae.
  const compact = height < 720;

  const passwordRef = useRef<PillInputHandle>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;

    setFormError(null);

    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' && !next.email) next.email = issue.message;
        if (field === 'password' && !next.password) next.password = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      await signIn(parsed.data);
      // A navegacao acontece sozinha: o guard de (auth) redireciona assim que
      // o usuario entra no contexto.
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'NETWORK_ERROR') {
        setFormError('Sem conexão com o servidor. Verifique sua internet.');
      } else if (error instanceof ApiRequestError) {
        setFormError(messageForError(error.code));
      } else {
        setFormError(messageForError(undefined));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // No Android o softwareKeyboardLayoutMode: 'resize' do app.config ja
      // cuida disso; somar o KeyboardAvoidingView deslocaria em dobro.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.screen}>
          <View
            style={[
              styles.cardArea,
              { paddingTop: insets.top + (compact ? spacing.sm : spacing.lg) },
            ]}
          >
            <GlassCard style={compact ? styles.cardCompact : undefined}>
              <Text style={styles.title} accessibilityRole="header">
                Bem-vinda
              </Text>

              <PillInput
                label="Usuário"
                icon="user"
                value={email}
                onChangeText={setEmail}
                placeholder="Digite seu usuário"
                error={fieldErrors.email}
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="username"
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                accessibilityLabel="Usuário"
                editable={!submitting}
              />

              <PillInput
                ref={passwordRef}
                label="Senha"
                icon="lock"
                secure
                value={password}
                onChangeText={setPassword}
                placeholder="Digite sua senha"
                error={fieldErrors.password}
                autoCapitalize="none"
                textContentType="password"
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                accessibilityLabel="Senha"
                editable={!submitting}
              />

              <Pressable
                onPress={() => router.push('/esqueci-senha')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 20 }}
                accessibilityRole="link"
                style={styles.linkWrapper}
              >
                <Text style={styles.link}>Esqueci minha senha</Text>
              </Pressable>

              {formError ? (
                <Text style={styles.formError} accessibilityLiveRegion="polite">
                  {formError}
                </Text>
              ) : null}

              <PrimaryButton
                title="Entrar"
                onPress={handleSubmit}
                loading={submitting}
                style={styles.button}
              />

              <Pressable
                onPress={() => router.push('/cadastro')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="link"
                style={styles.criarConta}
              >
                <Text style={styles.criarContaTexto}>
                  Ainda não tem conta? <Text style={styles.criarContaDestaque}>Criar conta</Text>
                </Text>
              </Pressable>
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
  // flexGrow (e nao flex) para preencher quando sobra espaco e rolar quando o
  // teclado rouba altura — e o que salva a tela em aparelhos pequenos.
  scroll: { flexGrow: 1 },
  screen: {
    flex: 1,
    backgroundColor: colors.sage,
  },
  cardArea: {
    paddingHorizontal: spacing.xl,
  },
  cardCompact: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  linkWrapper: {
    alignSelf: 'flex-end',
    marginTop: -spacing.sm,
  },
  link: {
    ...typography.link,
    color: colors.link,
    textDecorationLine: 'underline',
  },
  formError: {
    ...typography.error,
    color: colors.textError,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  button: {
    marginTop: spacing.xl,
  },
  criarConta: { alignSelf: 'center', marginTop: spacing.lg },
  criarContaTexto: {
    // Peso normal na frase, negrito so no "Criar conta" — o destaque tem que
    // recair sobre a acao, nao sobre a pergunta.
    fontFamily: fonts.regular,
    fontSize: typography.link.fontSize,
    color: colors.textSecondary,
  },
  criarContaDestaque: {
    ...typography.link,
    color: colors.link,
    textDecorationLine: 'underline',
  },
});
