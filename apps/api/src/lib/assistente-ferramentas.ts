/**
 * As ferramentas que o assistente pode chamar.
 *
 * Todas SOMENTE LEITURA. O modelo consulta a familia; nao marca dose, nao cria
 * consulta, nao apaga nada. Quando isso mudar, sera com confirmacao na tela —
 * uma escrita disparada por texto de uma pagina da internet e exatamente o que
 * a regra de "conteudo buscado e dado, nunca instrucao" nao consegue impedir
 * sozinha.
 *
 * DUAS DECISOES QUE SUSTENTAM A SEGURANCA DISTO:
 *
 * 1. O `userId` vem SEMPRE da sessao autenticada e NUNCA dos argumentos do
 *    modelo. Nenhuma ferramenta aceita id de conta ou de perfil. E o que
 *    impede uma pergunta manipulada — ou uma pagina hostil que o modelo leu —
 *    alcancar dados de outra familia.
 *
 * 2. As ferramentas recebem NOME, nao UUID. O modelo nunca viu um uuid dos
 *    dados desta conta, entao pedir um so produziria alucinacao. Nome errado
 *    devolve erro legivel com as opcoes reais, e ele se corrige na rodada
 *    seguinte.
 *
 * E uma ausencia deliberada: nada aqui calcula "hoje", "atrasado" ou "proxima
 * dose". O servidor roda em UTC e nao sabe o dia do aparelho; quem calcula
 * isso e o app, em lib/posologia.ts, e o resultado chega pronto no bloco de
 * contexto. Comparar instantes (consulta futura) e seguro e aparece abaixo;
 * dividir o tempo em dias nao e.
 */

import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import { db } from '../db/client';
import {
  appointments,
  medicationDoses,
  medicationTimes,
  medications,
  professionals,
  profiles,
} from '../db/schema';

/**
 * Tetos de linhas.
 *
 * Nao sao paginacao: sao contencao de tokens. Uma familia com muitos registros
 * poderia devolver um resultado maior que a propria janela util do modelo, e a
 * resposta pioraria em vez de melhorar.
 */
const MAXIMO_REMEDIOS = 40;
const MAXIMO_CONSULTAS = 20;
const MAXIMO_MEDICOS = 30;
const MAXIMO_DOSES = 20;

/** Quanto tempo para tras `listar_consultas` enxerga. */
const DIAS_DE_CONSULTA_PASSADA = 60;

/**
 * Tetos da ficha, mais apertados que os das listas de familia.
 *
 * A ficha e de UMA pessoa: quarenta remedios ali seriam quarenta de alguem so,
 * o que nao existe. Apertar e o que mantem a ficha barata o bastante para
 * valer a pena substituir duas chamadas por uma.
 */
const FICHA_REMEDIOS = 10;
const FICHA_MEDICOS = 8;
const FICHA_CONSULTAS = 4;

/** Ate onde a ficha olha para tras atras de medico vinculado por consulta. */
const DIAS_DE_VINCULO_MEDICO = 180;

