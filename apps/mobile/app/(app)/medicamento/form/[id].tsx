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
import type { MedicationPatch } from '@/api/health';
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
import { useAssinaturaExigida, usePlano } from '@/lib/avisosContext';
import { sincronizarLembretesDeUmMedicamento } from '@/lib/reminders';
import {
  atualizarItemDoLote,
  camposVazios,
  consumirRascunho,
  descartarRascunho,
  encaixarIntervalo,
  FORMAS,
  INTERVALOS,
  lerReceita,
  marcarCadastroConcluido,
  type CampoLido,
} from '@/lib/rascunhoDeMedicamento';
import { dataDeFimParaISO, formatarData, isoParaData } from '@/lib/pessoa';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

const REPETIR: { valor: 'todo' | 'dias' | 'semana'; rotulo: string }[] = [
  { valor: 'todo', rotulo: 'Todo dia' },
  { valor: 'dias', rotulo: 'A cada N dias' },
  { valor: 'semana', rotulo: 'Dias da semana' },
];

/** Ordem do bitmask: indice 0 = domingo. */
const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "17/10/2026" no fuso do aparelho (toISOString viraria o dia depois das 21h). */
function dataLocalTexto(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const TIPOS: { valor: ScheduleType; rotulo: string; ajuda: string }[] = [
  { valor: 'interval', rotulo: 'A cada X horas', ajuda: 'Ex.: de 8 em 8 horas' },
  { valor: 'fixed_times', rotulo: 'Horários fixos', ajuda: 'Ex.: 08:00 e 20:00' },
  { valor: 'as_needed', rotulo: 'Se necessário', ajuda: 'Sem horário, só quando precisar' },
];

export default function MedicamentoFormScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, rascunho, loteItem } = useLocalSearchParams<{
    id: string;
    rascunho?: string;
    loteItem?: string;
  }>();
  const novo = id === 'novo';

  /**
   * Modo "editar um item do lote da receita".
   *
   * A tela de revisao abre este form com `?loteItem=<indice>` para reaproveitar
   * o editor rico (chips, horarios, selos "da foto") em vez de reimplementar a
   * edicao la. Aqui NAO HA chamada de API: salvar escreve de volta no rascunho
   * de lote e volta para a revisao, que cadastra tudo de uma vez.
   */
  const indiceDoLote = loteItem != null && /^\d+$/.test(loteItem) ? Number(loteItem) : null;
  const emLote = novo && indiceDoLote != null;

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
  /** Fim do tratamento como o texto do campo (dd/mm/aaaa); vira ISO ao salvar. */
  const [fimTexto, setFimTexto] = useState('');

  /**
   * Intervalo LIVRE: o chip "Outro" abre um campo de 1 a 72 horas. O servidor
   * sempre aceitou qualquer valor nessa faixa; so a tela limitava aos chips.
   */
  const [intervaloOutro, setIntervaloOutro] = useState(false);
  const [intervaloTexto, setIntervaloTexto] = useState('');
  /** Padrao de dias (so horarios fixos). */
  const [repetir, setRepetir] = useState<'todo' | 'dias' | 'semana'>('todo');
  const [diasIntervaloTexto, setDiasIntervaloTexto] = useState('');
  /** Bitmask dom..sab. */
  const [diasSemana, setDiasSemana] = useState<number | null>(null);
  const [totalTexto, setTotalTexto] = useState('');

  /** "Descreva como tomar": o texto livre que a IA converte em posologia. */
  const [descricao, setDescricao] = useState('');
  const [interpretando, setInterpretando] = useState(false);
  const [erroIA, setErroIA] = useState<string | null>(null);
  /** "Descreva como tomar" e IA: so com assinatura ou no teste gratis. */
  const { premium } = usePlano();
  const tratarAssinatura = useAssinaturaExigida();

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

  /**
   * A foto da embalagem, quando o cadastro veio de fotografar a caixinha.
   *
   * IRMAO de `receita`, e nao um campo dele: `receita` carrega o par
   * foto+consentimento, e esta nao tem consentimento a carregar — ela e
   * guardada sem perguntar. O porque da assimetria esta no cabecalho da
   * tabela medication_attachments: uma caixa e um produto de farmacia; uma
   * receita traz o paciente, o CRM e muitas vezes o diagnostico.
   */
  const [fotoDaCaixa, setFotoDaCaixa] = useState<string | null>(null);
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
    // No modo lote nao ha "Para quem" nem "Quem receitou" (ambos sao da receita
    // toda, resolvidos na revisao): poupa duas chamadas e evita um erro de rede
    // bloquear a edicao de um item ja lido.
    if (emLote) {
      setCarregando(false);
      return;
    }
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
  }, [id, novo, emLote]);

  /**
   * Carrega o item do lote para edicao.
   *
   * Sincrono e proprio, como o efeito do rascunho unico: chegar aqui por
   * NAVIGATE nao remonta a tela, entao reaplicar depende de [emLote, indice]. Se
   * o lote venceu ou o indice nao existe, nao da para editar o que sumiu — volta.
   */
  useEffect(() => {
    if (!emLote) return;
    const item = lerReceita()?.itens[indiceDoLote!];
    if (!item) {
      router.back();
      return;
    }
    setNome(item.campos.nome);
    setConcentracao(item.campos.concentracao);
    setForma(item.campos.forma);
    setQuantidade(item.campos.quantidade);
    setEmbalagem(item.campos.embalagem);
    setTipo(item.campos.tipo);
    setIntervalo(item.campos.intervalo);
    setHorarios(item.campos.horarios);
    setInstrucoes(item.campos.instrucoes);
    setFimTexto(isoParaData(item.campos.fimDoTratamento));
    aplicarPadroes({
      intervalo: item.campos.intervalo,
      diasIntervalo: item.campos.diasIntervalo,
      diasSemana: item.campos.diasSemana,
      totalDoses: item.campos.totalDoses,
    });
    setCamposDaIA(new Set(item.camposLidos));
  }, [emLote, indiceDoLote, router]);

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
    setFimTexto(isoParaData(r.campos.fimDoTratamento));
    aplicarPadroes({
      intervalo: r.campos.intervalo,
      diasIntervalo: r.campos.diasIntervalo,
      diasSemana: r.campos.diasSemana,
      totalDoses: r.campos.totalDoses,
    });
    setCamposDaIA(new Set(r.camposLidos));
    if (r.prescritorId) setPrescritorId(r.prescritorId);
    setOrigemDaLeitura({ readId: r.readId, item: r.readItem });
    // As duas fotos vao para campos diferentes, com regras diferentes: a
    // receita SO e guardada se a pessoa marcar (perguntar toda vez treinaria
    // a responder no automatico, entao a caixa de selecao nasce desligada); a
    // caixinha e guardada sem perguntar, e removivel na tela do remedio.
    setReceita(r.kind === 'receita' && r.foto ? { foto: r.foto, guardar: false } : null);
    setFotoDaCaixa(r.kind === 'caixa' && r.foto ? r.foto : null);
  }, [novo, rascunho]);

  /** Sair da tela descarta a foto, mesmo que a vaga ainda nao tenha vencido. */
  useFocusEffect(
    useCallback(
      () => () => {
        descartarRascunho();
        setReceita(null);
        setFotoDaCaixa(null);
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
    setFimTexto(isoParaData(m.endsAt));
    aplicarPadroes({
      intervalo: m.intervalHours ?? 8,
      diasIntervalo: m.dayInterval ?? null,
      diasSemana: m.weekdays ?? null,
      totalDoses: m.totalDoses ?? null,
    });
    // Um remedio que veio do banco nao tem campo pendente de conferencia.
    setCamposDaIA(new Set());
    setReceita(null);
    setFotoDaCaixa(null);
    setOrigemDaLeitura(null);
  }

  function mudarHorario(indice: number, valor: string) {
    // Aceita "8", "830", "08:30" e normaliza enquanto se digita.
    const digitos = valor.replace(/\D/g, '').slice(0, 4);
    const texto = digitos.length <= 2 ? digitos : `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
    setHorarios((atual) => atual.map((h, i) => (i === indice ? texto : h)));
  }

  /**
   * Leva intervalo, padrao de dias e total para os estados da tela.
   *
   * Um ponto so para os quatro caminhos que preenchem o formulario (remedio
   * existente, rascunho da foto, item do lote e a IA), para nenhum esquecer de
   * ligar o "Outro" quando o intervalo nao e um dos chips.
   */
  function aplicarPadroes(p: {
    intervalo: number;
    diasIntervalo: number | null;
    diasSemana: number | null;
    totalDoses: number | null;
  }) {
    setIntervaloOutro(!(INTERVALOS as readonly number[]).includes(p.intervalo));
    setIntervaloTexto(String(p.intervalo));
    setRepetir(p.diasSemana ? 'semana' : p.diasIntervalo && p.diasIntervalo > 1 ? 'dias' : 'todo');
    setDiasSemana(p.diasSemana);
    setDiasIntervaloTexto(p.diasIntervalo && p.diasIntervalo > 1 ? String(p.diasIntervalo) : '');
    setTotalTexto(p.totalDoses ? String(p.totalDoses) : '');
  }

  /** O que os campos novos viram no cadastro. Limpa o que nao vale para o tipo. */
  function padroesParaSalvar() {
    return {
      dayInterval: tipo === 'fixed_times' && repetir === 'dias' ? Number(diasIntervaloTexto) : null,
      weekdays: tipo === 'fixed_times' && repetir === 'semana' ? diasSemana : null,
      totalDoses: tipo !== 'as_needed' && totalTexto.trim() ? Number(totalTexto) : null,
    };
  }

  function alternarDia(indice: number) {
    conferido('repetir');
    setDiasSemana((atual) => {
      const mascara = (atual ?? 0) ^ (1 << indice);
      return mascara === 0 ? null : mascara;
    });
  }

  /**
   * "Descreva como tomar" → a IA propoe, a tela preenche, a pessoa confere.
   *
   * Nada e salvo aqui. Os campos preenchidos ganham o selo "da IA" (o mesmo da
   * leitura de foto), e o selo some quando a pessoa mexe no campo.
   */
  async function preencherComIA() {
    const texto = descricao.trim();
    if (texto.length < 3) {
      setErroIA('Escreva como deve ser tomado, por exemplo "1 comprimido a cada 8 horas por 7 dias".');
      return;
    }
    setErroIA(null);
    setInterpretando(true);
    try {
      const p = await healthApi.interpretarPosologia({ texto, forma });
      const lidos = new Set(camposDaIA);

      const tipoLido = TIPOS.find((t) => t.valor === p.scheduleType)?.valor;
      if (tipoLido) {
        setTipo(tipoLido);
        lidos.add('tipo');
      }
      const novoIntervalo = p.intervalHours ? encaixarIntervalo(p.intervalHours) : intervalo;
      if (p.intervalHours) {
        setIntervalo(novoIntervalo);
        lidos.add('intervalo');
      }
      if (p.times.length > 0) {
        setHorarios(p.times.slice(0, 8));
        lidos.add('horarios');
      }
      aplicarPadroes({
        intervalo: novoIntervalo,
        diasIntervalo: p.dayInterval ?? null,
        diasSemana: p.weekdays ?? null,
        totalDoses: p.totalDoses ?? null,
      });
      if (p.dayInterval || p.weekdays) lidos.add('repetir');
      if (p.totalDoses) lidos.add('total');
      if (p.doseAmount) {
        setQuantidade(String(p.doseAmount).replace('.', ','));
        lidos.add('quantidade');
      }
      // "Por 7 dias" vira data AQUI, com o relogio do aparelho.
      if (p.durationDays) {
        const fim = new Date();
        fim.setDate(fim.getDate() + p.durationDays);
        setFimTexto(dataLocalTexto(fim));
      }
      // Nao atropela orientacao que a pessoa ja escreveu.
      if (p.instructions && !instrucoes.trim()) {
        setInstrucoes(p.instructions);
        lidos.add('instrucoes');
      }
      setCamposDaIA(lidos);
    } catch (e) {
      // Plano vencido com o formulario aberto: leva a assinatura em vez de
      // mostrar um erro embaixo do campo. O que foi digitado continua la.
      if (tratarAssinatura(e)) return;
      setErroIA(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setInterpretando(false);
    }
  }

  function validar(): boolean {
    const novos: Record<string, string> = {};
    if (nome.trim().length < 2) novos.nome = 'Informe o nome do remédio';
    // No lote, o membro e escolhido na revisao — este form nem mostra "Para quem".
    if (!emLote && !perfilId) novos.perfil = 'Escolha para quem é';

    if (tipo === 'fixed_times') {
      const validos = horarios.filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h));
      if (validos.length === 0) novos.horarios = 'Informe ao menos um horário, como 08:00';
      else if (new Set(validos).size !== validos.length) novos.horarios = 'Há horários repetidos';
    }

    if (tipo === 'interval' && !(Number.isInteger(intervalo) && intervalo >= 1 && intervalo <= 72)) {
      novos.intervalHours = 'Informe um intervalo entre 1 e 72 horas';
    }

    if (tipo === 'fixed_times' && repetir === 'dias') {
      const n = Number(diasIntervaloTexto);
      if (!Number.isInteger(n) || n < 2 || n > 60) {
        novos.dayInterval = 'Informe de quantos em quantos dias (2 a 60)';
      }
    }
    if (tipo === 'fixed_times' && repetir === 'semana' && !diasSemana) {
      novos.weekdays = 'Escolha ao menos um dia da semana';
    }

    if (tipo !== 'as_needed' && totalTexto.trim()) {
      const n = Number(totalTexto);
      if (!Number.isInteger(n) || n < 1 || n > 500) novos.totalDoses = 'Use um número de 1 a 500';
    }

    // Fim de tratamento é opcional; se preenchido, precisa ser uma data futura.
    if (fimTexto.trim() && !dataDeFimParaISO(fimTexto)) {
      novos.endsAt = 'Use uma data futura, como 20/10/2026';
    }

    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function salvar() {
    setErroGeral(null);
    if (!validar()) return;

    // Texto do campo → ISO (ou null se em branco). Validado acima.
    const fimISO = fimTexto.trim() ? dataDeFimParaISO(fimTexto) : null;

    /**
     * No lote NAO ha chamada de API: escreve os campos de volta no rascunho e
     * volta para a revisao, que cadastra tudo de uma vez. Guardo o estado cru
     * (CamposDoRascunho) — a conversao para o payload da API mora na revisao,
     * um lugar so. As marcas "da foto" que sobraram vao junto: a pessoa pode
     * reabrir o item e ver o que ainda nao conferiu.
     */
    const padroes = padroesParaSalvar();

    if (emLote) {
      atualizarItemDoLote(
        indiceDoLote!,
        {
          nome,
          concentracao,
          forma,
          quantidade,
          embalagem,
          tipo,
          intervalo,
          horarios,
          instrucoes,
          fimDoTratamento: fimISO,
          diasIntervalo: padroes.dayInterval,
          diasSemana: padroes.weekdays,
          totalDoses: padroes.totalDoses,
        },
        [...camposDaIA],
      );
      router.back();
      return;
    }

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
      endsAt: fimISO,
      scheduleType: tipo,
      // Campos de um tipo precisam ser LIMPOS ao trocar de tipo, senao o
      // servidor recusa com "horários fixos só valem para esse tipo".
      intervalHours: tipo === 'interval' ? intervalo : null,
      times: tipo === 'fixed_times' ? horarios.filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h)) : [],
      // Sempre explicitos (inclusive null): trocar "dia sim, dia nao" por
      // "todo dia" precisa APAGAR o padrao no servidor, e ausente o preservaria.
      ...padroes,
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
        /**
         * UM PATCH com as duas fotos possiveis, e nao dois: uma requisicao,
         * uma transacao, um modo de falha.
         */
        const anexos: MedicationPatch = {};
        if (receita?.guardar) anexos.prescriptionPhoto = receita.foto;
        if (fotoDaCaixa) anexos.packagePhoto = fotoDaCaixa;
        if (Object.keys(anexos).length > 0) {
          await anexarFotos(criado.id, anexos, Boolean(receita?.guardar));
        }
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
      setFotoDaCaixa(null);
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
  async function anexarFotos(idCriado: string, anexos: MedicationPatch, pediuAReceita: boolean) {
    try {
      await healthApi.updateMedication(idCriado, anexos);
    } catch {
      /**
       * O alerta so aparece quando a RECEITA falhou, e isso nao e descuido: a
       * pessoa PEDIU aquilo, marcando a caixa de selecao. Ninguem pediu a
       * foto da caixinha — avisar sobre o fracasso de algo que nao foi pedido
       * e ruido, ainda mais com o conserto a um toque na propria tela de
       * detalhe, onde a faixa da foto fica vazia e convidando.
       */
      if (!pediuAReceita) return;
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
            title={novo && !emLote ? 'Novo remédio' : 'Editar remédio'}
            onBack={() => router.back()}
          />

          {carregando ? (
            <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
          ) : (
            <>
              {!emLote ? (
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
              ) : null}

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
                <Text style={styles.blocoTitulo}>{forma === 'jato' ? 'Quando aplicar' : 'Quando tomar'}</Text>

                {/*
                  "Descreva como tomar": a pessoa escreve do jeito dela e a IA
                  preenche os campos abaixo. NAO SALVA: os campos ganham o selo
                  "da IA" e a pessoa confere, como na leitura de foto.
                */}
                {/*
                  Sem plano o campo NAO aparece desabilitado: um campo que aceita
                  texto e nao faz nada e pior que nenhum. Vira uma linha com
                  cadeado que explica e leva a assinatura. O preenchimento a mao,
                  logo abaixo, continua igual para todo mundo.
                */}
                {premium ? (
                  <View style={styles.ia}>
                    <FormField
                      label="Descreva como tomar"
                      value={descricao}
                      onChangeText={(v) => {
                        setErroIA(null);
                        setDescricao(v);
                      }}
                      placeholder="Ex.: 1 comprimido a cada 8 horas por 7 dias"
                      multiline
                      maxLength={500}
                      hint="A IA preenche os campos abaixo. Você confere antes de salvar."
                      editable={!salvando && !interpretando}
                    />
                    <Pressable
                      onPress={() => void preencherComIA()}
                      disabled={salvando || interpretando}
                      accessibilityRole="button"
                      accessibilityLabel="Preencher com IA"
                      accessibilityState={{ busy: interpretando }}
                      style={({ pressed }) => [styles.botaoIA, pressed && styles.pressionado]}
                    >
                      {interpretando ? (
                        <ActivityIndicator color={colors.accentGreen} />
                      ) : (
                        <>
                          <Feather name="zap" size={17} color={colors.accentGreen} />
                          <Text style={styles.botaoIATexto}>Preencher com IA</Text>
                        </>
                      )}
                    </Pressable>
                    {erroIA ? <Text style={styles.erroCampo}>{erroIA}</Text> : null}
                  </View>
                ) : (
                  <Pressable
                    onPress={() => router.push('/conta/assinatura')}
                    accessibilityRole="button"
                    accessibilityLabel="Descreva como tomar, com IA. Faz parte da assinatura."
                    accessibilityHint="Abre a tela de assinatura"
                    style={({ pressed }) => [styles.iaTrancada, pressed && styles.pressionado]}
                  >
                    <Feather name="lock" size={18} color={colors.accentGreen} />
                    <View style={styles.iaTrancadaTextos}>
                      <Text style={styles.iaTrancadaTitulo}>Descreva como tomar</Text>
                      <Text style={styles.iaTrancadaTexto}>
                        A IA preenche os campos abaixo. Faz parte da assinatura.
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                  </Pressable>
                )}

                {/*
                  Este campo morava no bloco do remedio, com o rotulo
                  "Quantidade por dose". Mudou de lugar e de nome porque
                  quantidade por dose E posologia — le-se junto com o intervalo
                  ("1 capsula a cada 8 horas") — e porque a palavra
                  "Quantidade" ficou para o campo da embalagem.
                */}
                <FormField
                  label={forma === 'jato' ? 'Quanto aplicar por vez' : 'Quanto tomar por vez'}
                  value={quantidade}
                  onChangeText={(v) => {
                    conferido('quantidade');
                    setQuantidade(v);
                  }}
                  placeholder="1"
                  keyboardType="decimal-pad"
                  hint={forma === 'outro' ? undefined : forma === 'jato' ? 'Em jatos' : `Em ${forma}`}
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
                          ativo={h === intervalo && !intervaloOutro}
                          desabilitado={salvando}
                          onPress={() => {
                            conferido('intervalo');
                            setIntervaloOutro(false);
                            setIntervalo(h);
                          }}
                        />
                      ))}
                      {/* Intervalo livre: "a cada 5h", "a cada 36h"... */}
                      <Chip
                        rotulo={intervaloOutro ? `Outro: ${intervalo}h` : 'Outro'}
                        ativo={intervaloOutro}
                        desabilitado={salvando}
                        onPress={() => {
                          conferido('intervalo');
                          setIntervaloOutro(true);
                          setIntervaloTexto(String(intervalo));
                        }}
                      />
                    </View>
                    {intervaloOutro ? (
                      <FormField
                        label="A cada quantas horas"
                        value={intervaloTexto}
                        onChangeText={(v) => {
                          conferido('intervalo');
                          const digitos = v.replace(/\D/g, '').slice(0, 2);
                          setIntervaloTexto(digitos);
                          const n = Number(digitos);
                          if (n >= 1 && n <= 72) setIntervalo(n);
                        }}
                        placeholder="5"
                        keyboardType="number-pad"
                        maxLength={2}
                        hint="De 1 a 72 horas. Ex.: 48 = a cada 2 dias, no mesmo horário."
                        editable={!salvando}
                      />
                    ) : null}
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

                    {/*
                      Padrao de DIAS: so faz sentido com horario fixo. "A cada N
                      horas" ja cobre 48h/72h pelo intervalo livre.
                    */}
                    <View style={styles.linhaDoRotulo}>
                      <Text style={styles.rotulo}>Repetir</Text>
                      {camposDaIA.has('repetir') ? <SeloDaIA /> : null}
                    </View>
                    <View style={styles.chips}>
                      {REPETIR.map((r) => (
                        <Chip
                          key={r.valor}
                          rotulo={r.rotulo}
                          ativo={repetir === r.valor}
                          desabilitado={salvando}
                          onPress={() => {
                            conferido('repetir');
                            setRepetir(r.valor);
                          }}
                        />
                      ))}
                    </View>
                    {repetir === 'dias' ? (
                      <FormField
                        label="A cada quantos dias"
                        value={diasIntervaloTexto}
                        onChangeText={(v) => {
                          conferido('repetir');
                          setDiasIntervaloTexto(v.replace(/\D/g, '').slice(0, 2));
                        }}
                        placeholder="2"
                        keyboardType="number-pad"
                        maxLength={2}
                        hint="2 = dia sim, dia não. Conta a partir de hoje."
                        error={erros.dayInterval}
                        editable={!salvando}
                      />
                    ) : null}
                    {repetir === 'semana' ? (
                      <>
                        <View style={styles.chips}>
                          {DIAS_DA_SEMANA.map((d, i) => (
                            <Chip
                              key={d}
                              rotulo={d}
                              ativo={!!diasSemana && ((diasSemana >> i) & 1) === 1}
                              desabilitado={salvando}
                              onPress={() => alternarDia(i)}
                            />
                          ))}
                        </View>
                        {erros.weekdays ? <Text style={styles.erroCampo}>{erros.weekdays}</Text> : null}
                      </>
                    ) : null}
                  </>
                ) : null}

                {tipo !== 'as_needed' ? (
                  <FormField
                    label="Total de doses"
                    value={totalTexto}
                    onChangeText={(v) => {
                      conferido('total');
                      setTotalTexto(v.replace(/\D/g, '').slice(0, 3));
                    }}
                    placeholder="Ex.: 6"
                    keyboardType="number-pad"
                    maxLength={3}
                    hint="Opcional. Os lembretes param depois da última dose."
                    error={erros.totalDoses}
                    selo={camposDaIA.has('total') ? <SeloDaIA /> : undefined}
                    editable={!salvando}
                  />
                ) : null}

                {/*
                  Fim do tratamento: opcional e editável. Antes só existia a
                  conversão automática de "por N dias"; um prazo relativo ("até
                  sábado") ficava sem data. Aqui a pessoa digita e os lembretes
                  param no dia.
                */}
                <FormField
                  label="Fim do tratamento"
                  value={fimTexto}
                  onChangeText={(v) => setFimTexto(formatarData(v))}
                  placeholder="20/10/2026"
                  keyboardType="number-pad"
                  maxLength={10}
                  hint="Opcional. Quando o tratamento termina — os lembretes param nesse dia."
                  error={erros.endsAt}
                  editable={!salvando}
                />
              </SurfaceCard>

              {fotoDaCaixa ? (
                /*
                  AVISO, e nao pergunta. A caixinha e guardada sem perguntar
                  porque e um produto de farmacia — mas guardar em silencio,
                  sem a pessoa saber, seria outra coisa. Ela fica sabendo
                  aqui, e a tela do remedio tem o botao de remover.
                */
                <SurfaceCard style={styles.bloco}>
                  <View style={styles.guardar}>
                    <Feather name="camera" size={20} color={colors.accentGreen} />
                    <View style={styles.flex}>
                      <Text style={styles.guardarTitulo}>
                        A foto da caixinha fica guardada neste remédio
                      </Text>
                      <Text style={styles.guardarAjuda}>
                        Ela aparece na tela do remédio, e dá para remover quando quiser.
                      </Text>
                    </View>
                  </View>
                </SurfaceCard>
              ) : null}

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
                  <Text style={styles.salvarTexto}>
                    {novo && !emLote ? 'Cadastrar remédio' : 'Salvar'}
                  </Text>
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
  ia: { marginTop: spacing.md, marginBottom: spacing.sm },
  iaTrancada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
    borderRadius: radii.card - 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  iaTrancadaTextos: { flex: 1 },
  iaTrancadaTitulo: { fontFamily: fonts.bold, fontSize: 15, color: colors.sectionTitle },
  iaTrancadaTexto: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  botaoIA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    minHeight: 48,
    marginTop: spacing.sm,
  },
  botaoIATexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen },
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
