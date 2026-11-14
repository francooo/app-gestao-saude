import { useQueryClient } from '@tanstack/react-query';
import {
  healthApi,
  type Medication,
  type MedicationPatch,
  type ScheduleType,
} from '@gestao/shared/api/health';
import { dataDeFimParaISO, formatarData, isoParaData } from '@gestao/shared/lib/pessoa';
import {
  atualizarItemDoLote,
  camposVazios,
  consumirRascunho,
  descartarRascunho,
  encaixarIntervalo,
  FORMAS,
  INTERVALOS,
  lerReceita,
  type CampoLido,
  type CamposDoRascunho,
} from '@gestao/shared/lib/rascunhoDeMedicamento';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { ApiRequestError } from '@/api/cliente';
import {
  CHAVES,
  useAssinaturaExigida,
  usePerfis,
  usePlano,
  useRemedio,
  useTodosOsMedicos,
} from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { Chip, Chips, SeloDaIA } from '@/ui/Chip';
import { useDialogos } from '@/ui/Dialogo';
import { FormField } from '@/ui/FormField';
import { Icone } from '@/ui/Icone';
import { Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './MedicamentoForm.module.css';

type Repetir = 'todo' | 'dias' | 'semana';

const REPETIR: { valor: Repetir; rotulo: string }[] = [
  { valor: 'todo', rotulo: 'Todo dia' },
  { valor: 'dias', rotulo: 'A cada N dias' },
  { valor: 'semana', rotulo: 'Dias da semana' },
];

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const TIPOS: { valor: ScheduleType; rotulo: string; ajuda: string }[] = [
  { valor: 'interval', rotulo: 'A cada X horas', ajuda: 'Ex.: de 8 em 8 horas' },
  { valor: 'fixed_times', rotulo: 'Horários fixos', ajuda: 'Ex.: 08:00 e 20:00' },
  { valor: 'as_needed', rotulo: 'Se necessário', ajuda: 'Sem horário, só quando precisar' },
];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function dataLocalTexto(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Formulario do remedio. Tres usos, como no aplicativo:
 *
 * - /medicamento/form/novo — cadastro, a mao ou vindo de uma leitura de foto
 *   (?rascunho=token traz os campos lidos e a foto);
 * - /medicamento/form/:id — edicao;
 * - /medicamento/form/novo?loteItem=n — revisao de um item da receita lida em
 *   lote: nao salva no servidor, so devolve os campos corrigidos ao lote.
 */
export function MedicamentoForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();

  const novo = id === 'novo';
  const rascunho = params.get('rascunho');
  const loteItem = params.get('loteItem');
  const indiceDoLote = loteItem != null && /^\d+$/.test(loteItem) ? Number(loteItem) : null;
  const emLote = novo && indiceDoLote != null;

  const perfis = usePerfis();
  const medicos = useTodosOsMedicos();
  const existente = useRemedio(novo ? undefined : id);
  const { premium } = usePlano();
  const tratarAssinatura = useAssinaturaExigida();

  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

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
  const [fimTexto, setFimTexto] = useState('');

  // Padroes de repeticao e de fim.
  const [intervaloOutro, setIntervaloOutro] = useState(false);
  const [intervaloTexto, setIntervaloTexto] = useState('');
  const [repetir, setRepetir] = useState<Repetir>('todo');
  const [diasIntervaloTexto, setDiasIntervaloTexto] = useState('');
  const [diasSemana, setDiasSemana] = useState<number | null>(null);
  const [totalTexto, setTotalTexto] = useState('');

  // "Descreva como tomar".
  const [descricao, setDescricao] = useState('');
  const [interpretando, setInterpretando] = useState(false);
  const [erroIA, setErroIA] = useState<string | null>(null);

  /** Campos que vieram da foto ou da IA e a pessoa ainda nao tocou. */
  const [camposDaIA, setCamposDaIA] = useState<Set<CampoLido>>(new Set());
  const [receita, setReceita] = useState<{ foto: string; guardar: boolean } | null>(null);
  const [fotoDaCaixa, setFotoDaCaixa] = useState<string | null>(null);
  const [origemDaLeitura, setOrigemDaLeitura] = useState<{ readId: string; item: number } | null>(
    null,
  );

  /** A pessoa mexeu no campo: ele deixa de ser "da foto". */
  function conferido(campo: CampoLido) {
    setCamposDaIA((atual) => {
      if (!atual.has(campo)) return atual;
      const proximo = new Set(atual);
      proximo.delete(campo);
      return proximo;
    });
  }

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

  function aplicarCampos(c: CamposDoRascunho, lidos: CampoLido[]) {
    setNome(c.nome);
    setConcentracao(c.concentracao);
    setForma(c.forma);
    setQuantidade(c.quantidade);
    setEmbalagem(c.embalagem);
    setTipo(c.tipo);
    setIntervalo(c.intervalo);
    setHorarios(c.horarios);
    setInstrucoes(c.instrucoes);
    setFimTexto(isoParaData(c.fimDoTratamento));
    aplicarPadroes(c);
    setCamposDaIA(new Set(lidos));
  }

  // Cadastro novo: comeca no titular da conta.
  useEffect(() => {
    if (!novo || emLote || perfilId || !perfis.data) return;
    setPerfilId(perfis.data.find((p) => p.isAccountHolder)?.id ?? perfis.data[0]?.id ?? null);
  }, [novo, emLote, perfilId, perfis.data]);

  // Edicao: preenche UMA vez com o remedio do servidor. Uma nova busca em
  // segundo plano nao pode passar por cima do que a pessoa esta digitando.
  const remedio = existente.data?.remedio;
  const [preenchido, setPreenchido] = useState<string | null>(null);
  useEffect(() => {
    if (!remedio || preenchido === remedio.id) return;
    const m: Medication = remedio;
    setPreenchido(m.id);
    setPerfilId(m.profileId);
    setNome(m.name);
    setConcentracao(m.strength ?? '');
    setForma(
      (FORMAS as readonly string[]).includes(m.form ?? '')
        ? (m.form as (typeof FORMAS)[number])
        : 'outro',
    );
    setQuantidade(m.doseAmount != null ? String(m.doseAmount).replace('.', ',') : '');
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
  }, [remedio, preenchido]);

  // Revisao em lote: os campos vem do item da receita em memoria.
  useEffect(() => {
    if (!emLote) return;
    const item = lerReceita()?.itens[indiceDoLote!];
    if (!item) {
      // O lote venceu ou a pagina foi recarregada: nao ha o que revisar.
      navigate('/remedios', { replace: true });
      return;
    }
    aplicarCampos(item.campos, item.camposLidos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emLote, indiceDoLote]);

  // Leitura de um remedio so: o rascunho viaja em memoria, e o token da URL o resgata.
  useEffect(() => {
    if (!novo || !rascunho) return;
    const r = consumirRascunho(rascunho);
    if (!r) return;
    aplicarCampos(r.campos, r.camposLidos);
    if (r.prescritorId) setPrescritorId(r.prescritorId);
    setOrigemDaLeitura({ readId: r.readId, item: r.readItem });
    setReceita(r.kind === 'receita' && r.foto ? { foto: r.foto, guardar: false } : null);
    setFotoDaCaixa(r.kind === 'caixa' && r.foto ? r.foto : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novo, rascunho]);

  // Saiu da tela: a foto e o rascunho nao ficam para tras na memoria.
  useEffect(() => () => descartarRascunho(), []);

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

  /** "Descreva como tomar": a IA propoe a posologia. NAO salva — a pessoa confere. */
  async function preencherComIA() {
    const texto = descricao.trim();
    if (texto.length < 3) {
      setErroIA(
        'Escreva como deve ser tomado, por exemplo "1 comprimido a cada 8 horas por 7 dias".',
      );
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
      if (p.durationDays) {
        const fim = new Date();
        fim.setDate(fim.getDate() + p.durationDays);
        setFimTexto(dataLocalTexto(fim));
      }
      if (p.instructions && !instrucoes.trim()) {
        setInstrucoes(p.instructions);
        lidos.add('instrucoes');
      }
      setCamposDaIA(lidos);
    } catch (e) {
      if (tratarAssinatura(e)) return;
      setErroIA(mensagemDoErro(e));
    } finally {
      setInterpretando(false);
    }
  }

  function validar(): boolean {
    const novos: Record<string, string> = {};
    if (nome.trim().length < 2) novos.nome = 'Informe o nome do remédio';
    if (!emLote && !perfilId) novos.perfil = 'Escolha para quem é';

    if (tipo === 'fixed_times') {
      const validos = horarios.filter((h) => HORA.test(h));
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
    if (fimTexto.trim() && !dataDeFimParaISO(fimTexto)) {
      novos.endsAt = 'Use uma data futura, como 20/10/2026';
    }

    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (salvando) return;
    setErroGeral(null);
    if (!validar()) return;

    const fimISO = fimTexto.trim() ? dataDeFimParaISO(fimTexto) : null;
    const padroes = padroesParaSalvar();

    // Revisao em lote: devolve os campos ao lote e volta. Nada vai ao servidor
    // ate o "Confirmar e salvar" da tela da receita.
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
      navigate(-1);
      return;
    }

    const quantidadeNumero = Number(quantidade.replace(',', '.'));
    const embalagemNumero = Number(embalagem.replace(',', '.'));
    const dados = {
      name: nome.trim(),
      strength: concentracao.trim() || null,
      form: forma,
      doseAmount:
        Number.isFinite(quantidadeNumero) && quantidadeNumero > 0 ? quantidadeNumero : null,
      doseUnit: forma === 'outro' ? null : forma,
      packageAmount:
        Number.isFinite(embalagemNumero) && embalagemNumero > 0
          ? Math.round(embalagemNumero)
          : null,
      endsAt: fimISO,
      scheduleType: tipo,
      intervalHours: tipo === 'interval' ? intervalo : null,
      times: tipo === 'fixed_times' ? horarios.filter((h) => HORA.test(h)) : [],
      ...padroes,
      instructions: instrucoes.trim() || null,
      prescriberId: prescritorId,
    };

    setSalvando(true);
    try {
      let destino: string;
      if (novo) {
        const criado = await healthApi.createMedication({
          ...dados,
          profileId: perfilId!,
          photoReadId: origemDaLeitura?.readId ?? null,
          photoReadItem: origemDaLeitura?.item ?? null,
        });
        const anexos: MedicationPatch = {};
        if (receita?.guardar) anexos.prescriptionPhoto = receita.foto;
        if (fotoDaCaixa) anexos.packagePhoto = fotoDaCaixa;
        if (Object.keys(anexos).length > 0) {
          try {
            await healthApi.updateMedication(criado.id, anexos);
          } catch {
            // O remedio ja existe; so a foto ficou para depois.
            if (receita?.guardar) {
              void avisar(
                'Remédio cadastrado',
                'Não consegui guardar a receita agora. Dá para anexar depois, na tela do remédio.',
              );
            }
          }
        }
        destino = `/remedios/${criado.id}`;
      } else {
        await healthApi.updateMedication(id!, dados);
        destino = `/remedios/${id}`;
      }

      setReceita(null);
      setFotoDaCaixa(null);
      void queryClient.invalidateQueries({ queryKey: CHAVES.remedios });
      void queryClient.invalidateQueries({ queryKey: CHAVES.remedio(id ?? '') });
      // Vai para o remedio salvo: no navegador, "voltar" poderia cair de novo
      // na tela de leitura, com a foto ja descartada.
      navigate(destino, { replace: true });
    } catch (e) {
      if (e instanceof ApiRequestError && e.fields) setErros(e.fields);
      setErroGeral(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const carregando = (!novo && existente.isPending) || (!emLote && perfis.isPending);
  const titulo = novo && !emLote ? 'Novo remédio' : 'Editar remédio';
  const verbo = forma === 'jato' ? 'aplicar' : 'tomar';

  return (
    <Pagina area="medications" largura="formulario">
      <ScreenHeader title={titulo} voltar="historico" />

      {carregando ? (
        <Carregando />
      ) : !novo && !remedio ? (
        <p className={estilos.erroGeral} role="alert">
          {existente.isError ? mensagemDoErro(existente.error) : 'Remédio não encontrado.'}
        </p>
      ) : (
        <form onSubmit={salvar} noValidate>
          {!emLote ? (
            <SurfaceCard className={estilos.bloco}>
              <h2 className={estilos.blocoTitulo}>Para quem</h2>
              <Chips rotulo="Para quem">
                {(perfis.data ?? []).map((p) => (
                  <Chip
                    key={p.id}
                    rotulo={p.fullName.split(' ')[0]!}
                    ativo={p.id === perfilId}
                    disabled={!novo || salvando}
                    onClick={() => setPerfilId(p.id)}
                  />
                ))}
              </Chips>
              {erros.perfil ? (
                <p className={estilos.erroCampo} role="alert">
                  {erros.perfil}
                </p>
              ) : null}
              {!novo ? (
                <p className={estilos.blocoAjuda}>
                  Não dá para mudar de pessoa depois: o histórico de doses ficaria da pessoa
                  errada. Cadastre um remédio novo.
                </p>
              ) : null}
            </SurfaceCard>
          ) : null}

          <SurfaceCard className={estilos.bloco}>
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
              // So no nome, e especifico de proposito: e onde a correcao
              // silenciosa do modelo faz estrago — um nome pouco familiar vira
              // outro parecido, e passa batido porque "parece certo".
              aviso={
                camposDaIA.has('nome')
                  ? 'Confira o nome na caixa ou na receita, letra por letra. A leitura automática às vezes troca por um nome parecido.'
                  : undefined
              }
              autoCapitalize="words"
              readOnly={salvando}
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
              readOnly={salvando}
            />

            <p className={estilos.rotulo}>
              Forma {camposDaIA.has('forma') ? <SeloDaIA /> : null}
            </p>
            <Chips rotulo="Forma">
              {FORMAS.map((f) => (
                <Chip
                  key={f}
                  rotulo={f}
                  ativo={f === forma}
                  disabled={salvando}
                  onClick={() => {
                    conferido('forma');
                    setForma(f);
                  }}
                />
              ))}
            </Chips>

            {/* "Quantas vem na caixa", e NAO "Quantidade": a dose, no bloco de
                baixo, tambem e uma quantidade, e dois campos com a mesma
                palavra sao armadilha de digitacao num aplicativo de remedio. */}
            <FormField
              label="Quantas vêm na caixa"
              value={embalagem}
              onChangeText={(v) => {
                conferido('embalagem');
                setEmbalagem(v.replace(/\D/g, ''));
              }}
              placeholder="21"
              inputMode="numeric"
              maxLength={4}
              hint="Opcional. Usado para sugerir a quantidade ao registrar uma compra."
              error={erros.packageAmount}
              selo={camposDaIA.has('embalagem') ? <SeloDaIA /> : undefined}
              readOnly={salvando}
              className={estilos.ultimo}
            />
          </SurfaceCard>

          <SurfaceCard className={estilos.bloco}>
            <h2 className={estilos.blocoTitulo}>Quando {verbo}</h2>

            {/* Sem plano o campo NAO aparece desabilitado: um campo que aceita
                texto e nao faz nada e pior que nenhum. Vira uma linha com
                cadeado que explica e leva a assinatura. */}
            {premium ? (
              <div className={estilos.ia}>
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
                  readOnly={salvando || interpretando}
                  className={estilos.ultimo}
                />
                <button
                  type="button"
                  className={`${botoes.contorno} ${botoes.largo} ${estilos.botaoIA}`}
                  disabled={salvando || interpretando}
                  aria-busy={interpretando || undefined}
                  onClick={() => void preencherComIA()}
                >
                  {interpretando ? (
                    <span className={botoes.girando} />
                  ) : (
                    <Icone nome="zap" size={17} />
                  )}
                  Preencher com IA
                </button>
                {erroIA ? (
                  <p className={estilos.erroCampo} role="alert">
                    {erroIA}
                  </p>
                ) : null}
              </div>
            ) : (
              <Link
                to="/conta/assinatura"
                className={estilos.iaTrancada}
                aria-label="Descreva como tomar, com IA. Faz parte da assinatura."
              >
                <Icone nome="lock" size={18} color="var(--cor-accent-green)" />
                <span className={estilos.iaTrancadaTextos}>
                  <span className={estilos.iaTrancadaTitulo}>Descreva como tomar</span>
                  <span className={estilos.iaTrancadaTexto}>
                    A IA preenche os campos abaixo. Faz parte da assinatura.
                  </span>
                </span>
                <Icone nome="chevron-right" size={20} color="var(--cor-text-secondary)" />
              </Link>
            )}

            <FormField
              label={`Quanto ${verbo} por vez`}
              value={quantidade}
              onChangeText={(v) => {
                conferido('quantidade');
                setQuantidade(v);
              }}
              placeholder="1"
              inputMode="decimal"
              hint={forma === 'outro' ? undefined : forma === 'jato' ? 'Em jatos' : `Em ${forma}`}
              error={erros.doseAmount}
              selo={camposDaIA.has('quantidade') ? <SeloDaIA /> : undefined}
              readOnly={salvando}
            />

            <fieldset className={estilos.tipos} disabled={salvando}>
              <legend className="so-leitor-de-tela">Como é o horário</legend>
              {TIPOS.map((t) => (
                <label key={t.valor} className={estilos.tipo} data-ativo={t.valor === tipo ? '' : undefined}>
                  <input
                    type="radio"
                    name="tipo-de-horario"
                    className={estilos.radio}
                    checked={t.valor === tipo}
                    onChange={() => {
                      conferido('tipo');
                      setTipo(t.valor);
                    }}
                  />
                  <Icone
                    nome={t.valor === tipo ? 'check-circle' : 'circle'}
                    size={18}
                    color={t.valor === tipo ? 'var(--cor-accent-green)' : 'var(--cor-text-secondary)'}
                  />
                  <span>
                    <span className={estilos.tipoNome}>{t.rotulo}</span>
                    <span className={estilos.tipoAjuda}>{t.ajuda}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {tipo === 'interval' ? (
              <>
                <p className={estilos.rotulo}>
                  De quantas em quantas horas {camposDaIA.has('intervalo') ? <SeloDaIA /> : null}
                </p>
                <Chips rotulo="De quantas em quantas horas">
                  {INTERVALOS.map((h) => (
                    <Chip
                      key={h}
                      rotulo={h === 24 ? '1x ao dia' : `${h}h`}
                      ativo={h === intervalo && !intervaloOutro}
                      disabled={salvando}
                      onClick={() => {
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
                    disabled={salvando}
                    onClick={() => {
                      conferido('intervalo');
                      setIntervaloOutro(true);
                      setIntervaloTexto(String(intervalo));
                    }}
                  />
                </Chips>
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
                    inputMode="numeric"
                    maxLength={2}
                    hint="De 1 a 72 horas. Ex.: 48 = a cada 2 dias, no mesmo horário."
                    error={erros.intervalHours}
                    readOnly={salvando}
                  />
                ) : erros.intervalHours ? (
                  <p className={estilos.erroCampo} role="alert">
                    {erros.intervalHours}
                  </p>
                ) : null}
              </>
            ) : null}

            {tipo === 'fixed_times' ? (
              <>
                <p className={estilos.rotulo}>
                  Horários {camposDaIA.has('horarios') ? <SeloDaIA /> : null}
                </p>
                {horarios.map((h, i) => (
                  <div key={i} className={estilos.horarioLinha}>
                    <FormField
                      label={`Horário ${i + 1}`}
                      type="time"
                      value={h}
                      onChangeText={(v) => {
                        conferido('horarios');
                        setHorarios((atual) => atual.map((x, j) => (j === i ? v : x)));
                      }}
                      readOnly={salvando}
                      className={estilos.horario}
                    />
                    {horarios.length > 1 ? (
                      <button
                        type="button"
                        className={estilos.removerHorario}
                        disabled={salvando}
                        onClick={() => setHorarios((a) => a.filter((_, j) => j !== i))}
                        aria-label={`Remover o horário ${h || i + 1}`}
                      >
                        <Icone nome="x-circle" size={22} />
                      </button>
                    ) : null}
                  </div>
                ))}
                {erros.horarios || erros.times ? (
                  <p className={estilos.erroCampo} role="alert">
                    {erros.horarios ?? erros.times}
                  </p>
                ) : null}
                {horarios.length < 8 ? (
                  <button
                    type="button"
                    className={botoes.texto}
                    style={{ paddingLeft: 0 }}
                    disabled={salvando}
                    onClick={() => setHorarios((a) => [...a, ''])}
                  >
                    <Icone nome="plus" size={18} />
                    Adicionar horário
                  </button>
                ) : null}

                {/* Padrao de DIAS: so faz sentido com horario fixo. "A cada N
                    horas" ja cobre 48h/72h pelo intervalo livre. */}
                <p className={estilos.rotulo}>
                  Repetir {camposDaIA.has('repetir') ? <SeloDaIA /> : null}
                </p>
                <Chips rotulo="Repetir">
                  {REPETIR.map((r) => (
                    <Chip
                      key={r.valor}
                      rotulo={r.rotulo}
                      ativo={repetir === r.valor}
                      disabled={salvando}
                      onClick={() => {
                        conferido('repetir');
                        setRepetir(r.valor);
                      }}
                    />
                  ))}
                </Chips>
                {repetir === 'dias' ? (
                  <FormField
                    label="A cada quantos dias"
                    value={diasIntervaloTexto}
                    onChangeText={(v) => {
                      conferido('repetir');
                      setDiasIntervaloTexto(v.replace(/\D/g, '').slice(0, 2));
                    }}
                    placeholder="2"
                    inputMode="numeric"
                    maxLength={2}
                    hint="2 = dia sim, dia não. Conta a partir de hoje."
                    error={erros.dayInterval}
                    readOnly={salvando}
                  />
                ) : null}
                {repetir === 'semana' ? (
                  <>
                    <Chips rotulo="Dias da semana">
                      {DIAS_DA_SEMANA.map((d, i) => (
                        <Chip
                          key={d}
                          rotulo={d}
                          ativo={!!diasSemana && ((diasSemana >> i) & 1) === 1}
                          disabled={salvando}
                          onClick={() => alternarDia(i)}
                        />
                      ))}
                    </Chips>
                    {erros.weekdays ? (
                      <p className={estilos.erroCampo} role="alert">
                        {erros.weekdays}
                      </p>
                    ) : null}
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
                inputMode="numeric"
                maxLength={3}
                hint="Opcional. Os lembretes param depois da última dose."
                error={erros.totalDoses}
                selo={camposDaIA.has('total') ? <SeloDaIA /> : undefined}
                readOnly={salvando}
              />
            ) : null}

            <FormField
              label="Fim do tratamento"
              value={fimTexto}
              onChangeText={(v) => setFimTexto(formatarData(v))}
              placeholder="20/10/2026"
              inputMode="numeric"
              maxLength={10}
              hint="Opcional. Quando o tratamento termina — os lembretes param nesse dia."
              error={erros.endsAt}
              readOnly={salvando}
              className={estilos.ultimo}
            />
          </SurfaceCard>

          {/* AVISO, e nao pergunta. A caixinha e guardada sem perguntar porque e
              um produto de farmacia — mas a pessoa fica sabendo aqui, e a tela
              do remedio tem o botao de remover. */}
          {fotoDaCaixa ? (
            <SurfaceCard className={`${estilos.bloco} ${estilos.guardar}`}>
              <Icone nome="camera" size={20} color="var(--cor-accent-green)" />
              <span>
                <span className={estilos.guardarTitulo}>
                  A foto da caixinha fica guardada neste remédio
                </span>
                <span className={estilos.guardarAjuda}>
                  Ela aparece na tela do remédio, e dá para remover quando quiser.
                </span>
              </span>
            </SurfaceCard>
          ) : null}

          {/* A PERGUNTA mora aqui, na revisao, e nao num aviso depois de salvar.
              DESLIGADA por padrao: ligada seria "guardar sempre, a menos que
              voce repare", o oposto de perguntar. */}
          {receita ? (
            <SurfaceCard className={estilos.bloco}>
              <label className={estilos.guardar}>
                <input
                  type="checkbox"
                  className={estilos.caixaDeMarcar}
                  checked={receita.guardar}
                  disabled={salvando}
                  onChange={(e) => setReceita({ ...receita, guardar: e.target.checked })}
                />
                <span>
                  <span className={estilos.guardarTitulo}>
                    Guardar esta foto como a receita deste remédio
                  </span>
                  <span className={estilos.guardarAjuda}>
                    Ela fica na tela do remédio, para você ter em mãos na farmácia.
                  </span>
                </span>
              </label>
            </SurfaceCard>
          ) : null}

          <SurfaceCard className={estilos.bloco}>
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
              readOnly={salvando}
              className={(medicos.data ?? []).length > 0 ? undefined : estilos.ultimo}
            />

            {(medicos.data ?? []).length > 0 ? (
              <>
                <p className={estilos.rotulo}>Quem receitou</p>
                <div className={estilos.ultimo}>
                  <Chips rotulo="Quem receitou">
                    {(medicos.data ?? []).map((md) => (
                      <Chip
                        key={md.id}
                        rotulo={md.name}
                        ativo={md.id === prescritorId}
                        disabled={salvando}
                        onClick={() => setPrescritorId(prescritorId === md.id ? null : md.id)}
                      />
                    ))}
                  </Chips>
                </div>
              </>
            ) : null}
          </SurfaceCard>

          {erroGeral ? (
            <p className={estilos.erroGeral} role="alert">
              {erroGeral}
            </p>
          ) : null}

          <button
            type="submit"
            className={`${botoes.verde} ${botoes.largo} ${estilos.salvar}`}
            disabled={salvando}
            aria-busy={salvando || undefined}
          >
            {salvando ? <span className={botoes.girando} /> : null}
            {novo && !emLote ? 'Cadastrar remédio' : 'Salvar'}
          </button>
        </form>
      )}
    </Pagina>
  );
}
