import { z } from 'zod';

/**
 * Contratos da API.
 *
 * DUPLICADO DE PROPOSITO a partir de packages/shared/src/auth.ts.
 *
 * O app mobile importa de @gestao/shared; esta copia existe para apps/api nao
 * depender do workspace pnpm. Funcoes da Vercel com dependencia "workspace:*"
 * exigem "Include files outside of the root directory" e um install que
 * atravessa o monorepo — um ponto de falha remoto e chato de depurar logo no
 * primeiro deploy.
 *
 * ATENCAO ao escopo dessa duplicacao: so o bloco de AUTENTICACAO tem copia em
 * packages/shared/src/auth.ts. Profissionais, consultas e medicamentos existem
 * so aqui — o espelho deles no aplicativo e apps/mobile/src/api/health.ts, que
 * valida RESPOSTA, nao entrada. Crescer a metade de baixo deste arquivo nao
 * aumenta duplicacao nenhuma.
 *
 * Por isso a regra antiga ("promova ao passar de 200 linhas") foi revista: a
 * promocao continua valendo a pena, mas como commit ISOLADO, cujo diff inteiro
 * seja o limite de modulo e cujo criterio de aceite seja "deploy verde, zero
 * mudanca de comportamento". Junto de outra coisa, um deploy quebrado nao diz
 * qual das duas causou.
 */

export const emailSchema = z
  .email({ message: 'Informe um e-mail valido' })
  .trim()
  .toLowerCase()
  .max(254, { message: 'E-mail muito longo' });

export const passwordSchema = z
  .string()
  .min(8, { message: 'A senha deve ter ao menos 8 caracteres' })
  .max(72, { message: 'A senha deve ter no maximo 72 caracteres' });

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Informe sua senha' }).max(72),
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const API_ERROR = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  /**
   * Teto diario de perguntas ao assistente.
   *
   * Nao reusa TOO_MANY_ATTEMPTS: a mensagem daquele fala em "aguarde alguns
   * minutos", o que mentiria sobre um limite que so vira no dia seguinte.
   */
  ASSISTANT_LIMIT_REACHED: 'ASSISTANT_LIMIT_REACHED',
  /**
   * O laco do assistente estourou o prazo antes de qualquer texto.
   *
   * Separado do INTERNAL_ERROR porque a acao do usuario e outra: aqui vale
   * perguntar de forma mais especifica, nao tentar de novo igual.
   */
  ASSISTANT_TIMEOUT: 'ASSISTANT_TIMEOUT',
  /**
   * O provedor de IA recusou por excesso de uso no minuto.
   *
   * Separado porque a espera e de SEGUNDOS, nao do dia: mandar a pessoa
   * "tentar amanha" seria mentira.
   */
  ASSISTANT_BUSY: 'ASSISTANT_BUSY',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof API_ERROR)[keyof typeof API_ERROR];

// ---------------------------------------------------------------------------
// Cadastro — espelha packages/shared/src/auth.ts
// ---------------------------------------------------------------------------

/**
 * Versao da politica de privacidade aceita no cadastro. Gravada junto do
 * consentimento: a LGPD exige saber a QUAL texto a pessoa consentiu.
 * Ao mudar o texto da politica, suba esta versao nos DOIS arquivos.
 */
export const POLICY_VERSION = '2026-09-20';

export const fullNameSchema = z
  .string()
  .trim()
  .min(3, { message: 'Informe seu nome completo' })
  .max(120, { message: 'Nome muito longo' })
  .refine((v) => v.includes(' '), { message: 'Informe nome e sobrenome' });

export const registerRequestSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: z.string(),
    // literal(true) e nao boolean: um payload sem o campo, ou com false,
    // e recusado antes de chegar ao banco. O aceite tem que ser ativo.
    acceptedPolicy: z.literal(true, {
      message: 'E necessario aceitar a politica de privacidade',
    }),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'As senhas nao sao iguais',
    path: ['passwordConfirmation'],
  });

