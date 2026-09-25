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

import { ApiRequestError } from '@/api/client';
import {
  healthApi,
  relationshipValues,
  type Profile,
  type ProfileCounts,
} from '@/api/health';
import { Avatar } from '@/components/Avatar';
import { FormField } from '@/components/FormField';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SelectField } from '@/components/SelectField';
import { SurfaceCard } from '@/components/SurfaceCard';
import { escolherFoto } from '@/lib/foto';
import {
  alturaParaCm,
  cmParaAltura,
  dataParaISO,
  formatarData,
  idadeDescrita,
  isoParaData,
  numeroDigitado,
  pesoTexto,
  somenteDigitos,
} from '@/lib/pessoa';
import { backgrounds, colors, fonts, pickAvatarColor, radii, spacing } from '@/theme';

const PARENTESCOS = relationshipValues.map((v) => ({
  valor: v,
  // Primeira letra maiuscula so na exibicao: o banco guarda o valor do enum.
  rotulo: v.charAt(0).toUpperCase() + v.slice(1),
}));

/**
 * Cadastro e edicao de um membro da familia.
 *
 * Uma rota so, com `id === 'novo'` para criar, no molde de medico/[id].tsx.
 * O mockup desta tela ja mostra nome, parentesco e nascimento — que seria o
 * conteudo de uma ficha separada — entao duas telas para seis campos seria
 * peso morto.
 */
