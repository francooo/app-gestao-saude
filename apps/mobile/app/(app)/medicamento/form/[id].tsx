import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
  type Medication,
  type Professional,
  type Profile,
  type ScheduleType,
} from '@/api/health';
import { FormField } from '@/components/FormField';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
// FORMAS e INTERVALOS moraram aqui ate a leitura por foto existir. Saíram
// porque o normalizador da leitura precisa EXATAMENTE da lista que esta tela
// oferece, e uma segunda copia seria divergencia garantida.
import { SeloDaIA } from '@/components/SeloDaIA';
import { sincronizarLembretesDeUmMedicamento } from '@/lib/reminders';
import {
  camposVazios,
  consumirRascunho,
  descartarRascunho,
  FORMAS,
  INTERVALOS,
  marcarCadastroConcluido,
  type CampoLido,
} from '@/lib/rascunhoDeMedicamento';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

const TIPOS: { valor: ScheduleType; rotulo: string; ajuda: string }[] = [
  { valor: 'interval', rotulo: 'A cada X horas', ajuda: 'Ex.: de 8 em 8 horas' },
  { valor: 'fixed_times', rotulo: 'Horários fixos', ajuda: 'Ex.: 08:00 e 20:00' },
  { valor: 'as_needed', rotulo: 'Se necessário', ajuda: 'Sem horário, só quando precisar' },
];