// ---------------------------------------------------------------------------
// Profissionais de saude ("meus medicos")
//
// Escopados por conta. A nota e SUA, privada: nao existe agregacao entre
// contas, entao nao ha como virar avaliacao publica por acidente.
// ---------------------------------------------------------------------------

export const modalityValues = ['presencial', 'teleconsulta'] as const;

export const professionalInputSchema = z.object({
  name: z.string().trim().min(2, { message: 'Informe o nome' }).max(120),
  specialty: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().max(254).optional().nullable(),
  clinicName: z.string().trim().max(120).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  defaultModality: z.enum(modalityValues).optional().nullable(),
  myRating: z.number().int().min(1).max(5).optional().nullable(),
  ratingNote: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  /**
   * Foto como data URI JPEG. So JPEG porque o unico produtor e o
   * ImageManipulator do app, que sempre salva JPEG — aceitar PNG abriria um
   * caminho nunca exercitado e com armadilha propria (transparencia virando
   * fundo preto na conversao).
   *
   * O teto de 30 000 caracteres (~22 KB binarios) e o dobro do que uma foto
   * 200x200 costuma ocupar. Ele define o pior caso da listagem, que devolve a
   * foto de cada medico embutida. O app ja comprime em laco ate caber, entao
   * na pratica isto aqui e rede de seguranca.
   *
   * O .regex vem ANTES do .nullable: invertido, o null seria testado contra a
   * expressao e a remocao da foto quebraria.
   */
  photo: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/, {
      message: 'Formato de imagem inválido',
    })
    .max(30_000, { message: 'A foto ficou grande demais' })
    .optional()
    .nullable(),
});

/** No PATCH todos os campos sao opcionais, inclusive o nome. */
export const professionalPatchSchema = professionalInputSchema.partial();

// ---------------------------------------------------------------------------
// Consultas
//
// Uma consulta pertence a um PERFIL, nao a conta. Toda verificacao de dono
// passa por um join com profiles — filtrar so pelo id da consulta deixaria
// alguem ler ou criar consulta no perfil de outra conta.
// ---------------------------------------------------------------------------

export const appointmentStatusValues = [
  'agendada',
  'realizada',
  'cancelada',
  'faltou',
] as const;

/** Antecedencias oferecidas na tela. Nulo = sem lembrete. */
export const reminderOptions = [30, 60, 120, 24 * 60, 48 * 60] as const;