/** Declaracao no formato de function calling da OpenAI, que o Groq fala. */
export const FERRAMENTAS = [
  {
    type: 'function',
    function: {
      name: 'listar_perfis',
      description:
        'Quem sao as pessoas da familia cadastradas, com data de nascimento, ' +
        'parentesco, peso e altura. Use para saber QUEM existe na casa. Para os ' +
        'dados completos de UMA pessoa, prefira ficha_da_pessoa.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ficha_da_pessoa',
      description:
        'A ficha completa de UMA pessoa numa consulta so: idade, peso (e quando ' +
        'foi anotado), altura, observacoes, os remedios ativos dela, os medicos ' +
        'ligados a ela e as proximas consultas. PREFIRA ESTA quando a pergunta ' +
        'for sobre uma pessoa especifica — ela substitui listar_perfis mais ' +
        'listar_remedios e economiza uma rodada. Obrigatoria antes de calcular ' +
        'qualquer dose por peso ou idade.',
      parameters: {
        type: 'object',
        properties: {
          pessoa: {
            type: 'string',
            description:
              'Nome da pessoa, como aparece no cadastro. Aceita so o primeiro nome. ' +
              'Se errar, o erro devolve a lista de quem existe.',
          },
        },
        required: ['pessoa'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_remedios',
      description:
        'Medicamentos cadastrados, com dose, forma, horarios, inicio, fim, ' +
        'instrucoes e quem prescreveu. Sem o argumento, traz os de toda a familia.',
      parameters: {
        type: 'object',
        properties: {
          pessoa: {
            type: 'string',
            description: 'Nome da pessoa, como aparece no cadastro. Aceita so o primeiro nome.',
          },
          incluir_encerrados: {
            type: 'boolean',
            description: 'Inclui tratamentos ja encerrados. Padrao: false.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_consultas',
      description:
        'Consultas agendadas e as recentes ja passadas, com data e hora em ' +
        'formato ISO com fuso, medico, especialidade, modalidade e local.',
      parameters: {
        type: 'object',
        properties: {
          pessoa: {
            type: 'string',
            description: 'Nome da pessoa. Sem isto, traz a familia toda.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_medicos',
      description:
        'Profissionais de saude cadastrados na conta, com especialidade, ' +
        'telefone, clinica, endereco e a nota que a familia deu.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'historico_de_doses',
      description:
        'Ultimas doses REGISTRADAS de um medicamento, com horario, situacao ' +
        '(tomada, pulada, atrasada) e observacoes. Use para saber se alguem ' +
        'tomou, nao para saber quando deve tomar.',
      parameters: {
        type: 'object',
        properties: {
          remedio: { type: 'string', description: 'Nome do medicamento.' },
          pessoa: {
            type: 'string',
            description: 'Desempata quando duas pessoas usam o mesmo remedio.',
          },
        },
        required: ['remedio'],
        additionalProperties: false,
      },
    },
  },
] as const;

/** Sem acento, sem caixa, sem espaco sobrando. "José" e "jose" sao o mesmo. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

type PerfilBasico = { id: string; nome: string };

/**
 * Do nome dito pelo modelo para os perfis reais da conta.
 *
 * Sem `pessoa`, devolve a familia inteira — "quais remedios temos em casa" e
 * uma pergunta legitima.
 *
 * O empate NAO e resolvido no chute. Com dois "Lucas" na familia, devolver o
 * primeiro faria o assistente falar do remedio da crianca errada com toda a
 * confianca do mundo. Melhor devolver erro e deixar ele perguntar.
 */
async function resolverPessoa(
  userId: string,
  pessoa: string | undefined,
): Promise<{ ok: true; perfis: PerfilBasico[] } | { ok: false; erro: string }> {
  const todos = await db
    .select({ id: profiles.id, nome: profiles.fullName })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.isActive, true)));

  if (todos.length === 0) return { ok: false, erro: 'Nenhuma pessoa cadastrada nesta conta.' };
  if (!pessoa) return { ok: true, perfis: todos };

  const alvo = normalizar(pessoa);
  const exatos = todos.filter((p) => normalizar(p.nome) === alvo);
  const parciais = todos.filter((p) => {
    const n = normalizar(p.nome);
    return n.includes(alvo) || alvo.includes(n);
  });

  const achados = exatos.length > 0 ? exatos : parciais;
  const nomes = todos.map((p) => p.nome).join(', ');

  if (achados.length === 0) {
    return { ok: false, erro: `Ninguem com esse nome. Pessoas cadastradas: ${nomes}.` };
  }
  if (achados.length > 1) {
    return {
      ok: false,
      erro:
        `"${pessoa}" corresponde a mais de uma pessoa: ${achados.map((p) => p.nome).join(', ')}. ` +
        'Pergunte a quem a pessoa se refere antes de responder.',
    };
  }

  return { ok: true, perfis: achados };
}

async function listarPerfis(userId: string) {
  const linhas = await db
    .select({
      nome: profiles.fullName,
      nascimento: profiles.birthDate,
      parentesco: profiles.relationship,
      peso_kg: profiles.weightKg,
      peso_anotado_em: profiles.weightMeasuredAt,
      altura_cm: profiles.heightCm,
      titular: profiles.isAccountHolder,
      observacoes: profiles.notes,
    })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.isActive, true)))
    .orderBy(desc(profiles.isAccountHolder), asc(profiles.fullName));

  // A idade sai como data de nascimento crua, de proposito: quem sabe que dia
  // e hoje e o horario do aparelho, que veio no texto de sistema — nao este
  // servidor, que roda em UTC.
  return {
    pessoas: linhas.map((p) => ({
      ...p,
      peso_anotado_em: p.peso_anotado_em?.toISOString() ?? null,
    })),
  };
}

async function listarRemedios(
  userId: string,
  args: { pessoa?: string; incluir_encerrados?: boolean },
) {
  const alvo = await resolverPessoa(userId, args.pessoa);
  if (!alvo.ok) return { erro: alvo.erro };

  return remediosDosPerfis(alvo.perfis, {
    incluirEncerrados: args.incluir_encerrados === true,
    limite: MAXIMO_REMEDIOS,
    de: args.pessoa,
  });
}

/**
 * O miolo da consulta de remedios, ja com os perfis resolvidos.
 *
 * Separado de `listarRemedios` porque a ficha da pessoa precisa exatamente
 * disto sem resolver o nome de novo — resolver duas vezes seria uma consulta a
 * mais e, pior, duas chances de as duas telas discordarem sobre quem e "Lucas".
 */
async function remediosDosPerfis(
  perfis: PerfilBasico[],
  opcoes: { incluirEncerrados: boolean; limite: number; de?: string },
) {
  const ids = perfis.map((p) => p.id);
  const nomePorId = new Map(perfis.map((p) => [p.id, p.nome]));

  const filtros = [inArray(medications.profileId, ids)];
  if (!opcoes.incluirEncerrados) filtros.push(eq(medications.isActive, true));

  const linhas = await db
    .select({
      id: medications.id,
      profileId: medications.profileId,
      nome: medications.name,
      concentracao: medications.strength,
      forma: medications.form,
      dose: medications.doseAmount,
      unidade: medications.doseUnit,
      tipo_de_horario: medications.scheduleType,
      intervalo_horas: medications.intervalHours,
      inicio: medications.startsAt,
      fim: medications.endsAt,
      instrucoes: medications.instructions,
      ativo: medications.isActive,
      prescritor: professionals.name,
    })
    .from(medications)
    .leftJoin(professionals, eq(professionals.id, medications.prescriberId))
    .where(and(...filtros))
    .orderBy(desc(medications.isActive), asc(medications.name))
    .limit(opcoes.limite);

  if (linhas.length === 0) {
    const de = opcoes.de ? ` para ${perfis[0]!.nome}` : '';
    return { remedios: [], aviso: `Nenhum medicamento cadastrado${de}.` };
  }

  // Horarios fixos numa consulta so, e nao uma por remedio.
  const horarios = await db
    .select({ medicationId: medicationTimes.medicationId, hora: medicationTimes.timeOfDay })
    .from(medicationTimes)
    .where(
      inArray(
        medicationTimes.medicationId,
        linhas.map((l) => l.id),
      ),
    )
    .orderBy(asc(medicationTimes.timeOfDay));

  const porRemedio = new Map<string, string[]>();
  for (const h of horarios) {
    const lista = porRemedio.get(h.medicationId) ?? [];
    lista.push(h.hora.slice(0, 5));
    porRemedio.set(h.medicationId, lista);
  }

  return {
    remedios: linhas.map(({ id, profileId, inicio, fim, ...resto }) => ({
      pessoa: nomePorId.get(profileId) ?? null,
      ...resto,
      inicio: inicio?.toISOString() ?? null,
      fim: fim?.toISOString() ?? null,
      horarios: porRemedio.get(id) ?? [],
    })),
  };
}

async function listarConsultas(userId: string, args: { pessoa?: string }) {
  const alvo = await resolverPessoa(userId, args.pessoa);
  if (!alvo.ok) return { erro: alvo.erro };

  return consultasDosPerfis(alvo.perfis, MAXIMO_CONSULTAS);
}

/** O miolo da consulta de agenda, ja com os perfis resolvidos. */
async function consultasDosPerfis(perfis: PerfilBasico[], limite: number) {
  const nomePorId = new Map(perfis.map((p) => [p.id, p.nome]));
  const desde = new Date(Date.now() - DIAS_DE_CONSULTA_PASSADA * 24 * 60 * 60 * 1000);

  // Comparar INSTANTES entre fusos e seguro: timestamptz e um ponto no tempo,
  // nao uma data de calendario. O que nao se pode fazer aqui, e nao se faz, e
  // agrupar por dia.
  const linhas = await db
    .select({
      profileId: appointments.profileId,
      titulo: appointments.title,
      quando: appointments.scheduledAt,
      duracao_min: appointments.durationMinutes,
      modalidade: appointments.modality,
      situacao: appointments.status,
      local: appointments.location,
      endereco: appointments.address,
      observacoes: appointments.notes,
      medico: professionals.name,
      especialidade: professionals.specialty,
    })
    .from(appointments)
    .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(
      and(
        inArray(
          appointments.profileId,
          perfis.map((p) => p.id),
        ),
        gte(appointments.scheduledAt, desde),
      ),
    )
    .orderBy(asc(appointments.scheduledAt))
    .limit(limite);

  return {
    consultas: linhas.map(({ profileId, quando, ...resto }) => ({
      pessoa: nomePorId.get(profileId) ?? null,
      quando: quando.toISOString(),
      ...resto,
    })),
  };
}

async function listarMedicos(userId: string) {
  const linhas = await db
    .select({
      nome: professionals.name,
      especialidade: professionals.specialty,
      telefone: professionals.phone,
      email: professionals.email,
      clinica: professionals.clinicName,
      endereco: professionals.address,
      nota_da_familia: professionals.myRating,
      observacoes: professionals.notes,
    })
    .from(professionals)
    .where(eq(professionals.userId, userId))
    .orderBy(asc(professionals.name))
    .limit(MAXIMO_MEDICOS);

  return { medicos: linhas };
}

/**
 * Os medicos ligados a UMA pessoa, e por que.
 *
 * `professionals` pertence a CONTA, nao ao perfil — nao existe coluna ligando
 * medico a pessoa, e criar uma exigiria migracao mais retrofit dos dados. Nao
 * e preciso: o vinculo ja esta gravado em dois lugares, quem RECEITOU um
 * remedio dela e quem ATENDEU uma consulta dela.
 *
 * O `por_que` nao e enfeite. Sem ele o assistente diria "o medico da Sofia e a
 * Dra. Ana", que e uma relacao que ninguem cadastrou. Com ele a frase vira
 * "a Dra. Ana receitou a dipirona da Sofia" — que e verificavel.
 */
async function medicosDoPerfil(profileId: string) {
  const desde = new Date(Date.now() - DIAS_DE_VINCULO_MEDICO * 24 * 60 * 60 * 1000);

  const [porReceita, porConsulta] = await Promise.all([
    db
      .select({
        id: professionals.id,
        nome: professionals.name,
        especialidade: professionals.specialty,
        telefone: professionals.phone,
        clinica: professionals.clinicName,
        remedio: medications.name,
        ativo: medications.isActive,
      })
      .from(medications)
      .innerJoin(professionals, eq(professionals.id, medications.prescriberId))
      .where(eq(medications.profileId, profileId)),

    db
      .select({
        id: professionals.id,
        nome: professionals.name,
        especialidade: professionals.specialty,
        telefone: professionals.phone,
        clinica: professionals.clinicName,
        quando: appointments.scheduledAt,
        titulo: appointments.title,
      })
      .from(appointments)
      .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
      .where(and(eq(appointments.profileId, profileId), gte(appointments.scheduledAt, desde))),
  ]);

  type Medico = {
    nome: string;
    especialidade: string | null;
    telefone: string | null;
    clinica: string | null;
    por_que: string[];
  };
  const porId = new Map<string, Medico>();

  const garantir = (l: { id: string; nome: string; especialidade: string | null; telefone: string | null; clinica: string | null }) => {
    const atual = porId.get(l.id);
    if (atual) return atual;
    const novo: Medico = {
      nome: l.nome,
      especialidade: l.especialidade,
      telefone: l.telefone,
      clinica: l.clinica,
      por_que: [],
    };
    porId.set(l.id, novo);
    return novo;
  };

  for (const l of porReceita) {
    garantir(l).por_que.push(
      `receitou ${l.remedio}${l.ativo ? '' : ' (tratamento encerrado)'}`,
    );
  }
  for (const l of porConsulta) {
    const rotulo = l.titulo ? ` (${l.titulo})` : '';
    garantir(l).por_que.push(`consulta em ${l.quando.toISOString()}${rotulo}`);
  }

  return [...porId.values()].slice(0, FICHA_MEDICOS);
}

/**
 * Tudo sobre UMA pessoa numa chamada so.
 *
 * Existe por causa do teto de rodadas do laco: sao quatro, e a ultima vai sem
 * ferramenta, entao restam TRES uteis. "Quanto de ibuprofeno para a Valentina"
 * gastava listar_perfis + listar_remedios + resposta, ou seja, as tres. Com a
 * ficha, duas — e cada rodada economizada e um reenvio inteiro do prompt numa
 * conta que tem 8 000 tokens por minuto.
 *
 * O argumento ser OBRIGATORIO e deliberado: errar o nome faz resolverPessoa
 * devolver "Ninguem com esse nome. Pessoas cadastradas: ...", ou seja, o erro
 * ja faz o trabalho do listar_perfis, na mesma rodada. Chutar o nome passou a
 * ser a estrategia certa, nao um risco.
 */
async function fichaDaPessoa(userId: string, args: { pessoa?: string }) {
  if (!args.pessoa) return { erro: 'Informe o nome da pessoa no argumento "pessoa".' };

  const alvo = await resolverPessoa(userId, args.pessoa);
  if (!alvo.ok) return { erro: alvo.erro };
  const perfil = alvo.perfis[0]!;

  const [linha] = await db
    .select({
      nome: profiles.fullName,
      nascimento: profiles.birthDate,
      parentesco: profiles.relationship,
      peso_kg: profiles.weightKg,
      peso_anotado_em: profiles.weightMeasuredAt,
      altura_cm: profiles.heightCm,
      titular: profiles.isAccountHolder,
      observacoes: profiles.notes,
    })
    .from(profiles)
    .where(eq(profiles.id, perfil.id))
    .limit(1);

  const [remedios, consultas, medicos, ultimas] = await Promise.all([
    remediosDosPerfis([perfil], { incluirEncerrados: false, limite: FICHA_REMEDIOS }),
    consultasDosPerfis([perfil], FICHA_CONSULTAS),
    medicosDoPerfil(perfil.id),
    /**
     * A ultima dose tomada de cada remedio, pelo NOME do remedio.
     *
     * Responde "ja dei dipirona pra ela hoje?" sem gastar uma chamada de
     * historico_de_doses — que e justamente o tipo de pergunta que aparece
     * junto com "quanto posso dar".
     *
     * Sai como instante ISO cru, e nao como "hoje as 8h": o servidor roda em
     * UTC e nao sabe o dia de quem pergunta. Comparar instantes e seguro;
     * dividir o tempo em dias nao e, e quem divide e o aplicativo.
     */
    db
      .select({
        remedio: medications.name,
        quando: sql<string | null>`max(${medicationDoses.takenAt})`,
      })
      .from(medicationDoses)
      .innerJoin(medications, eq(medications.id, medicationDoses.medicationId))
      .where(and(eq(medicationDoses.profileId, perfil.id), eq(medicationDoses.status, 'tomada')))
      .groupBy(medications.name),
  ]);

  /**
   * O que falta sai como LISTA e como frase, e nao so como campo nulo.
   *
   * Um `peso_kg: null` e facil de passar batido no meio de doze campos; uma
   * lista curta e uma frase direta sao salientes. E foi justamente passar
   * batido que produziu o defeito que esta entrega conserta.
   */
  const faltando: string[] = [];
  if (linha?.peso_kg == null) faltando.push('peso_kg');
  if (linha?.nascimento == null) faltando.push('nascimento');

  const aviso =
    faltando.length > 0
      ? `Faltam dados no cadastro de ${perfil.nome}: ${faltando.join(', ')}. Nao estime nenhum deles — pergunte a quem esta conversando.`
      : undefined;

  const aviso_medicos =
    medicos.length === 0
      ? 'Nenhum medico esta ligado a esta pessoa por receita ou por consulta. Isso NAO quer dizer que a familia nao tenha medicos: o cadastro de profissionais pertence a conta, e pode haver medicos sem vinculo com ninguem. Use listar_medicos para ver a agenda inteira.'
      : undefined;

  return {
    pessoa: {
      ...linha,
      peso_anotado_em: linha?.peso_anotado_em?.toISOString() ?? null,
    },
    ...(faltando.length > 0 ? { faltando, aviso } : {}),
    remedios: 'remedios' in remedios ? remedios.remedios : [],
    ultima_dose_tomada: ultimas,
    medicos,
    ...(aviso_medicos ? { aviso_medicos } : {}),
    consultas: 'consultas' in consultas ? consultas.consultas : [],
  };
}

async function historicoDeDoses(userId: string, args: { remedio?: string; pessoa?: string }) {
  if (!args.remedio) return { erro: 'Informe o nome do medicamento no argumento "remedio".' };

  const alvo = await resolverPessoa(userId, args.pessoa);
  if (!alvo.ok) return { erro: alvo.erro };

  const candidatos = await db
    .select({ id: medications.id, nome: medications.name, profileId: medications.profileId })
    .from(medications)
    .where(
      inArray(
        medications.profileId,
        alvo.perfis.map((p) => p.id),
      ),
    );

  const procurado = normalizar(args.remedio);
  const achados = candidatos.filter((m) => normalizar(m.nome).includes(procurado));

  if (achados.length === 0) {
    const nomes = candidatos.map((m) => m.nome).join(', ') || 'nenhum';
    return { erro: `Medicamento nao encontrado. Cadastrados: ${nomes}.` };
  }
  if (achados.length > 1) {
    const quais = achados.map((m) => `${m.nome} (${nomeDe(alvo.perfis, m.profileId)})`).join(', ');
    return { erro: `Mais de um medicamento casa com "${args.remedio}": ${quais}. Seja especifico.` };
  }

  const remedio = achados[0]!;

  const linhas = await db
    .select({
      agendada_para: medicationDoses.scheduledFor,
      tomada_em: medicationDoses.takenAt,
      situacao: medicationDoses.status,
      quantidade: medicationDoses.amount,
      observacoes: medicationDoses.notes,
    })
    .from(medicationDoses)
    .where(eq(medicationDoses.medicationId, remedio.id))
    .orderBy(desc(medicationDoses.takenAt))
    .limit(MAXIMO_DOSES);

  return {
    remedio: remedio.nome,
    pessoa: nomeDe(alvo.perfis, remedio.profileId),
    doses: linhas.map((d) => ({
      ...d,
      agendada_para: d.agendada_para?.toISOString() ?? null,
      tomada_em: d.tomada_em?.toISOString() ?? null,
    })),
  };
}

function nomeDe(perfis: PerfilBasico[], id: string): string | null {
  return perfis.find((p) => p.id === id)?.nome ?? null;
}

/**
 * Executa uma ferramenta e devolve o texto que volta ao modelo.
 *
 * NUNCA lanca. Argumento malformado, nome desconhecido e ate falha do banco
 * viram texto de erro dentro do resultado: o modelo le, se corrige e responde.
 * Se isto lancasse, um argumento torto derrubaria a conversa inteira com 500 —
 * e o defeito seria do assistente, nao da pergunta.
 */
export async function executarFerramenta(
  nome: string,
  argumentosJson: string,
  userId: string,
): Promise<string> {
  let args: Record<string, unknown> = {};
  if (argumentosJson && argumentosJson.trim() !== '') {
    try {
      args = JSON.parse(argumentosJson) as Record<string, unknown>;
    } catch {
      return JSON.stringify({ erro: 'Os argumentos nao eram JSON valido. Tente de novo.' });
    }
  }

  const texto = (chave: string): string | undefined => {
    const v = args[chave];
    return typeof v === 'string' && v.trim() !== '' ? v : undefined;
  };

  try {
    switch (nome) {
      case 'listar_perfis':
        return JSON.stringify(await listarPerfis(userId));
      case 'ficha_da_pessoa':
        return JSON.stringify(await fichaDaPessoa(userId, { pessoa: texto('pessoa') }));
      case 'listar_remedios':
        return JSON.stringify(
          await listarRemedios(userId, {
            pessoa: texto('pessoa'),
            incluir_encerrados: args.incluir_encerrados === true,
          }),
        );
      case 'listar_consultas':
        return JSON.stringify(await listarConsultas(userId, { pessoa: texto('pessoa') }));
      case 'listar_medicos':
        return JSON.stringify(await listarMedicos(userId));
      case 'historico_de_doses':
        return JSON.stringify(
          await historicoDeDoses(userId, { remedio: texto('remedio'), pessoa: texto('pessoa') }),
        );
      default:
        return JSON.stringify({ erro: `Ferramenta "${nome}" nao existe.` });
    }
  } catch (erro) {
    // Sem corpo no log: o que passa por aqui e dado de saude, e os registros da
    // Vercel ficam fora do Brasil.
    console.error('[assistente] ferramenta falhou', {
      ferramenta: nome,
      name: erro instanceof Error ? erro.name : 'unknown',
    });
    return JSON.stringify({ erro: 'A consulta a essa informacao falhou agora.' });
  }
}
