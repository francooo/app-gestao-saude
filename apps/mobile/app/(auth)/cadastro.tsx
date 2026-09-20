import { Feather } from '@expo/vector-icons';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError, registerRequestSchema } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { ConsentCheckbox } from '@/components/ConsentCheckbox';
import { GlassCard } from '@/components/GlassCard';
import { IllustrationRegion } from '@/components/IllustrationRegion';
import { PillInput, type PillInputHandle } from '@/components/PillInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, sizes, spacing, typography } from '@/theme';

type Campo = 'fullName' | 'email' | 'password' | 'passwordConfirmation' | 'acceptedPolicy';
type ErrosPorCampo = Partial<Record<Campo, string>>;

export default function CadastroScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp } = useAuth();

  const emailRef = useRef<PillInputHandle>(null);
  const senhaRef = useRef<PillInputHandle>(null);
  const confirmacaoRef = useRef<PillInputHandle>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);

  const [erros, setErros] = useState<ErrosPorCampo>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit() {
    if (enviando) return;
    setErroGeral(null);

    const parsed = registerRequestSchema.safeParse({
      fullName,
      email,
      password,
      passwordConfirmation,
      acceptedPolicy,
    });

    if (!parsed.success) {
      const proximos: ErrosPorCampo = {};
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0] as Campo | undefined;
        if (campo && !proximos[campo]) proximos[campo] = issue.message;
      }
      setErros(proximos);
      return;
    }

    setErros({});
    setEnviando(true);
    try {
      await signUp(parsed.data);
      // O guard de (auth) redireciona sozinho assim que o usuario entra no
      // contexto — o cadastro ja devolve a sessao.
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'NETWORK_ERROR') {
        setErroGeral('Sem conexão com o servidor. Verifique sua internet.');
      } else if (error instanceof ApiRequestError && error.code === 'EMAIL_ALREADY_REGISTERED') {
        setErros({ email: 'Já existe uma conta com este e-mail' });
      } else if (error instanceof ApiRequestError) {
        setErroGeral(messageForError(error.code));
      } else {
        setErroGeral(messageForError(undefined));
      }
    } finally {
      setEnviando(false);
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
          <View style={[styles.cardArea, { paddingTop: insets.top + spacing.md }]}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Voltar para o login"
              style={styles.back}
            >
              <Feather name="arrow-left" size={sizes.iconSize + 2} color={colors.textPrimary} />
              <Text style={styles.backLabel}>Voltar</Text>
            </Pressable>

            <GlassCard>
              <Text style={styles.title} accessibilityRole="header">
                Criar conta
              </Text>

              <PillInput
                label="Nome completo"
                icon="user"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Como você se chama"
                error={erros.fullName}
                autoCapitalize="words"
                textContentType="name"
                autoComplete="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!enviando}
              />

              <PillInput
                ref={emailRef}
                label="Usuário"
                icon="mail"
                value={email}
                onChangeText={setEmail}
                placeholder="Seu melhor e-mail"
                error={erros.email}
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="username"
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => senhaRef.current?.focus()}
                editable={!enviando}
              />

              <PillInput
                ref={senhaRef}
                label="Senha"
                icon="lock"
                secure
                value={password}
                onChangeText={setPassword}
                placeholder="Ao menos 8 caracteres"
                error={erros.password}
                autoCapitalize="none"
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="next"
                onSubmitEditing={() => confirmacaoRef.current?.focus()}
                editable={!enviando}
              />

              <PillInput
                ref={confirmacaoRef}
                label="Confirmar senha"
                icon="lock"
                secure
                value={passwordConfirmation}
                onChangeText={setPasswordConfirmation}
                placeholder="Digite a senha de novo"
                error={erros.passwordConfirmation}
                autoCapitalize="none"
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
                editable={!enviando}
                containerStyle={styles.ultimoCampo}
              />

              <ConsentCheckbox
                checked={acceptedPolicy}
                onChange={setAcceptedPolicy}
                error={erros.acceptedPolicy}
                disabled={enviando}
              >
                Li e aceito a política de privacidade, e autorizo o tratamento dos meus dados de
                saúde para acompanhamento no aplicativo.
              </ConsentCheckbox>

              {erroGeral ? (
                <Text style={styles.erroGeral} accessibilityLiveRegion="polite">
                  {erroGeral}
                </Text>
              ) : null}

              <PrimaryButton
                title="Criar conta"
                onPress={handleSubmit}
                loading={enviando}
                style={styles.botao}
              />

              <Pressable
                onPress={() => router.replace('/login')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="link"
                style={styles.jaTenhoConta}
              >
                <Text style={styles.jaTenhoContaTexto}>Já tenho conta. Entrar</Text>
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
  scroll: { flexGrow: 1 },
  screen: { flex: 1, backgroundColor: colors.sage },
  cardArea: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  backLabel: {
    ...typography.link,
    color: colors.textPrimary,
    marginLeft: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  // O checkbox do consentimento ja tem respiro proprio acima.
  ultimoCampo: { marginBottom: spacing.sm },
  erroGeral: {
    ...typography.error,
    color: colors.textError,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  botao: { marginTop: spacing.xl },
  jaTenhoConta: { alignSelf: 'center', marginTop: spacing.lg },
  jaTenhoContaTexto: {
    ...typography.link,
    color: colors.link,
    textDecorationLine: 'underline',
  },
});
