import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_ERROR, messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { contaApi, type Consentimento, type Contagens } from '@/api/conta';
import { useAuth } from '@/auth/AuthContext';
import { ConsentCheckbox } from '@/components/ConsentCheckbox';
import { FormField } from '@/components/FormField';
import { IconTile } from '@/components/IconTile';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SettingsGroup } from '@/components/SettingsGroup';
import { SettingsRow } from '@/components/SettingsRow';
import { SurfaceCard } from '@/components/SurfaceCard';
import { API_URL } from '@/config';
import { backgrounds, colors, fonts, radii, sizes, spacing } from '@/theme';

const TERRACOTA = { fundo: colors.terracotta, traco: colors.surface } as const;

/**
 * A politica completa mora numa PAGINA PUBLICA, nao aqui.
 *
 * Duas razoes. A Play Store exige uma URL publica de politica para publicar, e
 * a API ja serve paginas estaticas — entao a pagina sai de graca, sem gastar
 * nenhuma das doze funcoes. E texto juridico em dois lugares e garantia de que
 * os dois vao divergir; aqui fica o resumo em linguagem direta, que e mais util
 * a uma mae do que tres mil palavras de juridiques.
 */
const URL_POLITICA = `${API_URL.replace(/\/+$/, '')}/privacidade`;

