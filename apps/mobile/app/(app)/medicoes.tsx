import { Feather } from '@expo/vector-icons';
import {
  descricaoDaMedicao,
  descricaoDaSerie,
  MOMENTOS_DA_GLICEMIA,
  serieDoGrafico,
  TEXTO_DO_AVISO_EXTREMO,
  tipoDeMedicao,
  TIPOS_DE_MEDICAO,
  validarMedicao,
  valorExtremo,
  type Campo,
} from '@gestao/shared/lib/medicoes';
import { diaCurto } from '@gestao/shared/lib/posologia';
import { blocosDoPeriodo, periodoDosUltimos } from '@gestao/shared/lib/relatorio';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
import {
  healthApi,
  type GlucoseContext,
  type Measurement,
  type MeasurementKind,
  type Profile,
} from '@/api/health';
import { BlocoDeAviso } from '@/components/BlocoDeAviso';
import { FormField } from '@/components/FormField';
import { GraficoDeMedicoes } from '@/components/GraficoDeMedicoes';
import { Icone, type NomeIcone } from '@/components/Icone';
import { LADRILHO_NEUTRO } from '@/components/IconTile';
import { OpcaoDeFoto } from '@/components/OpcaoDeFoto';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProfileSelector } from '@/components/ProfileSelector';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SeloDaIA } from '@/components/SeloDaIA';
import { SurfaceCard } from '@/components/SurfaceCard';
import { useAssinaturaExigida, useAvisos, usePlano } from '@/lib/avisosContext';
import { formatarHora, horaValida, momentoEscolhido } from '@/lib/diarioDeSintomas';
import { pedirFotoDeDocumento } from '@/lib/foto';
import { hora } from '@/lib/posologia';
import { API_ERROR, messageForError } from '@gestao/shared';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/** Mesmo nome e valor das outras telas; aqui a barra some, mas o rodape continua. */
const ESPACO_BARRA = 96;
/** A tela busca 90 dias de uma vez (tres blocos de 31); 7 e 30 sao recortes. */
const DIAS_BUSCADOS = 90;
const PERIODOS = [7, 30, 90] as const;
const VISIVEIS = 6;

type Textos = Partial<Record<Campo, string>>;

const mensagem = (e: unknown) => messageForError(e instanceof ApiRequestError ? e.code : undefined);
const quandoTexto = (iso: string) => {
  const d = new Date(iso);
  return `${diaCurto(d)} às ${hora(d)}`;
};

/**
 * Medicoes: pressao, glicemia, peso e oxigenacao de cada pessoa.
 *
 * A MESMA tela da web (apps/web/src/telas/Medicoes.tsx), com a validacao, os
 * textos, a serie do grafico e o aviso extremo vindos de lib/medicoes do
 * shared. Rota irma das abas, com a barra escondida, como o Diario de sintomas.
 *
 * Registrar e ver e GRATIS. A assinatura so libera "Fotografar o visor": a IA
 * le os numeros do aparelho e preenche os campos, e a pessoa confere antes de
 * salvar. Quem barra de verdade e o servidor (403).
 *
 * REFERENCIA SEM VEREDITO: o grafico mostra a faixa usual com a fonte, e
 * nenhum valor e chamado de alto ou baixo. So um valor extremo traz o aviso
 * neutro com o 192.
 */
