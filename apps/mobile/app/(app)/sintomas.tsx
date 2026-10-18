import { Feather } from '@expo/vector-icons';
import { addDays, endOfDay, startOfDay, subDays } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiRequestError } from '@/api/client';
import { healthApi, type Profile, type SymptomEntry, type SymptomKind } from '@/api/health';
import { EscalaDeCinco } from '@/components/EscalaDeCinco';
import { FormField } from '@/components/FormField';
import { GraficoDeBarras } from '@/components/GraficoDeBarras';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProfileSelector } from '@/components/ProfileSelector';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import {
  barrasDaJanela,
  descricaoDoGrafico,
  descricaoDoRegistro,
  formatarHora,
  horaValida,
  legendaDoGrafico,
  momentoDoRegistro,
  momentoEscolhido,
  quantosNaJanela,
  tipoDe,
  TIPOS_DE_SINTOMA,
} from '@/lib/diarioDeSintomas';
import { hora } from '@/lib/posologia';
import { messageForError } from '@gestao/shared';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';
import { Icone, type NomeIcone } from '@/components/Icone';

/** Mesmo nome e valor das outras telas; aqui a barra some, mas o rodape continua. */
const ESPACO_BARRA = 96;
/** Quantos registros a linha do tempo mostra antes de "mostrar mais". */
const VISIVEIS = 5;

/**
 * Diario de sintomas.
 *
 * ROTA IRMA DAS ABAS, com a barra escondida, e nao pilha dentro de uma aba: e
 * um FORMULARIO, e a regra esta escrita nos dois layouts — "abas embaixo de um
 * formulario longo dividem a atencao e convidam a sair no meio do
 * preenchimento". O mockup acende "Assistente", o que e arbitrario: a tela nao
 * tem relacao com ele.
 *
 * SAO SEIS TIPOS. Pressao e glicemia ficaram de fora de proposito — sao
 * medicoes, nao sintomas, e nao cabem numa escala de 1 a 5. Ver o cabecalho da
 * tabela symptom_entries.
 */
