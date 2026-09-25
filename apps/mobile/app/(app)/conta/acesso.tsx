import { Feather } from '@expo/vector-icons';
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

import { API_ERROR, messageForError } from '@gestao/shared';

import { ApiRequestError, authApi } from '@/api/client';
import { contaApi } from '@/api/conta';
import { useAuth } from '@/auth/AuthContext';
import { FormField } from '@/components/FormField';
import { IconTile } from '@/components/IconTile';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { backgrounds, colors, fonts, spacing } from '@/theme';

const AMBAR = { fundo: colors.tileSun, traco: colors.surface } as const;

export default function AcessoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.settings} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.conteudo,
            { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="E-mail e senha" titleLines={2} onBack={() => router.back()} />

          <BlocoDeEmail emailAtual={user?.email ?? '—'} />
          <BlocoDeSenha emailAtual={user?.email ?? ''} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function BlocoDeEmail({ emailAtual }: { emailAtual: string }) {
  const [novo, setNovo] = useState('');
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState<{ novo?: string; senha?: string; geral?: string }>({});
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<string | null>(null);

  async function enviar() {
    const alvo = novo.trim().toLowerCase();
    const novosErros: typeof erros = {};

    if (!alvo) novosErros.novo = 'Informe o novo e-mail';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alvo)) novosErros.novo = 'Informe um e-mail válido';
    else if (alvo === emailAtual.toLowerCase()) novosErros.novo = 'Este já é o seu e-mail';
    if (!senha) novosErros.senha = 'Informe sua senha atual';

    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setEnviando(true);
    try {
      await contaApi.pedirTrocaDeEmail({ currentPassword: senha, newEmail: alvo });
      setPedido(alvo);
    } catch (e) {
      const codigo = e instanceof ApiRequestError ? e.code : undefined;
      // Senha errada tem campo proprio; o resto vira aviso geral.
      if (codigo === API_ERROR.WRONG_PASSWORD) {
        setErros({ senha: 'Senha incorreta' });
        setSenha('');
      } else {
        setErros({ geral: messageForError(codigo) });
      }
    } finally {
      setEnviando(false);
    }
  }

  if (pedido) {
    return (
      <View style={styles.secao}>
        <SectionHeader title="E-mail" />
        <SurfaceCard style={styles.cartao}>
          <View style={styles.linhaIcone}>
            <IconTile icone="mail" {...AMBAR} />
            <View style={styles.linhaTextos}>
              <Text style={styles.titulo}>Confirme no seu e-mail</Text>
              <Text style={styles.ajuda}>
                Enviamos um link para <Text style={styles.destaque}>{pedido}</Text>. O endereço só
                muda depois que você abrir o link — até lá, o atual continua valendo.
              </Text>
            </View>
          </View>
        </SurfaceCard>
      </View>
    );
  }

  return (
    <View style={styles.secao}>
      <SectionHeader title="E-mail" />
      <SurfaceCard style={styles.cartao}>
        <Text style={styles.rotuloPequeno}>E-MAIL ATUAL</Text>
        {/* Corta no MEIO: o dominio e o que identifica a conta, e cortar o fim
            esconderia justamente ele. */}
        <Text style={styles.emailAtual} numberOfLines={1} ellipsizeMode="middle">
          {emailAtual}
        </Text>

        <View style={styles.divisor} />

        <FormField
          label="Novo e-mail"
          value={novo}
          onChangeText={setNovo}
          placeholder="nome@exemplo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          error={erros.novo}
          editable={!enviando}
        />
        <FormField
          label="Senha atual"
          value={senha}
          onChangeText={setSenha}
          secure
          autoComplete="current-password"
          textContentType="password"
          error={erros.senha}
          editable={!enviando}
        />

        <Text style={styles.ajuda}>
          Vamos mandar um link para o endereço novo. Ele só passa a valer quando você abrir esse
          link — assim um endereço digitado errado não tranca sua conta.
        </Text>

        {erros.geral ? (
          <Text style={styles.erroGeral} accessibilityLiveRegion="polite">
            {erros.geral}
          </Text>
        ) : null}

        <PrimaryButton title="Alterar e-mail" onPress={() => void enviar()} loading={enviando} />
      </SurfaceCard>
    </View>
  );
}

