import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import {
  acompanhantesApi,
  PERMISSOES,
  type Permissoes,
  type ResultadoDoConvite,
} from '@/api/acompanhantes';
import { ApiRequestError } from '@/api/client';
import { healthApi, type Profile } from '@/api/health';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { FormField } from '@/components/FormField';
import { Icone, ICONES } from '@/components/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/components/IconTile';
import { ICONE_DO_AVISO, PreviaDeMensagem } from '@/components/PreviaDeMensagem';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProfileSelector } from '@/components/ProfileSelector';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsRow } from '@/components/SettingsRow';
import { SurfaceCard } from '@/components/SurfaceCard';
import {
  avisosAutorizados,
  primeiroNome,
  rotuloDoAviso,
  textoDoConvite,
} from '@/lib/mensagensWhatsapp';
import { formatarTelefone, telefoneParaExibir } from '@/lib/telefone';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

const TODAS_LIGADAS: Permissoes = {
  notifyDose: true,
  notifyLate: true,
  notifyLowStock: true,
  notifyTaken: true,
};

/**
 * Cadastro e edicao de um acompanhante.
 *
 * Sem `id`, cadastra e o servidor manda o convite. Com `id`, edita — e NAO
 * reenvia o convite: mudar uma permissao nao e motivo para escrever de novo a
 * quem ja foi avisado. `profileId` opcional so pre-escolhe a pessoa.
 */