export default function SintomasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const rolagem = useRef<ScrollView>(null);
  const jaRolou = useRef(false);

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [registros, setRegistros] = useState<SymptomEntry[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroDoHistorico, setErroDoHistorico] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);

  const [tipo, setTipo] = useState<SymptomKind | null>(null);
  const [intensidade, setIntensidade] = useState<number | null>(null);
  const [temperatura, setTemperatura] = useState('');
  const [dia, setDia] = useState<'hoje' | 'ontem'>('hoje');
  const [horario, setHorario] = useState(() => hora(new Date()));
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvoAs, setSalvoAs] = useState<string | null>(null);

  const agora = new Date();
  // Com fonte grande a coluna encolhe; cinco dias continuam legiveis onde sete
  // nao caberiam.
  const dias = PixelRatio.getFontScale() >= 1.5 ? 5 : 7;
  // Intensidade e horario dividem a linha; com fonte grande a escala de cinco
  // bolinhas nao cabe em meia largura, e os dois voltam a empilhar.
  const empilhar = PixelRatio.getFontScale() >= 1.3;

  const carregarPessoas = useCallback(async () => {
    try {
      const lista = await healthApi.listProfiles();
      setPerfis(lista);
      setErroGeral(null);
      setPerfilId(
        (atual) => atual ?? lista.find((p) => p.isAccountHolder)?.id ?? lista[0]?.id ?? null,
      );
    } catch (e) {
      // NUNCA setPerfis([]) numa falha: a tela diria "cadastre alguem" para
      // quem tem a familia inteira cadastrada.
      setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarHistorico = useCallback(async (quem: string | null) => {
    if (!quem) return;
    setErroDoHistorico(null);
    try {
      const lista = await healthApi.listSymptoms({
        profileId: quem,
        from: startOfDay(subDays(new Date(), 29)),
        to: endOfDay(new Date()),
      });
      setRegistros(lista);
    } catch (e) {
      setErroDoHistorico(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregarPessoas();
    }, [carregarPessoas]),
  );

  useFocusEffect(
    useCallback(() => {
      void carregarHistorico(perfilId);
    }, [carregarHistorico, perfilId]),
  );

  function trocarPessoa(id: string | null) {
    setPerfilId(id);
    // Deixar na tela os registros da pessoa anterior seria mentira.
    setRegistros([]);
    setTodos(false);
  }

  function escolherTipo(novo: SymptomKind) {
    // Tocar de novo NAO desmarca: diferente do SelectField, aqui desmarcar
    // jogaria fora a escala e a observacao ja digitadas.
    if (novo === tipo) return;
    setTipo(novo);
    setSalvoAs(null);
    // A temperatura so significa algo em febre; a escala sobrevive a troca.
    if (novo !== 'febre') setTemperatura('');

    if (!jaRolou.current) {
      jaRolou.current = true;
      setTimeout(() => rolagem.current?.scrollTo({ y: 240, animated: true }), 80);
    }
  }

  const definicao = tipo ? tipoDe(tipo) : null;

  const temperaturaNumero = Number(temperatura.replace(',', '.'));
  const erroDaTemperatura =
    temperatura.trim() === ''
      ? undefined
      : !Number.isFinite(temperaturaNumero)
        ? 'Digite só o número, como 37,8.'
        : temperaturaNumero < 30 || temperaturaNumero > 45
          ? 'Temperatura fora do esperado. Confira o número.'
          : undefined;
  const avisoDaTemperatura =
    !erroDaTemperatura && Number.isFinite(temperaturaNumero) && temperatura.trim() !== '' &&
    temperaturaNumero < 35
      ? 'Confira: essa temperatura é bem baixa.'
      : undefined;

  const quando = horaValida(horario) ? momentoEscolhido(dia, horario, agora) : null;
  const erroDoHorario = !horaValida(horario)
    ? 'Informe a hora, como 14:30.'
    : quando && quando > agora
      ? `Ainda não são ${horario}. Confira o horário.`
      : undefined;

  const podeSalvar =
    !!perfilId && !!tipo && intensidade != null && !erroDaTemperatura && !erroDoHorario;

  async function salvar() {
    if (!podeSalvar || !quando || !tipo || intensidade == null || !perfilId) return;
    setSalvando(true);
    try {
      const criado = await healthApi.createSymptom({
        profileId: perfilId,
        kind: tipo,
        intensity: intensidade,
        occurredAt: quando.toISOString(),
        temperatureC: tipo === 'febre' && temperatura.trim() !== '' ? temperaturaNumero : null,
        note: nota.trim() || null,
      });
      // Entra no topo na hora: e o que prova que caiu.
      setRegistros((atual) => [criado, ...atual]);
      setIntensidade(null);
      setTemperatura('');
      setNota('');
      setDia('hoje');
      setHorario(hora(new Date()));
      setSalvoAs(hora(quando));
      // O TIPO continua escolhido, para o grafico nao sumir bem na hora em que
      // a barra nova apareceu.
    } catch (e) {
      Alert.alert(
        'Não consegui salvar',
        messageForError(e instanceof ApiRequestError ? e.code : undefined),
      );
    } finally {
      setSalvando(false);
    }
  }

  function apagar(r: SymptomEntry) {
    Alert.alert('Apagar este registro?', descricaoDoRegistro(r), [
      { text: 'Fechar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          try {
            await healthApi.deleteSymptom(r.id);
            setRegistros((atual) => atual.filter((x) => x.id !== r.id));
          } catch (e) {
            Alert.alert(
              'Não consegui apagar',
              messageForError(e instanceof ApiRequestError ? e.code : undefined),
            );
          }
        },
      },
    ]);
  }

  const visiveis = todos ? registros.slice(0, 20) : registros.slice(0, VISIVEIS);
  const naJanela = definicao
    ? registros.filter((r) => new Date(r.occurredAt) >= startOfDay(subDays(agora, dias - 1)))
    : [];
  const mostrarGrafico = definicao ? quantosNaJanela(naJanela, definicao) >= 2 : false;
  const barras = definicao && mostrarGrafico ? barrasDaJanela(naJanela, definicao, agora, dias) : [];

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.medications} />

      <ScrollView
        ref={rolagem}
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + ESPACO_BARRA },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Diário de sintomas"
          titleLines={2}
          onBack={() => router.back()}
          mostrarSino
        />

        {carregando ? (
          <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
        ) : erroGeral ? (
          <SurfaceCard style={styles.cartaoCentral}>
            <Feather name="alert-circle" size={26} color={colors.textError} />
            <Text style={styles.ajuda}>{erroGeral}</Text>
            <Pressable onPress={() => void carregarPessoas()} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.link}>Tentar de novo</Text>
            </Pressable>
          </SurfaceCard>
        ) : perfis.length === 0 ? (
          <SurfaceCard style={styles.cartaoCentral}>
            <Text style={styles.ajuda}>
              Cadastre alguém na sua família para começar a registrar.
            </Text>
            <Pressable
              onPress={() => router.push('/conta/familia')}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Text style={styles.link}>Ir para a família</Text>
            </Pressable>
          </SurfaceCard>
        ) : (
          <>
            <View style={styles.seletor}>
              <ProfileSelector
                profiles={perfis}
                selectedId={perfilId}
                onSelect={trocarPessoa}
                tituloDoPainel="Registrar sintoma de"
                permitirTodos={false}
              />
            </View>

            <SurfaceCard style={styles.bloco}>
              <Text style={styles.blocoTitulo} accessibilityRole="header">
                Como você está se sentindo hoje?
              </Text>

              <View
                style={styles.grade}
                accessibilityRole="radiogroup"
                accessibilityLabel="Tipo de registro"
              >
                {TIPOS_DE_SINTOMA.map((t) => {
                  const ativo = t.chave === tipo;
                  return (
                    <Pressable
                      key={t.chave}
                      onPress={() => escolherTipo(t.chave)}
                      accessibilityRole="radio"
                      accessibilityLabel={t.rotulo}
                      accessibilityState={{ checked: ativo }}
                      style={styles.item}
                    >
                      {/* A cor carrega SELECAO, nao categoria: o icone e o
                          rotulo ja identificam o tipo, e seis cores novas nao
                          acrescentariam informacao — so gastariam tokens cujo
                          significado ja esta fixado no aplicativo. */}
                      <View style={[styles.circulo, ativo && styles.circuloAtivo]}>
                        <Icone
                          nome={t.icone}
                          size={24}
                          color={ativo ? colors.onAccent : colors.pillTabletIcon}
                        />
                      </View>
                      <Text
                        style={[styles.itemRotulo, ativo && styles.itemRotuloAtivo]}
                        numberOfLines={2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                      >
                        {t.rotulo}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {!tipo ? <Text style={styles.apoio}>Escolha o que você quer anotar.</Text> : null}
            </SurfaceCard>

            {definicao ? (
              <>
                <View style={styles.secao}>
                  <SectionHeader title="Registrar sintoma" />
                </View>

                <SurfaceCard style={styles.bloco}>
                  {/*
                    Intensidade e horario LADO A LADO, com um divisor, como o
                    pacote final desenha. O horario e uma pilula com relogio,
                    mas continua sendo digitado: o diario aceita registro de
                    ontem e de horas atras, e um seletor fixo no "agora" nao
                    serviria.
                  */}
                  <View style={[styles.duasColunas, empilhar && styles.empilhadas]}>
                    <View style={styles.colunaEscala}>
                      <EscalaDeCinco
                        value={intensidade}
                        onChange={(v) => {
                          setIntensidade(v);
                          setSalvoAs(null);
                        }}
                        rotulos={definicao.degraus}
                        nomeDoGrupo={definicao.nomeDaEscala}
                      />
                    </View>

                    {!empilhar ? <View style={styles.divisorVertical} /> : null}

                    <View style={styles.colunaHorario}>
                      <Text style={styles.rotulo}>Horário</Text>
                      <View style={[styles.pilulaHorario, !!erroDoHorario && styles.pilulaErro]}>
                        <Feather name="clock" size={18} color={colors.sectionTitle} />
                        <TextInput
                          value={horario}
                          onChangeText={(v) => {
                            setHorario(formatarHora(v));
                            setSalvoAs(null);
                          }}
                          placeholder="14:30"
                          placeholderTextColor={colors.textPlaceholder}
                          keyboardType="number-pad"
                          maxLength={5}
                          editable={!salvando}
                          accessibilityLabel="Horário"
                          style={styles.inputHorario}
                        />
                      </View>
                      {erroDoHorario ? (
                        <Text style={styles.erroHorario} accessibilityLiveRegion="polite">
                          {erroDoHorario}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <Text style={styles.rotulo}>Quando</Text>
                  <View
                    style={styles.pilulas}
                    accessibilityRole="radiogroup"
                    accessibilityLabel="Dia"
                  >
                    {(['hoje', 'ontem'] as const).map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => {
                          setDia(d);
                          setSalvoAs(null);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: dia === d }}
                        style={[styles.pilula, dia === d && styles.pilulaAtiva]}
                      >
                        <Text style={[styles.pilulaTexto, dia === d && styles.pilulaTextoAtivo]}>
                          {d === 'hoje' ? 'Hoje' : 'Ontem'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {tipo === 'febre' ? (
                    <FormField
                      label="Temperatura (°C)"
                      value={temperatura}
                      onChangeText={(v) => {
                        setTemperatura(v);
                        setSalvoAs(null);
                      }}
                      placeholder="37,8"
                      keyboardType="decimal-pad"
                      maxLength={5}
                      hint="Opcional. Se você mediu, anote aqui."
                      error={erroDaTemperatura}
                      aviso={avisoDaTemperatura}
                      editable={!salvando}
                    />
                  ) : null}

                  <FormField
                    label="Observações"
                    value={nota}
                    onChangeText={(v) => {
                      setNota(v);
                      setSalvoAs(null);
                    }}
                    placeholder="Conte como você está se sentindo..."
                    maxLength={500}
                    multiline
                    editable={!salvando}
                  />

                  <PrimaryButton
                    title="Salvar registro"
                    tom="terracota"
                    onPress={() => void salvar()}
                    loading={salvando}
                    disabled={!podeSalvar || salvando}
                  />

                  {intensidade == null ? (
                    <Text style={styles.apoioDoBotao}>
                      {definicao.direcao === 'melhor'
                        ? `${definicao.nomeDaEscala} para salvar.`
                        : 'Escolha a intensidade para salvar.'}
                    </Text>
                  ) : null}

                  {salvoAs ? (
                    <Text style={styles.salvo} accessibilityLiveRegion="polite">
                      Registro salvo às {salvoAs}.
                    </Text>
                  ) : null}
                </SurfaceCard>
              </>
            ) : null}

            <View style={styles.secao}>
              <SectionHeader title="Histórico recente" />
            </View>

            {erroDoHistorico ? (
              <SurfaceCard style={styles.cartaoCentral}>
                <Text style={styles.ajuda}>Não consegui carregar o histórico agora.</Text>
                <Pressable
                  onPress={() => void carregarHistorico(perfilId)}
                  accessibilityRole="button"
                  hitSlop={12}
                >
                  <Text style={styles.link}>Tentar de novo</Text>
                </Pressable>
              </SurfaceCard>
            ) : registros.length === 0 ? (
              <Text style={styles.vazio}>Seu primeiro registro aparece aqui.</Text>
            ) : (
              <SurfaceCard style={styles.bloco}>
                {mostrarGrafico && definicao ? (
                  <>
                    <GraficoDeBarras
                      barras={barras}
                      maximo={5}
                      titulo={`${definicao.rotulo} nos últimos ${dias} dias`}
                      legenda={legendaDoGrafico(definicao)}
                      descricaoAcessivel={descricaoDoGrafico(barras, definicao)}
                    />
                    <View style={styles.divisor} />
                  </>
                ) : null}

                {/*
                  Linha do tempo: um trilho vertical liga os pontos. O mais
                  recente em terracota, os demais em verde. O trilho e feito
                  de dois segmentos por linha (acima e abaixo do ponto) para
                  nao passar do primeiro nem do ultimo.
                */}
                {visiveis.map((r, i) => (
                  <Pressable
                    key={r.id}
                    onPress={() => apagar(r)}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`${momentoDoRegistro(r, agora)}. ${descricaoDoRegistro(r)}.${r.note ? ` Observação: ${r.note}.` : ''}`}
                    accessibilityHint="Toque para apagar este registro."
                    style={({ pressed }) => [styles.linha, pressed && styles.pressionado]}
                  >
                    <View style={styles.trilhoDaLinha}>
                      {i > 0 ? <View style={[styles.trilho, styles.trilhoAcima]} /> : null}
                      {i < visiveis.length - 1 ? (
                        <View style={[styles.trilho, styles.trilhoAbaixo]} />
                      ) : null}
                      <View style={[styles.ponto, i === 0 && styles.pontoRecente]} />
                    </View>
                    <View style={styles.linhaTextos}>
                      <Text style={styles.linhaQuando}>{momentoDoRegistro(r, agora)}</Text>
                      <Text style={styles.linhaDescricao}>{descricaoDoRegistro(r)}</Text>
                      {r.note ? (
                        <Text style={styles.linhaNota} numberOfLines={2}>
                          {r.note}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}

                {!todos && registros.length > VISIVEIS ? (
                  <Pressable
                    onPress={() => setTodos(true)}
                    accessibilityRole="button"
                    hitSlop={12}
                    style={styles.mostrarMais}
                  >
                    <View style={styles.verMais}>
                      <Text style={styles.verMaisTexto}>Ver histórico completo</Text>
                      <Feather name="chevron-right" size={16} color={colors.sectionTitle} />
                    </View>
                  </Pressable>
                ) : null}
              </SurfaceCard>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  conteudo: { paddingHorizontal: spacing.xl },
  carregando: { marginTop: spacing.xxl },
  seletor: { marginTop: spacing.lg },
  secao: { marginTop: spacing.xxl },
  bloco: { padding: spacing.lg, marginTop: spacing.lg },

  blocoTitulo: {
    fontFamily: fonts.bold,
    fontSize: 19,
    color: colors.sectionTitle,
    marginBottom: spacing.lg,
  },
  grade: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  item: { width: '33.33%', alignItems: 'center', paddingVertical: spacing.sm },
  circulo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pillTablet,
  },
  circuloAtivo: { backgroundColor: colors.chipActive },
  itemRotulo: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  itemRotuloAtivo: { fontFamily: fonts.extrabold, color: colors.sectionTitle },
  apoio: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },

  rotulo: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.sectionTitle,
    marginBottom: spacing.sm,
  },
  pilulas: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  // Medidas copiadas do DateTimePickerCard: o padrao ja provado dentro de
  // cartao creme.
  pilula: {
    backgroundColor: colors.onAccent,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(57, 67, 44, 0.12)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pilulaAtiva: { backgroundColor: colors.accentGreen, borderColor: colors.accentGreen },
  pilulaTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  pilulaTextoAtivo: { color: colors.onAccent },
  duasColunas: { flexDirection: 'row', marginBottom: spacing.sm },
  empilhadas: { flexDirection: 'column' },
  // A escala tem largura fixa (cinco bolinhas); quem cede e o horario.
  colunaEscala: { flexShrink: 0 },
  divisorVertical: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  colunaHorario: { flex: 1, minWidth: 96, marginBottom: spacing.lg },
  pilulaHorario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.onAccent,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(57, 67, 44, 0.12)',
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  pilulaErro: { borderColor: colors.textError },
  inputHorario: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  erroHorario: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textError,
    marginTop: spacing.xs,
  },

  apoioDoBotao: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  salvo: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.accentGreen,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  divisor: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginVertical: spacing.lg,
  },
  // Sem padding vertical na linha: o trilho precisa encostar nas bordas para
  // emendar com o da linha vizinha. O respiro fica nos textos.
  linha: { flexDirection: 'row', minHeight: 56 },
  trilhoDaLinha: { width: 24, alignItems: 'center', paddingTop: spacing.md + 4 },
  trilho: {
    position: 'absolute',
    width: 2,
    left: 11,
    backgroundColor: colors.pillTablet,
  },
  // O centro do ponto fica em spacing.md + 4 + 6.
  trilhoAcima: { top: 0, height: spacing.md + 10 },
  trilhoAbaixo: { top: spacing.md + 10, bottom: 0 },
  ponto: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.pillTabletIcon },
  pontoRecente: { backgroundColor: colors.terracotta },
  linhaTextos: { flex: 1, marginLeft: spacing.sm, paddingVertical: spacing.md },
  linhaQuando: { fontFamily: fonts.bold, fontSize: 15, color: colors.sectionTitle },
  linhaDescricao: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 1,
  },
  linhaNota: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textPlaceholder,
    marginTop: 2,
  },
  pressionado: { opacity: 0.85 },
  mostrarMais: { marginTop: spacing.sm },
  verMais: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.pillTablet,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
  },
  verMaisTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.sectionTitle },

  cartaoCentral: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.lg },
  ajuda: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  link: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.accentGreen,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  vazio: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
  },
});
