import { useLocalSearchParams, useRouter } from 'expo-router';
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

import { messageForError, resetPasswordFormSchema } from '@gestao/shared';

import { ApiRequestError, authApi } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { GlassCard } from '@/components/GlassCard';
import { IllustrationRegion } from '@/components/IllustrationRegion';
import { PillInput, type PillInputHandle } from '@/components/PillInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, spacing, typography } from '@/theme';

/**
 * Criacao da nova senha, alcancada pelo link do e-mail:
 *   gestaosaude://redefinir-senha?token=...
 *
 * Fica na RAIZ do app, fora dos grupos (auth) e (app), de proposito. O layout
 * de (auth) redireciona quem esta logado para /inicio — se esta tela vivesse
 * la, quem pedisse a redefinicao no mesmo celular onde ja esta logado seria
 * jogado para a tela inicial e nunca conseguiria trocar a senha.
 */
export default function RedefinirSenhaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const confirmacaoRef = useRef<PillInputHandle>(null);

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [erros, setErros] = useState<{ password?: string; passwordConfirmation?: string }>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  const semToken = !token;

  async function handleSubmit() {
    if (enviando || !token) return;
    setErroGeral(null);

    const parsed = resetPasswordFormSchema.safeParse({ password, passwordConfirmation });
    if (!parsed.success) {
      const proximos: typeof erros = {};
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0];
        if (campo === 'password' && !proximos.password) proximos.password = issue.message;
        if (campo === 'passwordConfirmation' && !proximos.passwordConfirmation) {
          proximos.passwordConfirmation = issue.message;
        }
      }
      setErros(proximos);
      return;
    }

    setErros({});
    setEnviando(true);
    try {
      await authApi.resetPassword({ token, password: parsed.data.password });

      // A API revoga todas as sessoes ao trocar a senha. Limpamos o que estava
      // guardado neste aparelho para o app nao seguir com tokens ja mortos.
      await signOut().catch(() => {});
      setConcluido(true);
    } catch (error) {
      setErroGeral(messageForError(error instanceof ApiRequestError ? error.code : undefined));
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
          <View style={[styles.cardArea, { paddingTop: insets.top + spacing.lg }]}>
            <GlassCard>
              {concluido ? (
                <>
                  <Text style={styles.title} accessibilityRole="header">
                    Senha alterada
                  </Text>
                  <Text style={styles.body}>
                    Sua senha foi trocada e todos os aparelhos conectados foram desconectados.
                    Entre novamente com a nova senha.
                  </Text>
                  <PrimaryButton
                    title="Ir para o login"
                    onPress={() => router.replace('/login')}
                    style={styles.button}
                  />
                </>
              ) : semToken ? (
                <>
                  <Text style={styles.title} accessibilityRole="header">
                    Link inválido
                  </Text>
                  <Text style={styles.body}>
                    Este link de recuperação está incompleto. Peça um novo na tela de login.
                  </Text>
                  <PrimaryButton
                    title="Pedir novo link"
                    onPress={() => router.replace('/esqueci-senha')}
                    style={styles.button}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.title} accessibilityRole="header">
                    Criar nova senha
                  </Text>
                  <Text style={styles.body}>
                    Escolha uma senha nova para a sua conta.
                  </Text>

                  <PillInput
                    label="Nova senha"
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
                    label="Confirmar nova senha"
                    icon="lock"
                    secure
                    value={passwordConfirmation}
                    onChangeText={setPasswordConfirmation}
                    placeholder="Repita a nova senha"
                    error={erros.passwordConfirmation}
                    autoCapitalize="none"
                    textContentType="newPassword"
                    autoComplete="new-password"
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit}
                    editable={!enviando}
                    containerStyle={styles.ultimoCampo}
                  />

                  {erroGeral ? (
                    <Text style={styles.erroGeral} accessibilityLiveRegion="polite">
                      {erroGeral}
                    </Text>
                  ) : null}

                  <PrimaryButton
                    title="Salvar nova senha"
                    onPress={handleSubmit}
                    loading={enviando}
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
  ultimoCampo: { marginBottom: 0 },
  erroGeral: {
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