export default function AcompanhanteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string; profileId?: string }>();
  const id = params.id || null;
  const novo = id === null;

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const [profileId, setProfileId] = useState<string | null>(params.profileId ?? null);
  /** Na edicao a pessoa nao muda (o PATCH nem aceita), entao basta o nome. */
  const [paciente, setPaciente] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [relacao, setRelacao] = useState('');
  const [permissoes, setPermissoes] = useState<Permissoes>(TODAS_LIGADAS);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        if (novo) {
          const lista = await healthApi.listProfiles();
          if (cancelado) return;
          setPerfis(lista);
          // Uma pessoa so: nao ha o que escolher. Com varias, a escolha fica
          // em branco de proposito — aviso de remedio da pessoa errada e o
          // engano que esta tela nao pode deixar passar calado.
          if (!params.profileId && lista.length === 1) setProfileId(lista[0]!.id);
        } else {
          // Nao ha GET por id: a lista da conta e curta e ja traz tudo.
          const r = await acompanhantesApi.listar();
          if (cancelado) return;
          const c = r.caregivers.find((x) => x.id === id);
          if (!c) {
            setErroGeral('Não encontrei este acompanhante. Ele pode ter sido removido.');
            return;
          }
          setProfileId(c.profileId);
          setPaciente(c.patientName);
          setNome(c.fullName);
          setTelefone(telefoneParaExibir(c.phone));
          setRelacao(c.relationship ?? '');
          setPermissoes({
            notifyDose: c.notifyDose,
            notifyLate: c.notifyLate,
            notifyLowStock: c.notifyLowStock,
            notifyTaken: c.notifyTaken,
          });
        }
      } catch (e) {
        if (!cancelado) {
          setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [id, novo, params.profileId]);

  const nomeDoPaciente = novo
    ? (perfis.find((p) => p.id === profileId)?.fullName ?? '')
    : paciente;

  function validar(): boolean {
    const novos: Record<string, string> = {};
    if (novo && !profileId) novos.profileId = 'Escolha para quem são os cuidados';
    if (nome.trim().length < 2) novos.fullName = 'Informe o nome';
    const digitos = telefone.replace(/\D/g, '').length;
    // Mesmo texto do servidor, para a pessoa nao ver duas frases para o mesmo erro.
    if (digitos < 10) novos.phone = 'Informe um celular com DDD, como (11) 99999-1234';
    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function salvar() {
    setErroGeral(null);
    if (!validar()) return;

    const dados = {
      fullName: nome.trim(),
      phone: telefone,
      relationship: relacao.trim() || null,
      ...permissoes,
    };

    setSalvando(true);
    try {
      if (novo) {
        const r = await acompanhantesApi.criar({ profileId: profileId!, ...dados });
        avisarDoConvite(r.convite, primeiroNome(r.caregiver.fullName));
      } else {
        await acompanhantesApi.atualizar(id!, dados);
        router.back();
      }
    } catch (e) {
      if (e instanceof ApiRequestError && e.fields) setErros(e.fields);
      setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setSalvando(false);
    }
  }

  /**
   * O cadastro deu certo nos tres casos; o que muda e o convite.
   *
   * Por isso a tela fecha em todos: ficar aberta convidaria a tocar de novo e
   * cadastrar a mesma pessoa duas vezes.
   */
  function avisarDoConvite(convite: ResultadoDoConvite, quem: string) {
    const voltar = [{ text: 'OK', onPress: () => router.back() }];
    if (convite === 'enviada') {
      Alert.alert('Convite enviado', `${quem} vai receber pelo WhatsApp os avisos autorizados.`, voltar);
    } else if (convite === 'falha') {
      Alert.alert(
        'Cadastrado, mas o convite não foi enviado',
        'Confira se o número tem WhatsApp. Você pode corrigi-lo em Lembretes por WhatsApp.',
        voltar,
      );
    } else {
      Alert.alert(
        'Cadastrado',
        'O envio por WhatsApp ainda não está configurado.',
        voltar,
      );
    }
  }

  function confirmarRemocao() {
    Alert.alert(
      `Remover ${primeiroNome(nome) || 'acompanhante'}?`,
      'Essa pessoa deixa de receber os avisos pelo WhatsApp.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await acompanhantesApi.remover(id!);
              router.back();
            } catch (e) {
              Alert.alert(
                'Não consegui remover',
                messageForError(e instanceof ApiRequestError ? e.code : undefined),
              );
            }
          },
        },
      ],
    );
  }

  // A previa so aparece com a pessoa escolhida: sem ela a frase sairia com um
  // buraco no lugar do nome.
  const previa = nomeDoPaciente
    ? textoDoConvite({
        quemConvida: user?.fullName ?? 'Uma pessoa da família',
        paciente: nomeDoPaciente,
        avisos: avisosAutorizados(permissoes),
      })
    : null;

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.family} />

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
          <ScreenHeader
            title={novo ? 'Cadastrar acompanhante' : 'Editar acompanhante'}
            titleLines={2}
            onBack={() => router.back()}
          />

          {carregando ? (
            <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
          ) : !novo && !nome && erroGeral ? (
            <SurfaceCard style={styles.aviso}>
              <Feather name="alert-circle" size={26} color={colors.textError} />
              <Text style={styles.avisoTexto}>{erroGeral}</Text>
            </SurfaceCard>
          ) : (
            <>
              <SurfaceCard style={styles.apresentacao}>
                <View style={styles.circulo}>
                  <Icone nome={ICONES.acompanhante} size={30} color={colors.surface} />
                </View>
                <View style={styles.apresentacaoTextos}>
                  <Text style={styles.apresentacaoTitulo}>Adicione alguém de confiança</Text>
                  <Text style={styles.apresentacaoAjuda}>
                    Essa pessoa poderá receber os lembretes dos medicamentos pelo WhatsApp.
                  </Text>
                </View>
              </SurfaceCard>

              <View style={styles.paraQuem}>
                <Text style={styles.paraQuemTitulo}>Para quem são os cuidados?</Text>
                {novo ? (
                  <ProfileSelector
                    profiles={perfis}
                    selectedId={profileId}
                    onSelect={(v) => setProfileId(v)}
                    tituloDoPainel="Cuidados de"
                    permitirTodos={false}
                  />
                ) : (
                  // Na edicao a pessoa e fixa: o acompanhante e de quem foi
                  // cadastrado. Trocar seria outro cadastro, com outro convite.
                  <View style={styles.pacienteFixo}>
                    <Avatar nome={paciente || '?'} size={46} />
                    <Text style={styles.pacienteFixoNome} numberOfLines={1}>
                      {paciente}
                    </Text>
                  </View>
                )}
                {erros.profileId ? (
                  <Text style={styles.paraQuemErro}>{erros.profileId}</Text>
                ) : null}
              </View>

              <SurfaceCard style={styles.cartao}>
                <FormField
                  label="Nome completo"
                  value={nome}
                  onChangeText={setNome}
                  placeholder="Digite o nome do acompanhante"
                  error={erros.fullName}
                  autoCapitalize="words"
                  editable={!salvando}
                />
                <FormField
                  label="Número do WhatsApp"
                  value={telefone}
                  onChangeText={(v) => setTelefone(formatarTelefone(v))}
                  placeholder="(00) 00000-0000"
                  keyboardType="phone-pad"
                  maxLength={15}
                  error={erros.phone}
                  editable={!salvando}
                />
                <FormField
                  label="Relação com o paciente"
                  value={relacao}
                  onChangeText={setRelacao}
                  placeholder="Ex.: mãe, pai ou cuidadora"
                  error={erros.relationship}
                  editable={!salvando}
                  containerStyle={styles.ultimoCampo}
                />
              </SurfaceCard>

              <SurfaceCard flush style={styles.cartaoLista}>
                <Text style={styles.tituloDoCartao}>Permissões de recebimento</Text>
                {PERMISSOES.map((k, i) => (
                  <View key={k}>
                    {i > 0 ? <View style={styles.filete} /> : null}
                    <SettingsRow
                      marcador={<IconTile icone={ICONE_DO_AVISO[k]} {...LADRILHO_NEUTRO} />}
                      rotulo={rotuloDoAviso(k)}
                      acessorio="interruptor"
                      ligado={permissoes[k]}
                      onChange={(v) => setPermissoes((p) => ({ ...p, [k]: v }))}
                      desabilitado={salvando}
                    />
                  </View>
                ))}
              </SurfaceCard>

              <SurfaceCard style={styles.cartao}>
                {/* Na edicao a previa sai: nada sera enviado ao salvar, e
                    mostrar o convite sugeriria o contrario. */}
                {novo && previa ? (
                  <>
                    <Text style={styles.tituloPrevia}>Prévia do convite</Text>
                    <PreviaDeMensagem texto={previa} />
                  </>
                ) : null}

                {erroGeral ? <Text style={styles.erroGeral}>{erroGeral}</Text> : null}

                <PrimaryButton
                  title={novo ? 'Enviar convite pelo WhatsApp' : 'Salvar alterações'}
                  onPress={() => void salvar()}
                  loading={salvando}
                  style={styles.botao}
                />

                <Pressable
                  onPress={() => router.back()}
                  disabled={salvando}
                  accessibilityRole="button"
                  style={styles.secundario}
                >
                  <Text style={styles.cancelarTexto}>Cancelar</Text>
                </Pressable>

                {!novo ? (
                  <Pressable
                    onPress={confirmarRemocao}
                    disabled={salvando}
                    accessibilityRole="button"
                    style={styles.secundario}
                  >
                    <Text style={styles.removerTexto}>Remover acompanhante</Text>
                  </Pressable>
                ) : null}

                <Text style={styles.rodape}>
                  O acompanhante poderá receber somente os avisos autorizados.
                </Text>
              </SurfaceCard>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.family[0] },
  flex: { flex: 1 },
  conteudo: { paddingHorizontal: spacing.xl },
  carregando: { marginTop: spacing.xxl },

  apresentacao: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  circulo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apresentacaoTextos: { flex: 1, marginLeft: spacing.lg },
  apresentacaoTitulo: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.sectionTitle },
  apresentacaoAjuda: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },

  paraQuem: {
    marginTop: spacing.lg,
    backgroundColor: colors.actionGreen,
    borderRadius: radii.card,
    padding: spacing.lg,
  },
  paraQuemTitulo: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.surface,
    marginBottom: spacing.md,
  },
  paraQuemErro: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.surface,
    marginTop: spacing.sm,
  },
  pacienteFixo: { flexDirection: 'row', alignItems: 'center' },
  pacienteFixoNome: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.surface,
    marginLeft: spacing.lg,
  },

  cartao: { marginTop: spacing.lg },
  cartaoLista: { marginTop: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  tituloDoCartao: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.sectionTitle,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  // Mesmo filete do SettingsGroup, alinhado ao texto e nao a borda.
  filete: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: spacing.lg + 44 + spacing.md,
    marginRight: spacing.lg,
  },
  ultimoCampo: { marginBottom: 0 },

  tituloPrevia: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.sectionTitle,
    marginBottom: spacing.md,
  },

  erroGeral: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textError,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  botao: { marginTop: spacing.lg },
  secundario: { alignItems: 'center', paddingVertical: spacing.md },
  cancelarTexto: { fontFamily: fonts.bold, fontSize: 15, color: colors.accentGreen },
  removerTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textError },
  rodape: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  aviso: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.xl },
  avisoTexto: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