export default function MedicoesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ pessoa?: string }>();
  const { premium } = usePlano();
  const tratarAssinatura = useAssinaturaExigida();
  const { avisos, parcial, erro: erroDosAvisos } = useAvisos();
  const politicaVelha =
    !parcial && !erroDosAvisos && avisos.some((a) => a.tipo === 'politica-desatualizada');

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [medicoes, setMedicoes] = useState<Measurement[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erroDoHistorico, setErroDoHistorico] = useState<string | null>(null);

  const [tipoChave, setTipoChave] = useState<MeasurementKind>('pressao');
  const tipo = tipoDeMedicao(tipoChave)!;
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [textos, setTextos] = useState<Textos>({});
  const [momento, setMomento] = useState<GlucoseContext | null>(null);
  const [dia, setDia] = useState<'hoje' | 'ontem'>('hoje');
  const [horario, setHorario] = useState(() => hora(new Date()));
  const [nota, setNota] = useState('');
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salva, setSalva] = useState<Measurement | null>(null);
  const [todos, setTodos] = useState(false);

  const [daFoto, setDaFoto] = useState<Set<Campo>>(new Set());
  const [lendo, setLendo] = useState(false);
  const [erroDaFoto, setErroDaFoto] = useState<string | null>(null);
  const [limiteDaFoto, setLimiteDaFoto] = useState(false);
  const cancelamento = useRef<AbortController | null>(null);
  const abandonado = useRef(false);

  const agora = new Date();
  const empilhar = PixelRatio.getFontScale() >= 1.3;

  const carregarPessoas = useCallback(async () => {
    try {
      const lista = await healthApi.listProfiles();
      setPerfis(lista);
      setErroGeral(null);
      setPerfilId((atual) => {
        if (atual) return atual;
        const pedida = params.pessoa && lista.some((p) => p.id === params.pessoa) ? params.pessoa : null;
        return pedida ?? lista.find((p) => p.isAccountHolder)?.id ?? lista[0]?.id ?? null;
      });
    } catch (e) {
      // NUNCA setPerfis([]) numa falha: a tela diria "cadastre alguem" para
      // quem tem a familia inteira cadastrada.
      setErroGeral(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }, [params.pessoa]);

  const carregarMedicoes = useCallback(async (quem: string | null) => {
    if (!quem) return;
    setErroDoHistorico(null);
    setBuscando(true);
    try {
      const { inicio, fim } = periodoDosUltimos(DIAS_BUSCADOS, new Date());
      const blocos = await Promise.all(
        blocosDoPeriodo(inicio, fim).map((b) =>
          healthApi.listMeasurements({ profileId: quem, from: b.de, to: b.ate }),
        ),
      );
      const vistos = new Set<string>();
      setMedicoes(
        blocos
          .flat()
          .filter((m) => !vistos.has(m.id) && vistos.add(m.id))
          .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)),
      );
    } catch (e) {
      setErroDoHistorico(mensagem(e));
    } finally {
      setBuscando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregarPessoas();
    }, [carregarPessoas]),
  );

  useFocusEffect(
    useCallback(() => {
      void carregarMedicoes(perfilId);
    }, [carregarMedicoes, perfilId]),
  );

  // Sair da tela cancela a leitura: a resposta que chegar depois nao preenche
  // o formulario de ninguem.
  useFocusEffect(
    useCallback(() => {
      abandonado.current = false;
      return () => {
        abandonado.current = true;
        cancelamento.current?.abort();
      };
    }, []),
  );

  function limparFormulario() {
    setTextos({});
    setMomento(null);
    setNota('');
    setTentou(false);
    setDaFoto(new Set());
    setErroDaFoto(null);
  }

  function trocarPessoa(id: string | null) {
    cancelamento.current?.abort();
    setPerfilId(id);
    // Deixar na tela as medicoes da pessoa anterior seria mentira.
    setMedicoes([]);
    setSalva(null);
    setTodos(false);
    limparFormulario();
  }

  function trocarTipo(novo: MeasurementKind) {
    if (novo === tipoChave) return;
    cancelamento.current?.abort();
    setTipoChave(novo);
    setSalva(null);
    setTodos(false);
    limparFormulario();
  }

  function digitar(campo: Campo, valor: string) {
    setTextos((t) => ({ ...t, [campo]: valor }));
    setSalva(null);
    // Mexeu no numero: e o ato de conferir, deixa de ser "da foto".
    if (daFoto.has(campo)) {
      setDaFoto((s) => {
        const n = new Set(s);
        n.delete(campo);
        return n;
      });
    }
  }

  const { valores, erros } = validarMedicao(tipo, textos);
  const erroVisivel = (c: Campo) => (tentou || (textos[c] ?? '').trim() !== '' ? erros[c] : undefined);
  const faltaMomento = tipoChave === 'glicemia' && !momento;

  const quando = horaValida(horario) ? momentoEscolhido(dia, horario, agora) : null;
  const erroDoHorario = !horaValida(horario)
    ? 'Informe a hora, como 14:30.'
    : quando && quando > agora
      ? `Ainda não são ${horario}. Confira o horário.`
      : undefined;

  const valido = Object.keys(erros).length === 0 && !faltaMomento && !erroDoHorario;

  async function salvar() {
    setTentou(true);
    if (!valido || !quando || !perfilId) return;
    setSalvando(true);
    try {
      const criada = await healthApi.createMeasurement({
        profileId: perfilId,
        kind: tipoChave,
        measuredAt: quando.toISOString(),
        note: nota.trim() || null,
        source: daFoto.size > 0 ? 'foto' : 'manual',
        ...valores,
        ...(tipoChave === 'glicemia' ? { glucoseContext: momento } : {}),
      });
      // Entra na lista na hora: e o que prova que caiu.
      setMedicoes((atual) =>
        [criada, ...atual].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)),
      );
      limparFormulario();
      setDia('hoje');
      setHorario(hora(new Date()));
      setSalva(criada);
    } catch (e) {
      Alert.alert('Não consegui salvar', mensagem(e));
    } finally {
      setSalvando(false);
    }
  }

  function apagar(m: Measurement) {
    Alert.alert('Apagar esta medição?', `${quandoTexto(m.measuredAt)}: ${descricaoDaMedicao(m)}`, [
      { text: 'Fechar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          try {
            await healthApi.deleteMeasurement(m.id);
            setMedicoes((atual) => atual.filter((x) => x.id !== m.id));
            if (salva?.id === m.id) setSalva(null);
          } catch (e) {
            Alert.alert('Não consegui apagar', mensagem(e));
          }
        },
      },
    ]);
  }

  function escolherOrigem() {
    Alert.alert('Fotografar o visor', 'De onde vem a foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto', onPress: () => void fotografar('camera') },
      { text: 'Escolher da galeria', onPress: () => void fotografar('galeria') },
    ]);
  }

  async function fotografar(origem: 'camera' | 'galeria') {
    setErroDaFoto(null);
    // Permissao e falha ao preparar a foto ja sao avisadas pelo helper.
    const foto = await pedirFotoDeDocumento(origem);
    if (!foto || abandonado.current) return;

    const kind = tipoChave;
    const definicao = tipo;
    const controller = new AbortController();
    cancelamento.current = controller;
    setLendo(true);
    try {
      const leitura = await healthApi.lerVisor({ photo: foto, kind, profileId: perfilId }, controller.signal);
      if (abandonado.current) return;
      const novos: Textos = {};
      const lidos = new Set<Campo>();
      for (const c of definicao.campos) {
        const v = leitura[c.campo];
        if (v != null) {
          novos[c.campo] = String(v).replace('.', ',');
          lidos.add(c.campo);
        }
      }
      setTextos(novos);
      setDaFoto(lidos);
      setSalva(null);
    } catch (e) {
      // Foi a propria pessoa que cancelou (ou saiu da tela): sem mensagem.
      if (abandonado.current || controller.signal.aborted) return;
      if (tratarAssinatura(e)) return;
      if (e instanceof ApiRequestError && e.code === API_ERROR.PHOTO_READ_LIMIT_REACHED) setLimiteDaFoto(true);
      setErroDaFoto(
        e instanceof ApiRequestError && e.status === 504
          ? messageForError(API_ERROR.PHOTO_READ_TIMEOUT)
          : mensagem(e),
      );
    } finally {
      cancelamento.current = null;
      if (!abandonado.current) setLendo(false);
    }
  }

  const ultimaDe = (k: MeasurementKind) => medicoes.find((m) => m.kind === k) ?? null;

  const { inicio, fim } = periodoDosUltimos(dias, agora);
  const doPeriodo = medicoes.filter(
    (m) => m.kind === tipoChave && new Date(m.measuredAt) >= inicio && new Date(m.measuredAt) <= fim,
  );
  const serie = serieDoGrafico(doPeriodo, tipo, inicio, fim);
  const visiveis = todos ? doPeriodo : doPeriodo.slice(0, VISIVEIS);
  const ocupado = salvando || lendo;

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.medications} />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + ESPACO_BARRA },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Medições" titleLines={2} onBack={() => router.back()} mostrarSino />

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
            <Text style={styles.ajuda}>Cadastre alguém na sua família para começar a registrar.</Text>
            <Pressable onPress={() => router.push('/conta/familia')} accessibilityRole="button" hitSlop={12}>
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
                tituloDoPainel="Medições de"
                permitirTodos={false}
              />
            </View>

            {/* Um cartao por tipo, com a ultima medicao. A cor carrega SELECAO. */}
            <View style={styles.tipos} accessibilityRole="radiogroup" accessibilityLabel="Tipo de medição">
              {TIPOS_DE_MEDICAO.map((t) => {
                const ativo = t.chave === tipoChave;
                const ultima = ultimaDe(t.chave);
                const valor = buscando && !medicoes.length ? '…' : ultima ? descricaoDaMedicao(ultima) : 'Sem medição';
                return (
                  <View key={t.chave} style={styles.tipoCelula}>
                    <Pressable
                      onPress={() => trocarTipo(t.chave)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: ativo }}
                      accessibilityLabel={`${t.rotulo}. ${ultima ? `Última: ${valor}, ${quandoTexto(ultima.measuredAt)}` : valor}`}
                      style={[styles.tipo, ativo && styles.tipoAtivo]}
                    >
                      <View style={[styles.tipoIcone, ativo && styles.tipoIconeAtivo]}>
                        <Icone
                          nome={t.icone as NomeIcone}
                          size={20}
                          color={ativo ? colors.onAccent : colors.pillTabletIcon}
                        />
                      </View>
                      <Text style={styles.tipoRotulo}>{t.rotulo}</Text>
                      <Text style={styles.tipoValor}>{valor}</Text>
                      {ultima ? <Text style={styles.tipoQuando}>{quandoTexto(ultima.measuredAt)}</Text> : null}
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={styles.secao}>
              <SectionHeader title={`Registrar ${tipo.rotulo.toLowerCase()}`} />
            </View>

            {/* Sem plano a politica nao e o que impede a leitura: o aviso dela
                so confundiria quem ve o cadeado logo abaixo. */}
            {politicaVelha && premium ? (
              <View style={styles.bloco}>
                <BlocoDeAviso
                  tom="atencao"
                  icone="shield"
                  titulo="Para ler a foto, falta seu aceite na política nova"
                  texto="A leitura usa um parceiro fora do Brasil, e isso está descrito na versão atual da política. Digitar continua normal."
                  acaoPrincipal={{
                    rotulo: 'Ver a política',
                    estilo: 'contorno',
                    onPress: () => router.push('/conta/privacidade'),
                  }}
                />
              </View>
            ) : null}

            <SurfaceCard style={styles.bloco}>
              {lendo ? (
                <View style={styles.lendo} accessibilityLiveRegion="polite">
                  <ActivityIndicator color={colors.accentGreen} />
                  <Text style={styles.lendoTexto}>Lendo os números do visor…</Text>
                  <Pressable
                    onPress={() => cancelamento.current?.abort()}
                    accessibilityRole="button"
                    hitSlop={12}
                  >
                    <Text style={styles.cancelar}>Cancelar</Text>
                  </Pressable>
                </View>
              ) : (
                <OpcaoDeFoto
                  icone="camera"
                  ladrilho={LADRILHO_NEUTRO}
                  titulo="Fotografar o visor"
                  descricao="A IA lê os números do aparelho"
                  desabilitado={premium && (politicaVelha || limiteDaFoto || salvando)}
                  motivoDesabilitado={
                    limiteDaFoto ? 'Limite de leituras de hoje atingido' : 'Disponível depois que você aceitar a política atual'
                  }
                  cadeado={!premium}
                  onPress={() => (premium ? escolherOrigem() : router.push('/conta/assinatura'))}
                />
              )}
              <Text
                style={erroDaFoto ? styles.erro : styles.apoio}
                accessibilityLiveRegion={erroDaFoto ? 'polite' : undefined}
              >
                {erroDaFoto ??
                  (premium
                    ? 'Você confere com o visor antes de salvar. A foto não é guardada.'
                    : 'Faz parte da assinatura. Digitar é sempre grátis.')}
              </Text>

              <View style={[styles.campos, empilhar && styles.empilhados]}>
                {tipo.campos.map((c) => (
                  <View key={c.campo} style={[styles.campo, empilhar && styles.campoInteiro]}>
                    <FormField
                      label={c.opcional ? `${c.rotulo} — opcional` : c.rotulo}
                      value={textos[c.campo] ?? ''}
                      onChangeText={(v) => digitar(c.campo, v)}
                      keyboardType={c.decimal ? 'decimal-pad' : 'number-pad'}
                      maxLength={6}
                      selo={daFoto.has(c.campo) ? <SeloDaIA /> : undefined}
                      aviso={daFoto.has(c.campo) ? 'Lido da foto. Confira com o visor.' : undefined}
                      error={erroVisivel(c.campo)}
                      editable={!ocupado}
                    />
                  </View>
                ))}
              </View>

              {tipoChave === 'glicemia' ? (
                <>
                  <Text style={styles.rotulo}>Quando foi medida</Text>
                  <View style={styles.pilulas} accessibilityRole="radiogroup" accessibilityLabel="Momento da glicemia">
                    {MOMENTOS_DA_GLICEMIA.map((m) => (
                      <Pressable
                        key={m.chave}
                        onPress={() => {
                          setMomento(m.chave);
                          setSalva(null);
                        }}
                        disabled={ocupado}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: momento === m.chave }}
                        style={[styles.pilula, momento === m.chave && styles.pilulaAtiva]}
                      >
                        <Text style={[styles.pilulaTexto, momento === m.chave && styles.pilulaTextoAtivo]}>
                          {m.rotulo}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {tentou && faltaMomento ? (
                    <Text style={styles.erroMomento} accessibilityLiveRegion="polite">
                      Escolha o momento da medição.
                    </Text>
                  ) : null}
                </>
              ) : null}

              <View style={[styles.duasColunas, empilhar && styles.empilhados]}>
                <View style={styles.colunaDia}>
                  <Text style={styles.rotulo}>Dia</Text>
                  <View style={styles.pilulas} accessibilityRole="radiogroup" accessibilityLabel="Dia">
                    {(['hoje', 'ontem'] as const).map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => {
                          setDia(d);
                          setSalva(null);
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
                </View>

                <View style={styles.colunaHorario}>
                  <Text style={styles.rotulo}>Horário</Text>
                  <View style={[styles.pilulaHorario, !!erroDoHorario && styles.pilulaErro]}>
                    <Feather name="clock" size={18} color={colors.sectionTitle} />
                    <TextInput
                      value={horario}
                      onChangeText={(v) => {
                        setHorario(formatarHora(v));
                        setSalva(null);
                      }}
                      placeholder="14:30"
                      placeholderTextColor={colors.textPlaceholder}
                      keyboardType="number-pad"
                      maxLength={5}
                      editable={!ocupado}
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

              <FormField
                label="Observações"
                value={nota}
                onChangeText={(v) => {
                  setNota(v);
                  setSalva(null);
                }}
                placeholder="Ex.: medi sentado, depois do café"
                maxLength={500}
                multiline
                editable={!ocupado}
              />

              <PrimaryButton
                title="Salvar medição"
                tom="terracota"
                onPress={() => void salvar()}
                loading={salvando}
                disabled={!perfilId || ocupado}
              />

              {salva ? (
                <Text style={styles.salvo} accessibilityLiveRegion="polite">
                  Medição salva: {descricaoDaMedicao(salva)}.
                </Text>
              ) : null}
            </SurfaceCard>

            {/* Aviso neutro, so para valor extremo: nao diagnostica, so lembra
                para onde ligar. */}
            {salva && valorExtremo(salva) ? (
              <View style={styles.bloco}>
                <BlocoDeAviso tom="atencao" icone="phone" titulo="Observe como a pessoa está" texto={TEXTO_DO_AVISO_EXTREMO} />
              </View>
            ) : null}

            <View style={styles.secao}>
              <SectionHeader title="Histórico" />
            </View>

            <SurfaceCard style={styles.bloco}>
              <View style={styles.pilulas} accessibilityRole="radiogroup" accessibilityLabel="Período do gráfico">
                {PERIODOS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => {
                      setDias(p);
                      setTodos(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: dias === p }}
                    style={[styles.pilula, dias === p && styles.pilulaAtiva]}
                  >
                    <Text style={[styles.pilulaTexto, dias === p && styles.pilulaTextoAtivo]}>{p} dias</Text>
                  </Pressable>
                ))}
              </View>

              {buscando && !medicoes.length ? (
                <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
              ) : erroDoHistorico && !medicoes.length ? (
                <View style={styles.centro}>
                  <Text style={styles.ajuda}>Não consegui carregar as medições agora.</Text>
                  <Pressable
                    onPress={() => void carregarMedicoes(perfilId)}
                    accessibilityRole="button"
                    hitSlop={12}
                  >
                    <Text style={styles.link}>Tentar de novo</Text>
                  </Pressable>
                </View>
              ) : doPeriodo.length === 0 ? (
                <Text style={styles.vazio}>
                  Nenhuma medição de {tipo.rotulo.toLowerCase()} nos últimos {dias} dias. A primeira que você salvar
                  aparece aqui, no gráfico.
                </Text>
              ) : (
                <>
                  <GraficoDeMedicoes serie={serie} descricao={descricaoDaSerie(serie, dias)} />
                  <View style={styles.divisor} />

                  {visiveis.map((m, i) => (
                    <Pressable
                      key={m.id}
                      onPress={() => apagar(m)}
                      accessibilityRole="button"
                      accessibilityLabel={`${quandoTexto(m.measuredAt)}. ${descricaoDaMedicao(m)}.${m.note ? ` Observação: ${m.note}.` : ''}`}
                      accessibilityHint="Toque para apagar esta medição."
                      style={({ pressed }) => [styles.linha, i > 0 && styles.linhaComBorda, pressed && styles.pressionado]}
                    >
                      <View style={styles.linhaTextos}>
                        <Text style={styles.linhaQuando}>
                          {quandoTexto(m.measuredAt)}
                          {m.source === 'foto' ? ' · lida da foto' : ''}
                        </Text>
                        <Text style={styles.linhaValor}>{descricaoDaMedicao(m)}</Text>
                        {m.note ? (
                          <Text style={styles.linhaNota} numberOfLines={2}>
                            {m.note}
                          </Text>
                        ) : null}
                      </View>
                      <Feather name="trash-2" size={18} color={colors.textSecondary} />
                    </Pressable>
                  ))}

                  {!todos && doPeriodo.length > VISIVEIS ? (
                    <Pressable
                      onPress={() => setTodos(true)}
                      accessibilityRole="button"
                      hitSlop={12}
                      style={styles.mostrarMais}
                    >
                      <View style={styles.verMais}>
                        <Text style={styles.verMaisTexto}>Ver todas ({doPeriodo.length})</Text>
                        <Feather name="chevron-right" size={16} color={colors.sectionTitle} />
                      </View>
                    </Pressable>
                  ) : null}
                </>
              )}
            </SurfaceCard>

            <Pressable onPress={() => router.push('/relatorio')} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.nota}>
                As medições também entram no <Text style={styles.notaLink}>relatório para o médico</Text>.
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  conteudo: { paddingHorizontal: spacing.xl },
  carregando: { marginVertical: spacing.xl },
  seletor: { marginTop: spacing.lg },
  secao: { marginTop: spacing.xxl },
  bloco: { padding: spacing.lg, marginTop: spacing.lg },

  tipos: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg, marginHorizontal: -spacing.xs },
  tipoCelula: { width: '50%', padding: spacing.xs },
  tipo: {
    flex: 1,
    minHeight: 120,
    padding: spacing.md,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.onAccent,
  },
  tipoAtivo: { borderColor: colors.accentGreen },
  tipoIcone: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pillTablet,
    marginBottom: spacing.sm,
  },
  tipoIconeAtivo: { backgroundColor: colors.accentGreen },
  tipoRotulo: { fontFamily: fonts.bold, fontSize: 14, color: colors.sectionTitle },
  tipoValor: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textPrimary, marginTop: 2 },
  tipoQuando: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  lendo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.pillTablet,
  },
  lendoTexto: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.sectionTitle },
  cancelar: { fontFamily: fonts.bold, fontSize: 15, color: colors.accentGreen },
  apoio: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  erro: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textError,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },

  campos: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  campo: { width: '50%', paddingHorizontal: spacing.xs },
  campoInteiro: { width: '100%' },
  empilhados: { flexDirection: 'column' },

  rotulo: { fontFamily: fonts.bold, fontSize: 14, color: colors.sectionTitle, marginBottom: spacing.sm },
  pilulas: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
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
  erroMomento: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textError,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },

  duasColunas: { flexDirection: 'row', gap: spacing.lg },
  colunaDia: { flexShrink: 0 },
  colunaHorario: { flex: 1, minWidth: 110, marginBottom: spacing.lg },
  pilulaHorario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.onAccent,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(57, 67, 44, 0.12)',
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  pilulaErro: { borderColor: colors.textError },
  inputHorario: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  erroHorario: { fontFamily: fonts.regular, fontSize: 13, color: colors.textError, marginTop: spacing.xs },

  salvo: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.accentGreen,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  divisor: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: spacing.lg },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  linhaComBorda: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  linhaTextos: { flex: 1 },
  linhaQuando: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  linhaValor: { fontFamily: fonts.bold, fontSize: 15, color: colors.sectionTitle, marginTop: 1 },
  linhaNota: { fontFamily: fonts.regular, fontSize: 13, color: colors.textPlaceholder, marginTop: 2 },
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

  centro: { alignItems: 'center' },
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
    lineHeight: 20,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
  },
  nota: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  notaLink: { fontFamily: fonts.bold, color: colors.accentGreen },
});