export const appointmentInputSchema = z.object({
  profileId: z.uuid({ message: 'Escolha para quem é a consulta' }),
  professionalId: z.uuid().optional().nullable(),
  title: z.string().trim().max(120).optional().nullable(),
  /** ISO 8601 com fuso. O app envia o instante absoluto. */
  scheduledAt: z.iso.datetime({ offset: true, message: 'Data ou hora inválida' }),
  durationMinutes: z.number().int().min(5).max(480).optional().nullable(),
  modality: z.enum(modalityValues).default('presencial'),
  location: z.string().trim().max(200).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  reminderMinutesBefore: z.number().int().min(0).max(10080).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const appointmentPatchSchema = appointmentInputSchema
  .omit({ profileId: true })
  .partial()
  .extend({ status: z.enum(appointmentStatusValues).optional() });

// ---------------------------------------------------------------------------
// Medicamentos
//
// Como as consultas, um medicamento pertence a um PERFIL, nao a conta: a
// verificacao de dono passa por um join com profiles.
//
// O servidor NAO TEM OPINIAO SOBRE FUSO HORARIO, e isso e deliberado. Ele roda
// em UTC; um CURRENT_DATE aqui viraria o dia as 21h de Brasilia, e em silencio.
// Alem disso medication_times.time_of_day e hora de parede ("08:00"), sem fuso,
// entao o servidor nem teria como transformar aquilo num instante.
//
// Portanto: o aplicativo calcula "hoje", calcula os horarios e manda o
// scheduledFor de cada dose ja resolvido em ISO com offset. Aqui so se guarda e
// se filtra instante absoluto.
// ---------------------------------------------------------------------------

export const scheduleTypeValues = ['interval', 'fixed_times', 'as_needed'] as const;

/**
 * Formas oferecidas na tela.
 *
 * A coluna no banco e texto livre, e o seed gravou 'cápsula' e 'gotas' COM
 * acento — o aplicativo normaliza antes de escolher o icone.
 */
export const medicationFormValues = ['cápsula', 'comprimido', 'ml', 'gotas', 'outro'] as const;

/** Horario de parede, HH:MM. O Postgres completa os segundos. */
export const horarioSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Horário inválido' });

/**
 * Objeto PLANO, sem refine, de proposito: em zod, .superRefine() devolve um
 * ZodEffects, que nao tem .partial() — e o PATCH precisa de .partial(). A
 * consistencia entre scheduleType, intervalHours e times fica em
 * validarPosologia(), no handler, que e onde da para mesclar o corpo do PATCH
 * com a linha que ja esta no banco.
 */
export const medicationBaseSchema = z.object({
  name: z.string().trim().min(2, { message: 'Informe o nome do remédio' }).max(120),
  /** "500mg" */
  strength: z.string().trim().max(40).optional().nullable(),
  form: z.enum(medicationFormValues).optional().nullable(),
  doseAmount: z.number().positive().max(9999).optional().nullable(),
  doseUnit: z.string().trim().max(20).optional().nullable(),
  scheduleType: z.enum(scheduleTypeValues),
  intervalHours: z.number().int().min(1).max(72).optional().nullable(),
  times: z.array(horarioSchema).max(8).default([]),
  startsAt: z.iso.datetime({ offset: true }).optional().nullable(),
  endsAt: z.iso.datetime({ offset: true }).optional().nullable(),
  instructions: z.string().trim().max(1000).optional().nullable(),
  prescriberId: z.uuid().optional().nullable(),
});

export const medicationInputSchema = medicationBaseSchema.extend({
  profileId: z.uuid({ message: 'Escolha para quem é o remédio' }),
});

/**
 * profileId esta ausente de proposito, e o motivo aqui e mais forte que nas
 * consultas: medication_doses.profile_id e desnormalizado. Mover o remedio de
 * perfil deixaria todo o historico de doses apontando para a pessoa errada, e
 * nada no banco detecta isso.
 */
/**
 * A foto da receita medica.
 *
 * FICA FORA DO medicationBaseSchema de proposito, e so aparece no PATCH. O
 * anexo e uma acao da tela de DETALHE, nao do formulario de cadastro; deixar o
 * POST de criacao de fora mantem aquele caminho intocado. Acrescentar depois e
 * mudanca aditiva.
 *
 * O teto e de 500 000 caracteres (~375 KB binarios), contra os 30 000 da foto
 * de perfil. A diferenca nao e generosidade: aquela foto e um rosto em 200x200
 * e esta e um DOCUMENTO que precisa ser lido. Uma receita A5 fotografada a
 * 1280 px da cerca de 215 dpi, o suficiente para letra manuscrita com zoom; em
 * 200x200 daria 13 dpi, ou seja, nada. O app para em 400 000, para esta
 * validacao ser rede de seguranca de verdade e nao o mecanismo que a pessoa
 * encontra.
 *
 * O .regex vem ANTES do .nullable, pelo mesmo motivo ja documentado na foto do
 * medico: invertido, o null seria testado contra a expressao e REMOVER a
 * receita quebraria com "Formato de imagem invalido".
 */
export const prescriptionPhotoSchema = z
  .string()
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/, {
    message: 'Formato de imagem inválido',
  })
  .max(500_000, { message: 'A foto da receita ficou grande demais' })
  .optional()
  .nullable();

export const medicationPatchSchema = medicationBaseSchema
  .partial()
  .extend({ isActive: z.boolean().optional(), prescriptionPhoto: prescriptionPhotoSchema });

/** Janela de busca das doses. O aplicativo manda o dia dele, com offset. */
export const medicationQuerySchema = z.object({
  profileId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  includeInactive: z.enum(['true', 'false']).optional(),
});

export const doseInputSchema = z.object({
  /** Nulo para 'as_needed'. E a chave da idempotencia: uma dose por horario. */
  scheduledFor: z.iso.datetime({ offset: true }).optional().nullable(),
  /** Ausente = agora. */
  takenAt: z.iso.datetime({ offset: true }).optional().nullable(),
  /**
   * 'atrasada' nao entra: e estado DERIVADO (horario vencido sem dose), nao
   * fato registrado. Quem deriva e a tela.
   */
  status: z.enum(['tomada', 'pulada']).default('tomada'),
  amount: z.number().positive().max(9999).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Perfis da familia
//
// Um perfil e uma PESSOA da familia, e e a raiz do dominio de saude: remedios,
// consultas e doses apontam para ele, TODOS em cascata. Apagar um perfil
// destroi todo o historico clinico daquela pessoa — por isso a tela oferece
// remover (isActive: false) como acao primaria, e o apagar de vez fica atras
// de segunda confirmacao com os numeros reais.
// ---------------------------------------------------------------------------

/**
 * Parentescos oferecidos na tela.
 *
 * 'titular' fica DE FORA de proposito: quem escreve essa string e o cadastro
 * da conta, que insere direto sem passar por schema. Aceita-la aqui deixaria
 * rotular um dependente como "titular" sem ele ser o isAccountHolder — duas
 * verdades divergentes sobre quem e o dono da conta.
 */
export const relationshipValues = [
  'cônjuge',
  'filho',
  'filha',
  'mãe',
  'pai',
  'avó',
  'avô',
  'outro',
] as const;

/** Teto de pessoas ativas por conta. Ver o comentario em profiles/index.ts. */
export const MAXIMO_DE_PERFIS = 20;

export const profileInputSchema = z.object({
  /**
   * NAO reusa o fullNameSchema do cadastro: aquele exige sobrenome, e um
   * filho chamado so "Lucas" e um perfil perfeitamente legitimo. Cobrar
   * sobrenome de uma crianca seria uma mensagem sem sentido.
   */
  fullName: z.string().trim().min(2, { message: 'Informe o nome' }).max(120),
  /**
   * O refine vai no CAMPO, e nao no objeto: refine de objeto devolve um
   * ZodEffects, que nao tem .partial() — e o PATCH precisa de .partial().
   * Mesma armadilha ja documentada em medicationBaseSchema.
   *
   * O servidor roda em UTC, a frente de Brasilia, entao "hoje" aqui nunca e
   * anterior ao "hoje" do usuario: uma data valida no Brasil jamais e
   * recusada por este limite.
   */
  birthDate: z.iso
    .date({ message: 'Data inválida' })
    .refine((v) => v <= new Date().toISOString().slice(0, 10), {
      message: 'A data de nascimento não pode estar no futuro',
    })
    .optional()
    .nullable(),
  relationship: z.enum(relationshipValues).optional().nullable(),
  /**
   * Regex e nao z.enum da paleta: copiar as cores de packages/shared para ca
   * criaria uma segunda fonte de verdade que ninguem lembraria de atualizar,
   * e o comentario do topo deste arquivo proibe depender do workspace. Cor e
   * dado de exibicao, nao fronteira de seguranca.
   */
  avatarColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Cor inválida' })
    .optional()
    .nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  /**
   * Peso em quilos e altura em CENTIMETROS inteiros.
   *
   * As faixas espelham os checks do banco, para o erro sair 400 com o campo
   * em vez de 500 vindo do Postgres. Altura em centimetro inteiro porque
   * ninguem mede com mais precisao, e inteiro evita ponto flutuante — a tela
   * converte para metros na borda.
   */
  weightKg: z.number().min(0.5, { message: 'Peso fora do esperado' }).max(500, {
    message: 'Peso fora do esperado',
  }).optional().nullable(),
  heightCm: z.number().int().min(20, { message: 'Altura fora do esperado' }).max(250, {
    message: 'Altura fora do esperado',
  }).optional().nullable(),
  /** Mesmos termos da foto do medico — ver professionalInputSchema. */
  photo: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/, {
      message: 'Formato de imagem inválido',
    })
    .max(30_000, { message: 'A foto ficou grande demais' })
    .optional()
    .nullable(),
});

/**
 * isActive so no PATCH: e ele que remove e restaura.
 *
 * isAccountHolder nao entra em lugar nenhum. O indice unico parcial
 * profiles_one_holder_per_user_idx garante um titular por conta; um PATCH que
 * marcasse um segundo bateria em violacao de unicidade e sairia como 500.
 * Trocar de titular e outra funcionalidade, com transacao de dois passos.
 */
export const profilePatchSchema = profileInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

export const profileQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).optional(),
});