function BlocoDeSenha({ emailAtual }: { emailAtual: string }) {
  const router = useRouter();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repete, setRepete] = useState('');
  const [erros, setErros] = useState<{
    atual?: string;
    nova?: string;
    repete?: string;
    geral?: string;
  }>({});
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [linkEnviado, setLinkEnviado] = useState(false);

  async function enviar() {
    const novosErros: typeof erros = {};
    if (!atual) novosErros.atual = 'Informe sua senha atual';
    if (nova.length < 8) novosErros.nova = 'A senha deve ter ao menos 8 caracteres';
    else if (nova.length > 72) novosErros.nova = 'A senha deve ter no máximo 72 caracteres';
    else if (nova === atual) novosErros.nova = 'A nova senha precisa ser diferente da atual';
    if (repete !== nova) novosErros.repete = 'As senhas não são iguais';

    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setEnviando(true);
    try {
      await contaApi.trocarSenha({ currentPassword: atual, newPassword: nova });
      setPronto(true);
    } catch (e) {
      const codigo = e instanceof ApiRequestError ? e.code : undefined;
      if (codigo === API_ERROR.WRONG_PASSWORD) {
        setErros({ atual: 'Senha incorreta' });
        setAtual('');
      } else {
        setErros({ geral: messageForError(codigo) });
      }
    } finally {
      setEnviando(false);
    }
  }

  /**
   * "Esqueci minha senha atual" NAO navega para /esqueci-senha.
   *
   * Aquela rota vive em (auth), cujo layout rebate quem esta logado de volta
   * para o Inicio — e e justamente logado que a pessoa esta aqui. Entao
   * pedimos o link direto, e o e-mail leva para /redefinir-senha, que e rota
   * de raiz e funciona logado.
   */
  async function pedirLink() {
    if (!emailAtual) return;
    try {
      await authApi.forgotPassword({ email: emailAtual });
    } catch {
      // A resposta e sempre 200 de qualquer forma; falha aqui e de rede.
    }
    setLinkEnviado(true);
  }

  if (pronto) {
    return (
      <View style={styles.secao}>
        <SectionHeader title="Senha" />
        <SurfaceCard style={styles.cartao}>
          <View style={styles.linhaIcone}>
            <IconTile icone="check-circle" fundo={colors.pillTablet} traco={colors.doseTaken} />
            <View style={styles.linhaTextos}>
              <Text style={styles.titulo}>Senha alterada</Text>
              <Text style={styles.ajuda}>
                Você continua conectado neste aparelho. Os outros aparelhos foram desconectados.
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={styles.textoPuro}
          >
            <Text style={styles.textoPuroRotulo}>Voltar aos ajustes</Text>
          </Pressable>
        </SurfaceCard>
      </View>
    );
  }

  return (
    <View style={styles.secao}>
      <SectionHeader title="Senha" />
      <SurfaceCard style={styles.cartao}>
        <FormField
          label="Senha atual"
          value={atual}
          onChangeText={setAtual}
          secure
          autoComplete="current-password"
          textContentType="password"
          error={erros.atual}
          editable={!enviando}
        />
        <FormField
          label="Nova senha"
          value={nova}
          onChangeText={setNova}
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          hint="Ao menos 8 caracteres"
          error={erros.nova}
          editable={!enviando}
        />
        <FormField
          label="Repita a nova senha"
          value={repete}
          onChangeText={setRepete}
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          error={erros.repete}
          editable={!enviando}
        />

        {erros.geral ? (
          <Text style={styles.erroGeral} accessibilityLiveRegion="polite">
            {erros.geral}
          </Text>
        ) : null}

        <PrimaryButton title="Alterar senha" onPress={() => void enviar()} loading={enviando} />

        <Pressable
          onPress={() => void pedirLink()}
          disabled={linkEnviado}
          accessibilityRole="button"
          style={styles.textoPuro}
        >
          <Text style={[styles.textoPuroRotulo, linkEnviado && styles.apagado]}>
            {linkEnviado
              ? `Link enviado para ${emailAtual}`
              : 'Esqueci minha senha atual'}
          </Text>
        </Pressable>
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.settings[0] },
  flex: { flex: 1 },
  conteudo: { paddingHorizontal: spacing.xl },
  secao: { marginTop: spacing.xl },
  cartao: { marginTop: spacing.md },

  rotuloPequeno: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  emailAtual: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.sectionTitle,
    marginTop: spacing.xs,
  },
  divisor: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginVertical: spacing.xl,
  },

  linhaIcone: { flexDirection: 'row', alignItems: 'flex-start' },
  linhaTextos: { flex: 1, marginLeft: spacing.md },
  titulo: { fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  destaque: { fontFamily: fonts.bold, color: colors.sectionTitle },
  ajuda: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  erroGeral: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textError,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  textoPuro: { alignItems: 'center', paddingVertical: spacing.lg },
  textoPuroRotulo: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen },
  apagado: { opacity: 0.55 },
});