export default function MedicamentoFormScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, rascunho } = useLocalSearchParams<{ id: string; rascunho?: string }>();
  const novo = id === 'novo';

  const [carregando, setCarregando] = useState(!novo);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [medicos, setMedicos] = useState<Professional[]>([]);

  /**
   * ANTES DE ACRESCENTAR O PROXIMO CAMPO: ele precisa entrar em `camposVazios()`
   * e em `aplicarRascunho()` tambem. Um campo que so nasce aqui sobrevive de uma
   * visita para a outra quando a tela e reaproveitada sem remontar, e aparece
   * preenchido sem a pessoa ter digitado nada agora.
   */
  const inicial = camposVazios();
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [nome, setNome] = useState(inicial.nome);
  const [concentracao, setConcentracao] = useState(inicial.concentracao);
  const [forma, setForma] = useState<(typeof FORMAS)[number]>(inicial.forma);
  const [quantidade, setQuantidade] = useState(inicial.quantidade);
  const [embalagem, setEmbalagem] = useState(inicial.embalagem);
  const [tipo, setTipo] = useState<ScheduleType>(inicial.tipo);
  const [intervalo, setIntervalo] = useState<number>(inicial.intervalo);
  const [horarios, setHorarios] = useState<string[]>(inicial.horarios);
  const [instrucoes, setInstrucoes] = useState(inicial.instrucoes);
  const [prescritorId, setPrescritorId] = useState<string | null>(null);
  const [fimDoTratamento, setFimDoTratamento] = useState<string | null>(null);

  /**
   * Quais campos vieram da leitura por foto e AINDA NAO FORAM CONFERIDOS.
   *
   * Um conjunto, e nao um booleano por campo: doze booleanos seriam doze
   * useState e doze chances de esquecer um. Nada disto e persistido — o selo e
   * mecanismo de revisao, nao metadado do remedio.
   */
  const [camposDaIA, setCamposDaIA] = useState<Set<CampoLido>>(new Set());

  /**
   * A foto lida, e se a pessoa quer guarda-la como receita.
   *
   * Um objeto e nao dois estados: os dois nascem e morrem juntos, e separados
   * abririam o estado impossivel "quer guardar, mas nao tem foto".
   */
  const [receita, setReceita] = useState<{ foto: string; guardar: boolean } | null>(null);
  const [origemDaLeitura, setOrigemDaLeitura] = useState<{ readId: string; item: number } | null>(
    null,
  );

  /** Editar e o ato de conferir: o selo some no primeiro toque no campo. */
  function conferido(campo: CampoLido) {
    setCamposDaIA((atual) => {
      if (!atual.has(campo)) return atual;
      const novo = new Set(atual);
      novo.delete(campo);
      return novo;
    });
  }

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [listaPerfis, listaMedicos] = await Promise.all([
          healthApi.listProfiles(),
          healthApi.listProfessionals(),
        ]);
        if (cancelado) return;
        setPerfis(listaPerfis);
        setMedicos(listaMedicos);
        // Titular como padrao: e quem mais cadastra remedio para si.
        if (novo) setPerfilId(listaPerfis.find((p) => p.isAccountHolder)?.id ?? listaPerfis[0]?.id ?? null);

        if (!novo) {
          const m = await healthApi.getMedication(id!);
          if (cancelado) return;
          preencher(m);
        }
      } catch (e) {
        if (!cancelado) setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [id, novo]);

  /**
   * Consome o rascunho da leitura por foto.
   *
   * Efeito SEPARADO do carregamento, e sincrono. Depende de [novo, rascunho] e
   * nao so da montagem porque chegar aqui por NAVIGATE nao remonta o
   * componente — com um token novo, e preciso reaplicar.
   *
   * So no cadastro: um rascunho nunca pode cair sobre um remedio que ja existe
   * e sobrescrever o que a pessoa tinha.
   */
  useEffect(() => {
    if (!novo || !rascunho) return;
    const r = consumirRascunho(rascunho);
    if (!r) return;

    // Escreve TODOS os campos, inclusive os que o rascunho nao traz: um patch
    // parcial misturaria, numa segunda visita, o que foi digitado antes com o
    // que veio da leitura — sem marcacao, porque nao veio da IA, e sem a
    // pessoa ter digitado agora.
    setNome(r.campos.nome);
    setConcentracao(r.campos.concentracao);
    setForma(r.campos.forma);
    setQuantidade(r.campos.quantidade);
    setEmbalagem(r.campos.embalagem);
    setTipo(r.campos.tipo);
    setIntervalo(r.campos.intervalo);
    setHorarios(r.campos.horarios);
    setInstrucoes(r.campos.instrucoes);
    setFimDoTratamento(r.campos.fimDoTratamento);
    setCamposDaIA(new Set(r.camposLidos));
    if (r.prescritorId) setPrescritorId(r.prescritorId);
    setOrigemDaLeitura({ readId: r.readId, item: r.readItem });
    // Caixa nao e receita: nao tem o que anexar, e perguntar treinaria a
    // pessoa a responder no automatico.
    setReceita(r.kind === 'receita' && r.foto ? { foto: r.foto, guardar: false } : null);
  }, [novo, rascunho]);

  /** Sair da tela descarta a foto, mesmo que a vaga ainda nao tenha vencido. */
  useFocusEffect(
    useCallback(
      () => () => {
        descartarRascunho();
        setReceita(null);
      },
      [],
    ),
  );

  function preencher(m: Medication) {
    setPerfilId(m.profileId);
    setNome(m.name);
    setConcentracao(m.strength ?? '');
    setForma((FORMAS as readonly string[]).includes(m.form ?? '') ? (m.form as (typeof FORMAS)[number]) : 'outro');
    setQuantidade(m.doseAmount != null ? String(m.doseAmount) : '');
    setTipo(m.scheduleType);
    setIntervalo(m.intervalHours ?? 8);
    setHorarios(m.times.length > 0 ? m.times : ['08:00']);
    setInstrucoes(m.instructions ?? '');
    setPrescritorId(m.prescriberId ?? null);
    setEmbalagem(m.packageAmount != null ? String(m.packageAmount) : '');
    setFimDoTratamento(m.endsAt ?? null);
    // Um remedio que veio do banco nao tem campo pendente de conferencia.
    setCamposDaIA(new Set());
    setReceita(null);
    setOrigemDaLeitura(null);
  }

  function mudarHorario(indice: number, valor: string) {
    // Aceita "8", "830", "08:30" e normaliza enquanto se digita.
    const digitos = valor.replace(/\D/g, '').slice(0, 4);
    const texto = digitos.length <= 2 ? digitos : `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
    setHorarios((atual) => atual.map((h, i) => (i === indice ? texto : h)));
  }

  function validar(): boolean {
    const novos: Record<string, string> = {};
    if (nome.trim().length < 2) novos.nome = 'Informe o nome do remédio';
    if (!perfilId) novos.perfil = 'Escolha para quem é';

    if (tipo === 'fixed_times') {
      const validos = horarios.filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h));
      if (validos.length === 0) novos.horarios = 'Informe ao menos um horário, como 08:00';
      else if (new Set(validos).size !== validos.length) novos.horarios = 'Há horários repetidos';
    }

    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function salvar() {
    setErroGeral(null);
    if (!validar()) return;

    const quantidadeNumero = Number(quantidade.replace(',', '.'));

    const embalagemNumero = Number(embalagem.replace(',', '.'));

    const dados = {
      name: nome.trim(),
      strength: concentracao.trim() || null,
      form: forma,
      doseAmount: Number.isFinite(quantidadeNumero) && quantidadeNumero > 0 ? quantidadeNumero : null,
      doseUnit: forma === 'outro' ? null : forma,
      packageAmount:
        Number.isFinite(embalagemNumero) && embalagemNumero > 0
          ? Math.round(embalagemNumero)
          : null,
      endsAt: fimDoTratamento,
      scheduleType: tipo,
      // Campos de um tipo precisam ser LIMPOS ao trocar de tipo, senao o
      // servidor recusa com "horários fixos só valem para esse tipo".
      intervalHours: tipo === 'interval' ? intervalo : null,
      times: tipo === 'fixed_times' ? horarios.filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h)) : [],
      instructions: instrucoes.trim() || null,
      prescriberId: prescritorId,
    };

    setSalvando(true);
    try {
      if (novo) {
        const criado = await healthApi.createMedication({
          ...dados,
          profileId: perfilId!,
          photoReadId: origemDaLeitura?.readId ?? null,
          photoReadItem: origemDaLeitura?.item ?? null,
        });
        // So depois de o remedio existir: o POST de criacao nao aceita
        // prescriptionPhoto, de proposito (ver o contrato).
        if (receita?.guardar) await anexarReceita(criado.id, receita.foto);
        await porLembretesEmDia(criado);
      } else {
        const salvo = await healthApi.updateMedication(id!, dados);
        /**
         * OS AVISOS SAO ACERTADOS AQUI, e nao so quando a lista abrir.
         *
         * Era este o defeito relatado: editar para "Se necessario" nao parava
         * as notificacoes. A reconciliacao sabe lidar com isso, mas ela mora na
         * tela de LISTA — e quem edita esta na de DETALHE. Em "horarios fixos",
         * cujo gatilho e DIARIO, o aviso continuava para sempre.
         */
        await porLembretesEmDia(salvo);
      }
      // A tela de leitura por foto fica na pilha e precisa se dispensar, senao
      // o "voltar" depois de salvar cai na camera. Ver rascunhoDeMedicamento.
      if (novo && origemDaLeitura) marcarCadastroConcluido();
      setReceita(null);
      router.back();
    } catch (e) {
      if (e instanceof ApiRequestError && e.fields) setErros(e.fields);
      setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Falhar aqui e conveniencia perdida, nao erro de cadastro.
   *
   * O remedio JA FOI SALVO. Deixar uma excecao de agendamento derrubar o
   * salvamento faria a pessoa achar que perdeu o que digitou — e a
   * reconciliacao da lista conserta o agendamento na proxima abertura.
   */
  async function porLembretesEmDia(m: Medication) {
    try {
      await sincronizarLembretesDeUmMedicamento(m);
    } catch {
      // silencio de proposito: ver o comentario acima.
    }
  }

  /**
   * Engole o proprio erro, E ISSO E O PONTO.
   *
   * O remedio JA FOI CRIADO quando esta funcao roda. Se a falha subisse para o
   * catch do salvar(), a tela diria "nao consegui salvar" e continuaria no
   * formulario — e o segundo toque em "Cadastrar remedio" criaria um remedio
   * DUPLICADO. A mensagem tem que dizer o que e verdade: o remedio esta la, a
   * receita nao, e da para anexar depois pela tela do remedio.
   */
  async function anexarReceita(idCriado: string, foto: string) {
    try {
      await healthApi.updateMedication(idCriado, { prescriptionPhoto: foto });
    } catch {
      Alert.alert(
        'Remédio cadastrado',
        'Não consegui guardar a receita agora. Dá para anexar depois, na tela do remédio.',
      );
    }
  }

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.medications} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.conteudo,
            { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl * 2 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader
            title={novo ? 'Novo remédio' : 'Editar remédio'}
            onBack={() => router.back()}
          />

          {carregando ? (
            <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
          ) : (
            <>
              <SurfaceCard style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Para quem</Text>
                <View style={styles.chips}>
                  {perfis.map((p) => (
                    <Chip
                      key={p.id}
                      rotulo={p.fullName.split(' ')[0]!}
                      ativo={p.id === perfilId}
                      // Mudar de perfil orfanaria o historico de doses, entao
                      // o servidor ignora o campo no PATCH — a tela nem oferece.
                      desabilitado={!novo || salvando}
                      onPress={() => setPerfilId(p.id)}
                    />
                  ))}
                </View>
                {erros.perfil ? <Text style={styles.erroCampo}>{erros.perfil}</Text> : null}
                {!novo ? (
                  <Text style={styles.blocoAjuda}>
                    Não dá para mudar de pessoa depois: o histórico de doses ficaria da pessoa
                    errada. Cadastre um remédio novo.
                  </Text>
                ) : null}
              </SurfaceCard>

              <SurfaceCard style={styles.bloco}>
                <FormField
                  label="Nome"
                  value={nome}
                  onChangeText={(v) => {
                    conferido('nome');
                    setNome(v);
                  }}
                  placeholder="Amoxicilina"
                  error={erros.nome ?? erros.name}
                  selo={camposDaIA.has('nome') ? <SeloDaIA /> : undefined}
                  /*
                    O aviso fica SO no nome, e o texto e especifico de proposito.
                    E o campo em que a correcao silenciosa do modelo faz
                    estrago: um nome pouco familiar vira outro parecido, e a
                    pessoa passa batido porque o resultado "parece certo".
                  */
                  aviso={
                    camposDaIA.has('nome')
                      ? 'Confira o nome na caixa ou na receita, letra por letra. A leitura automática às vezes troca por um nome parecido.'
                      : undefined
                  }
                  autoCapitalize="words"
                  editable={!salvando}
                />
                <FormField
                  label="Concentração"
                  value={concentracao}
                  onChangeText={(v) => {
                    conferido('concentracao');
                    setConcentracao(v);
                  }}
                  placeholder="500mg"
                  hint="Como está escrito na caixa"
                  error={erros.strength}
                  selo={camposDaIA.has('concentracao') ? <SeloDaIA /> : undefined}
                  editable={!salvando}
                />

                <View style={styles.linhaDoRotulo}>
                  <Text style={styles.rotulo}>Forma</Text>
                  {camposDaIA.has('forma') ? <SeloDaIA /> : null}
                </View>
                <View style={styles.chips}>
                  {FORMAS.map((f) => (
                    <Chip
                      key={f}
                      rotulo={f}
                      ativo={f === forma}
                      desabilitado={salvando}
                      onPress={() => {
                        conferido('forma');
                        setForma(f);
                      }}
                    />
                  ))}
                </View>

                {/*
                  "Quantas vem na caixa", e NAO "Quantidade": o campo de dose
                  logo abaixo ja usava essa palavra, e dois campos com
                  "Quantidade" no rotulo, proximos, sao armadilha de digitacao
                  num aplicativo de remedio. Por isso tambem ficam em blocos
                  diferentes — este e sobre a embalagem, aquele e posologia.
                */}
                <FormField
                  label="Quantas vêm na caixa"
                  value={embalagem}
                  onChangeText={(v) => {
                    conferido('embalagem');
                    setEmbalagem(v.replace(/\D/g, ''));
                  }}
                  placeholder="21"
                  keyboardType="number-pad"
                  maxLength={4}
                  hint="Opcional. Guardado para quando existir o aviso de reposição."
                  error={erros.packageAmount}
                  selo={camposDaIA.has('embalagem') ? <SeloDaIA /> : undefined}
                  editable={!salvando}
                />
              </SurfaceCard>

              <SurfaceCard style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Quando tomar</Text>

                {/*
                  Este campo morava no bloco do remedio, com o rotulo
                  "Quantidade por dose". Mudou de lugar e de nome porque
                  quantidade por dose E posologia — le-se junto com o intervalo
                  ("1 capsula a cada 8 horas") — e porque a palavra
                  "Quantidade" ficou para o campo da embalagem.
                */}
                <FormField
                  label="Quanto tomar por vez"
                  value={quantidade}
                  onChangeText={(v) => {
                    conferido('quantidade');
                    setQuantidade(v);
                  }}
                  placeholder="1"
                  keyboardType="decimal-pad"
                  hint={forma === 'outro' ? undefined : `Em ${forma}`}
                  error={erros.doseAmount}
                  selo={camposDaIA.has('quantidade') ? <SeloDaIA /> : undefined}
                  editable={!salvando}
                />

                <View style={styles.tipos}>
                  {TIPOS.map((t) => (
                    <Pressable
                      key={t.valor}
                      onPress={() => {
                        conferido('tipo');
                        setTipo(t.valor);
                      }}
                      disabled={salvando}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: t.valor === tipo }}
                      style={[styles.tipo, t.valor === tipo && styles.tipoAtivo]}
                    >
                      <Feather
                        name={t.valor === tipo ? 'check-circle' : 'circle'}
                        size={18}
                        color={t.valor === tipo ? colors.accentGreen : colors.textSecondary}
                      />
                      <View style={styles.flex}>
                        <Text style={[styles.tipoNome, t.valor === tipo && styles.tipoNomeAtivo]}>
                          {t.rotulo}
                        </Text>
                        <Text style={styles.tipoAjuda}>{t.ajuda}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>

                {tipo === 'interval' ? (
                  <>
                    <View style={styles.linhaDoRotulo}>
                      <Text style={styles.rotulo}>De quantas em quantas horas</Text>
                      {camposDaIA.has('intervalo') ? <SeloDaIA /> : null}
                    </View>
                    <View style={styles.chips}>
                      {INTERVALOS.map((h) => (
                        <Chip
                          key={h}
                          rotulo={h === 24 ? '1x ao dia' : `${h}h`}
                          ativo={h === intervalo}
                          desabilitado={salvando}
                          onPress={() => {
                            conferido('intervalo');
                            setIntervalo(h);
                          }}
                        />
                      ))}
                    </View>
                    {erros.intervalHours ? (
                      <Text style={styles.erroCampo}>{erros.intervalHours}</Text>
                    ) : null}
                  </>
                ) : null}

                {tipo === 'fixed_times' ? (
                  <>
                    <Text style={styles.rotulo}>Horários</Text>
                    {horarios.map((h, i) => (
                      <View key={i} style={styles.horarioLinha}>
                        <View style={styles.flex}>
                          <FormField
                            label=""
                            value={h}
                            onChangeText={(v) => mudarHorario(i, v)}
                            placeholder="08:00"
                            keyboardType="number-pad"
                            maxLength={5}
                            editable={!salvando}
                          />
                        </View>
                        {horarios.length > 1 ? (
                          <Pressable
                            onPress={() => setHorarios((a) => a.filter((_, j) => j !== i))}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={`Remover o horário ${h}`}
                          >
                            <Feather name="x-circle" size={22} color={colors.textError} />
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                    {erros.horarios || erros.times ? (
                      <Text style={styles.erroCampo}>{erros.horarios ?? erros.times}</Text>
                    ) : null}
                    {horarios.length < 8 ? (
                      <Pressable
                        onPress={() => setHorarios((a) => [...a, ''])}
                        disabled={salvando}
                        accessibilityRole="button"
                        style={styles.maisHorario}
                      >
                        <Feather name="plus" size={18} color={colors.accentGreen} />
                        <Text style={styles.maisHorarioTexto}>Adicionar horário</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}
              </SurfaceCard>

              {receita ? (
                /*
                  A PERGUNTA MORA AQUI, na revisao, e nao num Alert depois de
                  salvar. Um Alert no momento da conclusao interrompe a pessoa
                  justamente quando ela terminou, e o "Agora nao" viraria um
                  caminho que destroi a foto em silencio, sem ela ter visto
                  qual foto era. A premissa do recurso e revisar antes de
                  salvar — a foto e parte do que se revisa.

                  DESLIGADO POR PADRAO: ligado seria "guardar sempre, a menos
                  que voce repare", que e o oposto de perguntar.
                */
                <SurfaceCard style={styles.bloco}>
                  <Pressable
                    onPress={() => setReceita({ ...receita, guardar: !receita.guardar })}
                    disabled={salvando}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: receita.guardar }}
                    accessibilityLabel="Guardar esta foto como a receita deste remédio"
                    style={({ pressed }) => [styles.guardar, pressed && styles.pressionado]}
                  >
                    <Feather
                      name={receita.guardar ? 'check-square' : 'square'}
                      size={20}
                      color={receita.guardar ? colors.accentGreen : colors.textSecondary}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.guardarTitulo}>
                        Guardar esta foto como a receita deste remédio
                      </Text>
                      <Text style={styles.guardarAjuda}>
                        Ela fica na tela do remédio, para você ter em mãos na farmácia.
                      </Text>
                    </View>
                  </Pressable>
                </SurfaceCard>
              ) : null}

              <SurfaceCard style={styles.bloco}>
                <FormField
                  label="Orientações"
                  value={instrucoes}
                  onChangeText={(v) => {
                    conferido('instrucoes');
                    setInstrucoes(v);
                  }}
                  placeholder="Tomar com um copo de água, após as refeições."
                  multiline
                  selo={camposDaIA.has('instrucoes') ? <SeloDaIA /> : undefined}
                  editable={!salvando}
                />

                {medicos.length > 0 ? (
                  <>
                    <Text style={styles.rotulo}>Quem receitou</Text>
                    <View style={styles.chips}>
                      {medicos.map((md) => (
                        <Chip
                          key={md.id}
                          rotulo={md.name}
                          ativo={md.id === prescritorId}
                          desabilitado={salvando}
                          onPress={() => setPrescritorId(prescritorId === md.id ? null : md.id)}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
              </SurfaceCard>

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
                  <Text style={styles.salvarTexto}>{novo ? 'Cadastrar remédio' : 'Salvar'}</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Chip({
  rotulo,
  ativo,
  desabilitado,
  onPress,
}: {
  rotulo: string;
  ativo: boolean;
  desabilitado?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo, disabled: desabilitado }}
      style={[styles.chip, ativo && styles.chipAtivo, desabilitado && !ativo && styles.chipApagado]}
    >
      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]} numberOfLines={1}>
        {rotulo}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  flex: { flex: 1 },
  conteudo: { paddingHorizontal: spacing.xl },
  carregando: { marginTop: spacing.xxl },
  bloco: { marginTop: spacing.xl },
  blocoTitulo: { fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  blocoAjuda: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  linhaDoRotulo: { flexDirection: 'row', alignItems: 'center' },
  guardar: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 56 },
  guardarTitulo: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  guardarAjuda: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rotulo: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    backgroundColor: colors.chipMore,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  chipAtivo: { backgroundColor: colors.chipActive },
  chipApagado: { opacity: 0.5 },
  chipTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.sectionTitle },
  chipTextoAtivo: { color: colors.onAccent },
  tipos: { marginTop: spacing.md, gap: spacing.sm },
  tipo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card - 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tipoAtivo: { borderColor: colors.accentGreen, backgroundColor: colors.chipMore },
  tipoNome: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  tipoNomeAtivo: { color: colors.sectionTitle },
  tipoAjuda: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  horarioLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  maisHorario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  maisHorarioTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen },
  erroCampo: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textError, marginTop: spacing.sm },
  erroGeral: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textError,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  salvar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
    minHeight: 56,
  },
  pressionado: { opacity: 0.85 },
  salvarTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },
});