export default function MembroScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, origem } = useLocalSearchParams<{ id: string; origem?: string }>();
  /**
   * Chegou pelos Ajustes, e nao pela familia.
   *
   * Vem por PARAMETRO e nao do `titular`, que so e conhecido depois da
   * resposta do servidor — o titulo piscaria de "Editar membro" para "Dados
   * pessoais" no meio da carga.
   */
  const deAjustes = origem === 'ajustes';
  const novo = id === 'novo';

  const [carregando, setCarregando] = useState(!novo);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const [titular, setTitular] = useState(false);
  const [contagens, setContagens] = useState<ProfileCounts | null>(null);

  const [nome, setNome] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [peso, setPeso] = useState('');
  /**
   * Quando o peso guardado foi anotado.
   *
   * So leitura: quem carimba a data e o servidor, ao salvar. Aparece porque
   * dose pediatrica se calcula por quilo, e um peso de tres meses atras num
   * bebe ja nao vale — quem abre a ficha precisa ver isso sem procurar.
   */
  const [pesoAnotadoEm, setPesoAnotadoEm] = useState<string | undefined>();
  const [altura, setAltura] = useState('');
  const [parentesco, setParentesco] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);

  useEffect(() => {
    if (novo) return;
    let cancelado = false;
    (async () => {
      try {
        const r = await healthApi.getProfile(id!);
        if (cancelado) return;
        preencher(r.profile);
        setContagens(r.counts);
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
  }, [id, novo]);

  function preencher(p: Profile) {
    setNome(p.fullName);
    setNascimento(isoParaData(p.birthDate));
    setPeso(pesoTexto(p.weightKg));
    setPesoAnotadoEm(
      p.weightKg != null && p.weightMeasuredAt
        ? `Anotado em ${new Date(p.weightMeasuredAt).toLocaleDateString('pt-BR')}`
        : undefined,
    );
    setAltura(cmParaAltura(p.heightCm));
    setParentesco(p.relationship);
    setObservacoes(p.notes ?? '');
    setTitular(p.isAccountHolder);
    // Sem esta linha, o estado comecaria nulo e QUALQUER salvamento apagaria
    // a foto existente. Foi o laco que quase passou na tela do medico.
    setFoto(p.photo ?? null);
  }

  function abrirEscolhaDeFoto() {
    // Tres botoes no maximo: o Alert do Android descarta o excedente.
    Alert.alert('Foto', undefined, [
      { text: 'Tirar foto', onPress: () => void aplicarFoto('camera') },
      { text: 'Escolher da galeria', onPress: () => void aplicarFoto('galeria') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function aplicarFoto(origem: 'camera' | 'galeria') {
    setProcessandoFoto(true);
    const r = await escolherFoto(origem);
    setProcessandoFoto(false);

    if (r.ok) {
      setFoto(r.dataUri);
      return;
    }
    // Desistir nao e erro: nao mexe na foto atual e nao avisa nada.
    if (r.motivo === 'cancelado') return;

    Alert.alert(
      r.motivo === 'permissao' ? 'Sem acesso à câmera' : 'Não consegui usar essa imagem',
      r.motivo === 'permissao'
        ? 'Libere a câmera para este aplicativo nos ajustes do aparelho, ou escolha uma foto da galeria.'
        : 'Tente outra foto.',
    );
  }

  function validar(): boolean {
    const novos: Record<string, string> = {};

    if (nome.trim().length < 2) novos.fullName = 'Informe o nome';

    if (somenteDigitos(nascimento).length > 0 && !dataParaISO(nascimento)) {
      novos.birthDate = 'Data inválida';
    }
    if (peso.trim() !== '' && numeroDigitado(peso) == null) novos.weightKg = 'Peso inválido';
    if (altura.trim() !== '' && alturaParaCm(altura) == null) novos.heightCm = 'Altura inválida';

    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function salvar() {
    setErroGeral(null);
    if (!validar()) return;

    const limpo = nome.trim();
    const dados = {
      fullName: limpo,
      birthDate: dataParaISO(nascimento),
      relationship: parentesco,
      notes: observacoes.trim() || null,
      photo: foto,
      weightKg: numeroDigitado(peso),
      heightCm: alturaParaCm(altura),
      // A cor vai RESOLVIDA, e nao nula: derivada do nome, ela mudaria quando
      // alguem corrigisse o nome da pessoa — e o circulo colorido e como se
      // reconhece quem e quem nas telas.
      ...(novo ? { avatarColor: pickAvatarColor(limpo) } : {}),
    };

    setSalvando(true);
    try {
      if (novo) await healthApi.createProfile(dados);
      else await healthApi.updateProfile(id!, dados);
      router.back();
    } catch (e) {
      if (e instanceof ApiRequestError && e.fields) setErros(e.fields);
      setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setSalvando(false);
    }
  }

  function confirmarRemocao() {
    const futuras = contagens?.upcomingAppointments ?? 0;
    const remedios = contagens?.medications ?? 0;

    const detalhe = [
      futuras > 0 ? `os lembretes das ${futuras} consultas futuras param` : null,
      remedios > 0
        ? `os ${remedios} remédios e o histórico de doses continuam guardados`
        : 'o histórico de saúde continua guardado',
    ]
      .filter(Boolean)
      .join(', e ');

    Alert.alert(
      `Remover ${nome.split(' ')[0]}?`,
      `A pessoa sai da tela inicial e das listas. Como ${detalhe} — se você cadastrar de novo, dá para restaurar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await healthApi.updateProfile(id!, { isActive: false });
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

  const idade = idadeDescrita(dataParaISO(nascimento));

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
            title={deAjustes ? 'Dados pessoais' : novo ? 'Cadastro de membro' : 'Editar membro'}
            onBack={() => router.back()}
            onNotifications={() =>
              Alert.alert('Notificações', 'Esta parte ainda está sendo construída.')
            }
            hasNotifications
          />

          {carregando ? (
            <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
          ) : (
            <>
              <SurfaceCard style={styles.cardFoto}>
                <Pressable
                  onPress={abrirEscolhaDeFoto}
                  disabled={salvando || processandoFoto}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={foto ? 'Alterar a foto' : 'Adicionar foto'}
                  accessibilityHint="Abre a câmera ou a galeria"
                >
                  <View>
                    {foto ? (
                      <Avatar nome={nome || '?'} photo={foto} size={96} />
                    ) : (
                      <View style={styles.avatarVazio}>
                        <Feather name="user" size={52} color={colors.surface} />
                      </View>
                    )}

                    <View style={styles.selo}>
                      {processandoFoto ? (
                        <ActivityIndicator size="small" color={colors.accentGreen} />
                      ) : (
                        <Feather name="camera" size={18} color={colors.accentGreen} />
                      )}
                    </View>
                  </View>
                </Pressable>

                {foto ? (
                  <Pressable
                    onPress={() => setFoto(null)}
                    disabled={salvando || processandoFoto}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Remover a foto"
                  >
                    <Text style={styles.fotoRemover}>Remover foto</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.fotoDica}>Adicionar foto</Text>
                )}
              </SurfaceCard>

              <SurfaceCard style={styles.cardForm}>
                <FormField
                  label="Nome completo"
                  value={nome}
                  onChangeText={setNome}
                  placeholder="Digite o nome do membro"
                  error={erros.fullName}
                  autoCapitalize="words"
                  editable={!salvando}
                />

                <View style={styles.linha}>
                  <FormField
                    label="Nascimento"
                    value={nascimento}
                    onChangeText={(v) => setNascimento(formatarData(v))}
                    placeholder="dd/mm/aaaa"
                    keyboardType="number-pad"
                    maxLength={10}
                    // A idade calculada aparece aqui: e o que o mockup queria
                    // comunicar com "Ex.: 32 anos", sem guardar um numero que
                    // envelhece sozinho.
                    hint={idade ?? undefined}
                    error={erros.birthDate}
                    editable={!salvando}
                    containerStyle={styles.coluna}
                  />
                  <FormField
                    label="Peso"
                    value={peso}
                    onChangeText={setPeso}
                    placeholder="Ex.: 68 kg"
                    keyboardType="decimal-pad"
                    hint={pesoAnotadoEm}
                    error={erros.weightKg}
                    editable={!salvando}
                    containerStyle={styles.coluna}
                  />
                </View>

                <View style={styles.linha}>
                  <FormField
                    label="Altura"
                    value={altura}
                    onChangeText={setAltura}
                    placeholder="Ex.: 1,70 m"
                    keyboardType="decimal-pad"
                    error={erros.heightCm}
                    editable={!salvando}
                    containerStyle={styles.coluna}
                  />
                  {/*
                    Parentesco nao existe para o titular: a lista de opcoes
                    nao tem "titular", entao o campo so ofereceria rotulos
                    errados. Campo que so pode ser preenchido errado e pior
                    que campo nenhum.
                  */}
                  {titular ? null : (
                    <SelectField
                      label="Parentesco"
                      value={parentesco}
                      options={PARENTESCOS}
                      onChange={setParentesco}
                      placeholder="Selecione"
                      tituloDoPainel="Parentesco"
                      error={erros.relationship}
                      disabled={salvando}
                      containerStyle={styles.coluna}
                    />
                  )}
                </View>

                <SectionHeader title="Informações de saúde" icon="leaf" />

                <FormField
                  label="Observações"
                  value={observacoes}
                  onChangeText={setObservacoes}
                  placeholder="Alguma informação importante?"
                  multiline
                  error={erros.notes}
                  editable={!salvando}
                  containerStyle={styles.ultimoCampo}
                />

                {erroGeral ? <Text style={styles.erroGeral}>{erroGeral}</Text> : null}

                <Pressable
                  onPress={() => void salvar()}
                  disabled={salvando}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.salvar, pressed && styles.pressionado]}
                >
                  {salvando ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={styles.salvarTexto}>{novo ? 'Salvar membro' : 'Salvar'}</Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => router.back()}
                  disabled={salvando}
                  accessibilityRole="button"
                  style={styles.secundario}
                >
                  <Text style={styles.cancelarTexto}>Cancelar</Text>
                </Pressable>

                {/* O titular e a propria conta: sair da propria familia nao
                    quer dizer nada, e o servidor recusa de qualquer forma. */}
                {!novo && !titular ? (
                  <Pressable
                    onPress={confirmarRemocao}
                    disabled={salvando}
                    accessibilityRole="button"
                    style={styles.secundario}
                  >
                    <Text style={styles.removerTexto}>Remover da família</Text>
                  </Pressable>
                ) : null}

                {/*
                  Quem chegou por "Dados pessoais" nao estava procurando um
                  botao de remover — explicar por que ele nao esta la levanta
                  uma pergunta que ninguem fez.
                */}
                {!novo && titular && !deAjustes ? (
                  <Text style={styles.titularAviso}>
                    Esta é a sua conta, por isso ela não pode ser removida da família.
                  </Text>
                ) : null}

                {/*
                  O e-mail nao mora nesta tela, e quem abre "Dados pessoais"
                  vai procura-lo aqui. `replace` e nao `push`: empilhar duas
                  telas de conta obrigaria a dois toques de volta.
                */}
                {deAjustes ? (
                  <Pressable
                    onPress={() => router.replace('/conta/acesso')}
                    disabled={salvando}
                    accessibilityRole="button"
                    style={styles.secundario}
                  >
                    <Text style={styles.cancelarTexto}>Alterar e-mail ou senha</Text>
                  </Pressable>
                ) : null}
              </SurfaceCard>

              {novo ? (
                <Text style={styles.rodape}>Você poderá editar essas informações depois.</Text>
              ) : null}
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
  cardFoto: { marginTop: spacing.xl, alignItems: 'center', paddingVertical: spacing.xxl },
  cardForm: { marginTop: spacing.lg },
  avatarVazio: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.avatarEmpty,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selo: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.accentGreen,
  },
  fotoDica: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.accentGreen,
    marginTop: spacing.lg,
  },
  fotoRemover: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textError,
    marginTop: spacing.lg,
  },
  // Duas colunas: o FormField ja traz o proprio marginBottom, entao a linha
  // nao precisa de espacamento vertical.
  linha: { flexDirection: 'row', gap: spacing.md },
  coluna: { flex: 1 },
  ultimoCampo: { marginBottom: spacing.sm },
  erroGeral: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textError,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  salvar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
    minHeight: 56,
  },
  pressionado: { opacity: 0.85 },
  salvarTexto: { fontFamily: fonts.bold, fontSize: 17, color: colors.onAccent },
  secundario: { alignItems: 'center', paddingVertical: spacing.lg },
  cancelarTexto: { fontFamily: fonts.bold, fontSize: 15, color: colors.accentGreen },
  removerTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textError },
  titularAviso: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  rodape: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