export default function PrivacidadeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();

  const [consentimento, setConsentimento] = useState<Consentimento | null>(null);
  const [contagens, setContagens] = useState<Contagens | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [falhouCarga, setFalhouCarga] = useState(false);
  const [aceitando, setAceitando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await contaApi.perfil(true);
      setConsentimento(r.consent);
      setContagens(r.counts ?? null);
      setFalhouCarga(false);
    } catch {
      setFalhouCarga(true);
    } finally {
      setCarregado(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  async function reaceitar() {
    setAceitando(true);
    try {
      setConsentimento(await contaApi.aceitarPolitica());
    } catch (e) {
      Alert.alert(
        'Não consegui registrar',
        messageForError(e instanceof ApiRequestError ? e.code : undefined),
      );
    } finally {
      setAceitando(false);
    }
  }

  /** Primeira das duas confirmacoes: interrompe e e barata de cancelar. */
  function pedirExclusao() {
    Alert.alert('Apagar a conta?', enunciado(contagens), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Continuar', style: 'destructive', onPress: () => setModalAberto(true) },
    ]);
  }

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.settings} />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Privacidade e segurança" titleLines={2} onBack={() => router.back()} />

        {/*
          A secao inteira some quando a carga falha. Melhor nao ter a secao que
          ter uma secao mentindo sobre uma obrigacao legal.
        */}
        {carregado && !falhouCarga ? (
          <View style={styles.secao}>
            <SectionHeader title="Seu consentimento" />
            <SettingsGroup>
              <SettingsRow
                marcador={<IconTile icone="check-circle" {...TERRACOTA} />}
                rotulo="Consentimento registrado"
                valor={
                  consentimento
                    ? `Versão ${consentimento.policyVersion} · aceito em ${data(consentimento.grantedAt)}`
                    : 'Não encontramos o registro do seu aceite.'
                }
                acessorio="nada"
              />
            </SettingsGroup>

            {!consentimento || !consentimento.atual ? (
              <View style={styles.reaceite}>
                <Text style={styles.reaceiteTexto}>
                  {consentimento
                    ? 'A política mudou desde o seu aceite.'
                    : 'Não há registro do seu aceite nesta conta.'}
                </Text>
                <Pressable
                  onPress={() => void reaceitar()}
                  disabled={aceitando}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.botaoAmbar, pressed && styles.pressionado]}
                >
                  {aceitando ? (
                    <ActivityIndicator size="small" color={colors.onAccent} />
                  ) : (
                    <Text style={styles.botaoAmbarTexto}>Ler e aceitar a versão atual</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.secao}>
          <SectionHeader title="Política de privacidade" />
          <SurfaceCard style={styles.cartao}>
            <Text style={styles.resumoTitulo}>Em resumo</Text>
            {RESUMO.map((linha) => (
              <View key={linha} style={styles.item}>
                <Feather name="check" size={16} color={colors.accentGreen} style={styles.marca} />
                <Text style={styles.itemTexto}>{linha}</Text>
              </View>
            ))}

            <Pressable
              onPress={() => void Linking.openURL(URL_POLITICA)}
              accessibilityRole="link"
              accessibilityLabel="Ler a política completa no navegador"
              style={styles.textoPuro}
            >
              <Text style={styles.textoPuroRotulo}>Ler a política completa</Text>
              <Feather name="external-link" size={16} color={colors.accentGreen} />
            </Pressable>
          </SurfaceCard>
        </View>

        <SurfaceCard style={styles.destrutivo}>
          <IconTile icone="trash-2" size={54} {...TERRACOTA} />
          <Text style={styles.destrutivoTitulo}>Apagar a conta</Text>
          <Text style={styles.destrutivoTexto}>{enunciado(contagens)}</Text>
          <Pressable
            onPress={pedirExclusao}
            accessibilityRole="button"
            accessibilityHint="Abre a confirmação para apagar tudo"
            style={styles.textoPuro}
          >
            <Text style={styles.apagarRotulo}>Apagar a conta e todos os dados</Text>
          </Pressable>
        </SurfaceCard>
      </ScrollView>

      <ModalDeExclusao
        visivel={modalAberto}
        contagens={contagens}
        onFechar={() => setModalAberto(false)}
        onApagado={() => {
          setModalAberto(false);
          Alert.alert(
            'Conta apagada',
            'Seus dados foram removidos. Obrigado por ter usado o aplicativo.',
            [{ text: 'Fechar', onPress: () => void signOut() }],
          );
        }}
      />
    </View>
  );
}

function ModalDeExclusao({
  visivel,
  contagens,
  onFechar,
  onApagado,
}: {
  visivel: boolean;
  contagens: Contagens | null;
  onFechar: () => void;
  onApagado: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [senha, setSenha] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  const pessoas = contagens?.profiles;

  async function apagar() {
    setEnviando(true);
    setErro(undefined);
    try {
      await contaApi.apagarConta(senha);
      onApagado();
    } catch (e) {
      const codigo = e instanceof ApiRequestError ? e.code : undefined;
      // O modal NAO fecha na falha: reabrir e redigitar tudo faria a pessoa
      // desistir no meio, e um meio-caminho aqui e pior que os dois extremos.
      setErro(codigo === API_ERROR.WRONG_PASSWORD ? 'Senha incorreta' : messageForError(codigo));
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar} transparent={false}>
      <View style={[styles.modal, { paddingTop: insets.top + spacing.md }]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* ScrollView obrigatorio: com fonte grande do sistema o conteudo
              passa da tela em qualquer aparelho. */}
          <ScrollView
            contentContainerStyle={styles.modalConteudo}
            keyboardShouldPersistTaps="handled"
          >
            <ScreenHeader title="Apagar a conta" onBack={enviando ? undefined : onFechar} />

            <Text style={styles.modalTexto}>
              Para confirmar, digite sua senha.{' '}
              {pessoas
                ? `Os dados de saúde de ${pessoas === 1 ? '1 pessoa' : `${pessoas} pessoas`} serão apagados dos nossos servidores e não podem ser recuperados.`
                : 'Os dados de saúde da sua família serão apagados dos nossos servidores e não podem ser recuperados.'}
            </Text>

            <FormField
              label="Sua senha"
              value={senha}
              onChangeText={setSenha}
              secure
              autoComplete="current-password"
              textContentType="password"
              error={erro}
              editable={!enviando}
              containerStyle={styles.campo}
            />

            <ConsentCheckbox checked={aceite} onChange={setAceite} disabled={enviando}>
              <Text style={styles.aceiteTexto}>
                Entendi que{' '}
                {pessoas
                  ? `os dados de ${pessoas === 1 ? '1 pessoa' : `${pessoas} pessoas`} serão apagados`
                  : 'todos os dados da minha família serão apagados'}{' '}
                e que isso não pode ser desfeito.
              </Text>
            </ConsentCheckbox>

            {/*
              O quarto degrau de botao, e ele existe SO aqui.

              Os tres degraus do aplicativo nao tem casa para "irreversivel":
              ambar diria "tem coisa para fazer", verde diria "gerencie este
              registro", e texto puro seria fraco demais num modal cujo unico
              proposito e este.
            */}
            <Pressable
              onPress={() => void apagar()}
              disabled={!senha || !aceite || enviando}
              accessibilityRole="button"
              accessibilityState={{ disabled: !senha || !aceite || enviando }}
              style={({ pressed }) => [
                styles.botaoApagar,
                (!senha || !aceite || enviando) && styles.apagado,
                pressed && styles.pressionado,
              ]}
            >
              {enviando ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.botaoApagarTexto}>Apagar a conta</Text>
              )}
            </Pressable>

            <Pressable
              onPress={onFechar}
              disabled={enviando}
              accessibilityRole="button"
              style={styles.textoPuro}
            >
              <Text style={styles.cancelarRotulo}>Cancelar</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const RESUMO = [
  'Seus dados de saúde ficam num banco em São Paulo e são usados só para o aplicativo funcionar.',
  'Não vendemos nem compartilhamos seus dados, e não há publicidade.',
  'As perguntas ao assistente, e os dados necessários para respondê-las, vão para a Groq, fora do Brasil.',
  'O assistente também pesquisa na internet quando precisa, e cita a fonte.',
  'Apagar a conta remove tudo: pessoas, remédios, doses, receitas e conversas.',
];

/**
 * O que a exclusao leva, com numeros reais.
 *
 * Sem os numeros, degrada para a frase sem quantidades. NUNCA mostra "0": um
 * zero mentiroso convida a apagar.
 */
function enunciado(c: Contagens | null): string {
  if (!c) {
    return 'Isto apaga, para sempre: todas as pessoas, remédios, doses registradas, receitas, consultas e as conversas com o assistente. Não dá para desfazer, e não temos cópia.';
  }

  const partes = [
    plural(c.profiles, 'pessoa', 'pessoas'),
    plural(c.medications, 'remédio', 'remédios'),
    plural(c.doses, 'dose registrada', 'doses registradas'),
    plural(c.prescriptions, 'receita', 'receitas'),
    plural(c.appointments, 'consulta', 'consultas'),
  ].filter(Boolean);

  return `Isto apaga, para sempre: ${partes.join(', ')} e todas as conversas com o assistente. Não dá para desfazer, e não temos cópia.`;
}

function plural(n: number, um: string, varios: string): string | null {
  if (n <= 0) return null;
  return `${n} ${n === 1 ? um : varios}`;
}

function data(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.settings[0] },
  flex: { flex: 1 },
  conteudo: { paddingHorizontal: spacing.xl },
  secao: { marginTop: spacing.xl },
  cartao: { padding: spacing.lg },

  reaceite: { marginTop: spacing.md },
  reaceiteTexto: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  botaoAmbar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    minHeight: 56,
  },
  botaoAmbarTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },

  resumoTitulo: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.sectionTitle,
    marginBottom: spacing.md,
  },
  item: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  marca: { marginTop: 3 },
  itemTexto: {
    flex: 1,
    marginLeft: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },

  destrutivo: { marginTop: spacing.xxl, padding: spacing.xl, alignItems: 'center' },
  destrutivoTitulo: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.sectionTitle,
    marginTop: spacing.lg,
  },
  destrutivoTexto: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  apagarRotulo: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textError },

  textoPuro: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  textoPuroRotulo: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen },

  modal: { flex: 1, backgroundColor: colors.surface },
  modalConteudo: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  modalTexto: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    marginTop: spacing.xl,
  },
  campo: { marginTop: spacing.xl },
  aceiteTexto: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  botaoApagar: {
    alignItems: 'center',
    justifyContent: 'center',
    height: sizes.buttonHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.textError,
    marginTop: spacing.xl,
  },
  botaoApagarTexto: { fontFamily: fonts.bold, fontSize: 18, color: colors.onAccent },
  cancelarRotulo: { fontFamily: fonts.bold, fontSize: 15, color: colors.accentGreen },

  pressionado: { opacity: 0.85 },
  apagado: { opacity: 0.5 },
});