// ---------------------------------------------------------------------------
// Assistente de saude
//
// O escopo e deliberado e estreito: o assistente responde sobre os dados que a
// PROPRIA familia cadastrou — quais remedios, que horas e a proxima dose,
// quando e a proxima consulta. Ele nao indica remedio, nao diz dose e nao
// interpreta sintoma. Ver src/lib/assistente-prompt.ts, onde a regra vive e
// esta comentada.
//
// O CONTEXTO vem pronto do aplicativo, e nao e montado aqui: o servidor roda
// em UTC e nao tem opiniao sobre fuso, enquanto "proxima dose" depende do
// relogio do aparelho. Calcular isso no servidor seria uma segunda
// implementacao do mesmo calculo, divergindo com o tempo.
// ---------------------------------------------------------------------------

/** Teto do bloco de contexto. Uma familia grande nao pode estourar a janela. */
export const CONTEXTO_MAXIMO = 8_000;

/** Perguntas por dia, por conta. */
export const PERGUNTAS_POR_DIA = 50;

/**
 * Buscas na internet por dia, por conta.
 *
 * Existe porque a conta MUDOU DE ESCALA quando a busca entrou: uma pergunta
 * sem busca custa ~US$ 0,0002; com busca, entre US$ 0,01 e 0,03. Cinquenta
 * perguntas com busca passariam de um dolar por dia.
 *
 * Ao estourar, o assistente NAO falha: ele perde a internet pelo resto do dia
 * e segue respondendo com a base e com o proprio conhecimento. Degradar em
 * silencio e melhor que uma tela de erro por um teto de custo.
 */
export const BUSCAS_POR_DIA = 10;

export const assistantAskSchema = z.object({
  profileId: z.uuid().optional().nullable(),
  question: z
    .string()
    .trim()
    .min(2, { message: 'Escreva sua dúvida' })
    .max(1000, { message: 'Pergunta muito longa' }),
  /** Bloco de texto com os dados da pessoa, montado pelo aplicativo. */
  context: z.string().max(CONTEXTO_MAXIMO).optional().nullable(),
  /**
   * Horario local do aparelho e o fuso dele.
   *
   * OPCIONAIS de proposito, e isso nao e zelo: os aplicativos ja instalados
   * nao mandam esses campos, e `eas update` nao e instantaneo — alguem pode
   * estar dias sem abrir. Campo novo obrigatorio quebraria esses bundles.
   * Sem eles, o servidor degrada: fala em UTC e avisa o modelo disso.
   */
  agora: z.iso.datetime({ offset: true }).optional(),
  fusoHorario: z.string().max(60).optional(),
});

export const assistantHistorySchema = z.object({
  profileId: z.uuid().optional(),
});
