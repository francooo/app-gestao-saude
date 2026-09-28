import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * citext torna o e-mail unico sem diferenciar maiusculas, sem precisar
 * normalizar na aplicacao nem criar indice funcional.
 * Exige CREATE EXTENSION citext — adicionado a mao na migration 0000.
 */
const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Na UI o campo se chama "Usuario", mas o valor e um e-mail. */
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name'),
  isActive: boolean('is_active').notNull().default(true),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  /**
   * Ponto de referencia para as distancias ate os consultorios.
   *
   * Fica na conta, e nao no aparelho: "minha casa" e da pessoa, e trocar de
   * celular nao deveria zerar a referencia. Nulo = usar a posicao atual.
   */
  referenceLabel: text('reference_label'),
  referenceAddress: text('reference_address'),
  referenceLatitude: numeric('reference_latitude'),
  referenceLongitude: numeric('reference_longitude'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Uma sessao por dispositivo/login. A cadeia de refresh tokens vive dentro dela. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    ip: inet('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

/**
 * Cadeia rotativa de refresh tokens. Guardamos so o SHA-256 — o token ja tem
 * 256 bits de entropia, entao nao ha o que forcar bruta e argon2 aqui seria
 * desperdicio de CPU faturada.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** Aponta para o token que substituiu este na rotacao. */
    replacedBy: uuid('replaced_by'),
  },
  (t) => [
    index('refresh_tokens_session_id_idx').on(t.sessionId),
    index('refresh_tokens_expires_at_idx').on(t.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    requestedIp: inet('requested_ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('password_reset_tokens_user_id_idx').on(t.userId),
    index('password_reset_tokens_expires_at_idx').on(t.expiresAt),
  ],
);

/**
 * Tokens de confirmacao de troca de e-mail.
 *
 * Espelha password_reset_tokens, e existe pelo mesmo motivo que aquele: um
 * endereco so vale quando alguem prova que o le. A diferenca e o campo
 * `newEmail` — o endereco novo fica AQUI, e nao em `users`, ate a confirmacao
 * chegar. Sem isso, um erro de digitacao trocaria o e-mail para um endereco
 * inexistente e a conta ficaria irrecuperavel no dia em que a senha fosse
 * esquecida, com o historico de saude da familia dentro.
 *
 * O e-mail antigo continua valendo o tempo todo, e recebe um aviso de que a
 * troca foi pedida.
 */
export const emailChangeTokens = pgTable(
  'email_change_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** citext pelo mesmo motivo de users.email: caixa nao distingue endereco. */
    newEmail: citext('new_email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    requestedIp: inet('requested_ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('email_change_tokens_user_id_idx').on(t.userId),
    index('email_change_tokens_expires_at_idx').on(t.expiresAt),
  ],
);

/** Janela deslizante para limitar tentativas de login por e-mail e por IP. */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    emailTry: text('email_try').notNull(),
    ip: inet('ip'),
    success: boolean('success').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('login_attempts_email_created_idx').on(t.emailTry, t.createdAt),
    index('login_attempts_ip_created_idx').on(t.ip, t.createdAt),
  ],
);

/**
 * LGPD Art. 11: dado de saude e dado pessoal sensivel e exige consentimento
 * especifico e destacado. A tabela nasce agora porque reconstruir a
 * procedencia do consentimento depois e inviavel.
 */
export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  policyVersion: text('policy_version').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  ip: inet('ip'),
  userAgent: text('user_agent'),
}, (t) => [
  /**
   * A tabela nasceu sem indice nenhum, e a consulta que ela serve e sempre a
   * mesma: a ULTIMA linha de um usuario, por granted_at desc. Isso roda a cada
   * abertura do aplicativo (me/perfil) e agora tambem no caminho da leitura de
   * foto, que recusa quem nao aceitou a versao corrente da politica.
   */
  index('consents_user_granted_idx').on(t.userId, t.grantedAt),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;

// ===========================================================================
// Dominio de saude
//
// Tudo pendura em `profiles`, nunca direto em `users`: um medicamento ou uma
// consulta e sempre DE ALGUEM. O titular da conta tambem e um perfil (criado
// no cadastro), entao nao existe caminho especial para "os meus dados".
//
// LGPD: isto e dado pessoal sensivel (Art. 11). A cadeia de cascade abaixo
// faz o direito a exclusao funcionar sem codigo extra — apagar a linha em
// `users` leva tudo junto.
// ===========================================================================

export const scheduleTypeEnum = pgEnum('schedule_type', [
  /** A cada N horas, a partir de starts_at. */
  'interval',
  /** Em horarios fixos do dia — ver medication_times. */
  'fixed_times',
  /** Se necessario, sem horario definido. */
  'as_needed',
]);

export const doseStatusEnum = pgEnum('dose_status', ['tomada', 'pulada', 'atrasada']);

export const appointmentModalityEnum = pgEnum('appointment_modality', [
  'presencial',
  'teleconsulta',
]);

export const appointmentStatusEnum = pgEnum('appointment_status', [
  'agendada',
  'realizada',
  'cancelada',
  'faltou',
]);

export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant']);

/** Perfis da familia. O centro do modelo. */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    /** Idade importa em posologia, sobretudo pediatrica. */
    birthDate: date('birth_date'),
    /** titular | filho(a) | conjuge | mae | pai | outro */
    relationship: text('relationship'),
    /**
     * Nulo = derivar do nome no app (ver pickAvatarColor).
     *
     * O cadastro grava a cor JA RESOLVIDA, em vez de deixar nulo: derivar do
     * nome faz a pessoa mudar de cor quando alguem corrige o nome dela, e o
     * circulo colorido e justamente como se reconhece quem e quem na tela.
     * Os perfis antigos com nulo seguem derivando.
     */
    avatarColor: text('avatar_color'),
    notes: text('notes'),
    /** Foto como data URI JPEG, nos mesmos termos de professionals.photo. */
    photo: text('photo'),
    /**
     * Peso ATUAL em quilos. Substitui a medicao anterior; nao ha historico.
     *
     * Existe porque dose pediatrica se calcula por peso. A curva de
     * crescimento, que e o que o pediatra acompanha, exigiria uma tabela de
     * medicoes — fica para depois, apoiada nesta coluna.
     */
    weightKg: numeric('weight_kg'),
    /**
     * Altura ATUAL em CENTIMETROS inteiros: 170, ou 52 num bebe.
     *
     * Centimetro inteiro e nao metro decimal: ninguem registra altura com mais
     * precisao que isso, e inteiro evita ponto flutuante. A tela converte para
     * metros na borda, porque e como as pessoas escrevem.
     */
    heightCm: integer('height_cm'),
    /**
     * Quando o peso acima foi anotado. Preenchido pelo SERVIDOR, nunca pela
     * tela — ninguem deveria ter que datar a propria medicao.
     *
     * Existe porque peso e um valor unico, sem historico, e o assistente
     * tratava como se fosse de hoje. Num bebe, o peso de tres meses atras ja
     * esta errado — e dose pediatrica se calcula por quilo. Com a data, ele
     * passa a dizer "o cadastro tem 14 kg, anotados em 12/06; confirma?" em
     * vez de multiplicar por um numero velho em silencio.
     *
     * Nulo nos perfis que ja tinham peso antes desta coluna existir: nao da
     * para inventar a data de uma medicao passada, e fingir que foi hoje seria
     * pior que admitir que nao se sabe.
     */
    weightMeasuredAt: timestamp('weight_measured_at', { withTimezone: true }),
    isAccountHolder: boolean('is_account_holder').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('profiles_user_id_idx').on(t.userId),
    // Indice parcial: garante no maximo UM titular por conta, sem impedir
    // varios dependentes.
    uniqueIndex('profiles_one_holder_per_user_idx')
      .on(t.userId)
      .where(sql`${t.isAccountHolder}`),
    check('profiles_photo_size', sql`${t.photo} IS NULL OR length(${t.photo}) <= 40000`),
    // Fora destas faixas e erro de digitacao, e o banco recusando e melhor que
    // a tela exibindo "0,5 kg" para um adulto.
    check(
      'profiles_weight_range',
      sql`${t.weightKg} IS NULL OR (${t.weightKg} >= 0.5 AND ${t.weightKg} <= 500)`,
    ),
    check(
      'profiles_height_range',
      sql`${t.heightCm} IS NULL OR (${t.heightCm} >= 20 AND ${t.heightCm} <= 250)`,
    ),
  ],
);

/**
 * Profissionais de saude.
 *
 * Pertencem a CONTA, nao ao perfil: o mesmo pediatra costuma atender mais de
 * um filho, e duplicar o cadastro por crianca sujaria a agenda.
 */
export const professionals = pgTable(
  'professionals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    specialty: text('specialty'),
    phone: text('phone'),
    email: text('email'),
    clinicName: text('clinic_name'),
    /** CEP guardado a parte para reconsultar o ViaCEP sem reescrever tudo. */
    postalCode: text('postal_code'),
    address: text('address'),
    /**
     * Preenchidos pela geocodificacao NO SERVIDOR ao salvar o endereco.
     * Ficam nulos quando o endereco nao e reconhecido — endereco ruim nao
     * pode impedir o cadastro, apenas tira o medico do mapa.
     */
    latitude: numeric('latitude'),
    longitude: numeric('longitude'),
    /**
     * SUA nota, de 1 a 5. Privada por construcao: mora em professionals, que
     * ja e escopado por user_id. Nao existe agregacao entre contas, entao nao
     * ha como virar nota publica por acidente.
     */
    myRating: smallint('my_rating'),
    ratingNote: text('rating_note'),
    /** Modalidade habitual; cada consulta pode sobrescrever. */
    defaultModality: appointmentModalityEnum('default_modality'),
    notes: text('notes'),
    /**
     * Foto do medico, como data URI JPEG em base64.
     *
     * Mora AQUI, e nao num servico de arquivos, por tres motivos:
     * o cliente HTTP do app so fala JSON (ver client.ts), entao base64
     * atravessa a pilha existente sem parser multipart; a exclusao em cascata
     * a partir de users ja apaga a foto junto, que e o direito ao apagamento
     * da LGPD sem codigo novo; e nao nasce URL publica de um terceiro.
     *
     * O app reduz para 200x200 antes de enviar, o que da ~10 KB.
     */
    photo: text('photo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('professionals_user_id_idx').on(t.userId),
    check(
      'professionals_rating_range',
      sql`${t.myRating} IS NULL OR (${t.myRating} >= 1 AND ${t.myRating} <= 5)`,
    ),
    /**
     * Ultima linha de defesa do tamanho da foto. O teto real e o do contrato
     * (30 000 caracteres), que devolve erro de validacao legivel; se esta
     * checagem chegar a disparar, alguem escreveu no banco por fora da API.
     */
    check('professionals_photo_size', sql`${t.photo} IS NULL OR length(${t.photo}) <= 40000`),
  ],
);

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** set null: apagar o cadastro do medico nao deve apagar o historico. */
    professionalId: uuid('professional_id').references(() => professionals.id, {
      onDelete: 'set null',
    }),
    title: text('title'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes'),
    modality: appointmentModalityEnum('modality').notNull().default('presencial'),
    location: text('location'),
    address: text('address'),
    status: appointmentStatusEnum('status').notNull().default('agendada'),
    /**
     * Antecedencia do lembrete, em minutos. Nulo = sem lembrete.
     *
     * O banco guarda a INTENCAO; o agendamento em si vive no aparelho. Guardar
     * aqui o id da notificacao seria errado — ele e local de cada celular, e um
     * id do aparelho A nao significa nada no aparelho B.
     */
    reminderMinutesBefore: integer('reminder_minutes_before'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('appointments_profile_scheduled_idx').on(t.profileId, t.scheduledAt),
    index('appointments_scheduled_idx').on(t.scheduledAt),
  ],
);

export const medications = pgTable(
  'medications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** "Amoxicilina" */
    name: text('name').notNull(),
    /** "500mg" */
    strength: text('strength'),
    /** capsula | comprimido | ml | gotas */
    form: text('form'),
    doseAmount: numeric('dose_amount'),
    doseUnit: text('dose_unit'),
    /**
     * Quantas unidades vem na embalagem: "21 capsulas" e 21, com form
     * 'capsula'. A unidade NAO e coluna nova — e o `form` que ja existe.
     *
     * NASCE SEM CONSUMIDOR, e isso foi decidido com o custo a vista: nada no
     * aplicativo desconta dose daqui nem avisa que esta acabando. E um numero
     * guardado ate existir o aviso de reposicao, que e quem vai dar uso a ele.
     */
    packageAmount: integer('package_amount'),
    scheduleType: scheduleTypeEnum('schedule_type').notNull(),
    /** Preenchido apenas quando scheduleType = 'interval'. */
    intervalHours: integer('interval_hours'),
    /** Ancora do intervalo e inicio do tratamento. */
    startsAt: timestamp('starts_at', { withTimezone: true }),
    /** Tratamento com prazo definido. */
    endsAt: timestamp('ends_at', { withTimezone: true }),
    instructions: text('instructions'),
    prescriberId: uuid('prescriber_id').references(() => professionals.id, {
      onDelete: 'set null',
    }),
    isActive: boolean('is_active').notNull().default(true),
    /**
     * De qual leitura de foto este medicamento saiu, e de qual item dela.
     *
     * DUAS COLUNAS ESCALARES, e nao um jsonb com a proposta. A seta aponta
     * desta direcao porque UMA receita gera N medicamentos; guardar a proposta
     * aqui duplicaria o mesmo texto em cada um. E um uuid e um smallint nao
     * pesam nas tres consultas que leem esta linha inteira (ver o cabecalho de
     * medication_attachments).
     *
     * E o que permite comparar o que a IA propos com o que foi salvo. Sem
     * isso nao ha como separar "a IA errou" de "a IA errou e ninguem
     * conferiu" — e a segunda e a unica que interessa investigar.
     */
    photoReadId: uuid('photo_read_id').references(() => medicationPhotoReads.id, {
      onDelete: 'set null',
    }),
    photoReadItem: smallint('photo_read_item'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('medications_profile_active_idx').on(t.profileId, t.isActive),
    // Espelha o teto do contrato. Uma embalagem com 0 unidades nao existe, e
    // 9999 ja cobre frasco de 1000 ml com folga.
    check(
      'medications_package_amount_range',
      sql`${t.packageAmount} IS NULL OR (${t.packageAmount} >= 1 AND ${t.packageAmount} <= 9999)`,
    ),
    // Um medicamento "a cada N horas" sem o N e um registro que o app nao
    // consegue exibir nem lembrar. Melhor o banco recusar do que a tela quebrar.
    check(
      'medications_interval_requires_hours',
      sql`${t.scheduleType} <> 'interval' OR (${t.intervalHours} IS NOT NULL AND ${t.intervalHours} > 0)`,
    ),
  ],
);

/**
 * Horarios fixos de um medicamento.
 *
 * Tabela separada em vez de array porque "08:00 e 20:00" precisa ser
 * consultavel para gerar lembretes, e array nao se indexa bem para isso.
 */
export const medicationTimes = pgTable(
  'medication_times',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicationId: uuid('medication_id')
      .notNull()
      .references(() => medications.id, { onDelete: 'cascade' }),
    timeOfDay: time('time_of_day').notNull(),
  },
  (t) => [
    index('medication_times_medication_idx').on(t.medicationId),
    uniqueIndex('medication_times_unique_idx').on(t.medicationId, t.timeOfDay),
  ],
);

/**
 * As fotos de um medicamento: a receita, e a caixa.
 *
 * SAO DUAS ESPECIES NA MESMA TABELA, separadas por `kind`, e elas tem
 * SENSIBILIDADES DIFERENTES — e essa diferenca e a razao de o aplicativo
 * trata-las de formas opostas, entao precisa estar escrita aqui:
 *
 *  - 'receita' carrega o nome do paciente, o nome e o CRM de um profissional
 *    que nunca consentiu com este aplicativo, e muitas vezes o diagnostico
 *    escrito a mao. Por isso ela SO e guardada quando a pessoa pede, numa
 *    caixa de selecao desligada por padrao.
 *  - 'caixa' e uma embalagem de farmacia: nome comercial, concentracao,
 *    laboratorio. Por isso ela e guardada sem perguntar, quando a pessoa
 *    cadastra o remedio fotografando a embalagem — e pode ser removida a
 *    qualquer momento na tela de detalhe. O botao de remover NAO E OPCIONAL:
 *    e comum a farmacia colar na caixa a etiqueta com o nome do paciente, e
 *    sem saida o recurso viraria uma armadilha.
 *
 * TABELA SEPARADA, E NAO UMA COLUNA EM `medications`. O motivo esta no codigo,
 * nao na teoria: tres consultas fazem `select` da LINHA INTEIRA de medications
 * — o ownership.ts, que roda em toda requisicao ao detalhe (inclusive ao
 * registrar uma dose), a listagem, e o montar() do detalhe. Uma coluna de
 * ~300 KB entraria nas tres EM SILENCIO, e a tela inicial passaria a baixar a
 * receita de todos os remedios da familia a cada abertura. Nada no typecheck
 * pegaria; so a conta de trafego e o tempo de carga.
 *
 * O mesmo isolamento protege o assistente do caminho ACIDENTAL: ele seleciona
 * colunas explicitas hoje, mas um `select()` distraido num refactor mandaria a
 * receita inteira para um modelo de terceiro. Daqui, nao ha como.
 *
 * O QUE MUDOU, e que este paragrafo precisa dizer para nao mentir: existe
 * agora um caminho DELIBERADO. O `POST /api/assistant/ler-foto` envia uma foto
 * de receita ao Groq, fora do Brasil, para extrair os campos do medicamento.
 * Ele NAO passa por esta tabela — le o data URI do corpo da requisicao e nao
 * grava imagem nenhuma. Quem grava continua sendo o PATCH, depois, se a pessoa
 * pedir. Ou seja: esta tabela nunca e ORIGEM de envio para fora; ela e so
 * destino, e e isso que o paragrafo acima continua garantindo.
 *
 * Aquele caminho exige consentimento na versao corrente da politica, que subiu
 * por causa dele: o que a receita carrega passou a SAIR DO PAIS, e nao so a
 * ficar guardado aqui.
 *
 * LGPD: a cascata users -> profiles -> medications -> aqui faz o direito ao
 * apagamento funcionar sem codigo novo. Note que `prescriberId` e `set null`
 * de proposito — apagar o cadastro do medico NAO apaga a receita, que e do
 * paciente.
 *
 * O que uma receita fotografada carrega, e que justifica todo o cuidado acima:
 * nome do paciente, nome e CRM de um profissional que nunca consentiu com este
 * aplicativo, e muitas vezes o diagnostico escrito a mao.
 */
export const medicationAttachments = pgTable(
  'medication_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicationId: uuid('medication_id')
      .notNull()
      .references(() => medications.id, { onDelete: 'cascade' }),
    /**
     * 'receita' | 'caixa'.
     *
     * `text` + check em vez de pgEnum pelo mesmo motivo ja escrito em
     * medication_photo_reads: um terceiro tipo e plausivel (bula, pedido de
     * exame), e acrescentar valor a um enum do Postgres e ALTER TYPE, que o
     * drizzle-kit gera mal. Sao as MESMAS duas palavras que o rastro da
     * leitura por foto usa, entao da para cruzar os dois sem traducao.
     *
     * SEM `.default`, e isso e deliberado: com default, o tipo do drizzle
     * deixaria este campo OPCIONAL no insert, e um anexo que esquecesse de
     * informa-lo viraria receita em silencio. Sem ele, esquecer nao compila.
     *
     * O default existiu por uma migracao so, para rotular as linhas antigas
     * (eram todas receita) sem backfill e para manter a API anterior
     * funcionando durante a janela de implantacao.
     */
    kind: text('kind').notNull(),
    /** Data URI JPEG em base64, nos mesmos termos de professionals.photo. */
    photo: text('photo').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * UMA foto por remedio E POR TIPO.
     *
     * Era uma por remedio, e o comentario dizia "por enquanto, soltar este
     * indice depois e mudanca aditiva". O depois chegou: um remedio agora pode
     * ter a receita E a caixa ao mesmo tempo.
     *
     * Ele e o que faz "trocar a foto" ser um onConflictDoUpdate limpo em vez
     * de delete+insert — e o alvo daquele conflito passa a ser AS DUAS
     * COLUNAS. Sem isso, trocar criaria uma segunda linha e o detalhe passaria
     * a mostrar uma das duas ao acaso.
     */
    uniqueIndex('medication_attachments_one_per_kind_idx').on(t.medicationId, t.kind),
    check('medication_attachments_kind', sql`${t.kind} in ('receita', 'caixa')`),
    /**
     * Ultima linha de defesa do tamanho, mais folgada que o teto do contrato
     * (500 000). Se ESTA checagem disparar, alguem escreveu no banco por fora
     * da API. A folga tambem e proposital: se 1280 px nao bastar para ler uma
     * receita manuscrita, subir a resolucao mexe so no app e no contrato.
     */
    check('medication_attachments_photo_size', sql`length(${t.photo}) <= 700000`),
    /**
     * O prefixo para sem o ";base64," DE PROPOSITO.
     *
     * O drizzle-kit quebra os comandos do arquivo de migration no ponto e
     * virgula, sem enxergar aspas. Com `LIKE 'data:image/jpeg;base64,%'` o
     * SQL gerado sai cortado no meio do literal, com a string aberta, e a
     * migration nao aplica. Foi visto acontecer, nao suposto.
     *
     * Nao se perde quase nada: o formato completo e validado pela expressao
     * regular do contrato. Isto aqui e a ultima linha de defesa contra algo
     * escrito no banco por fora da API, e 'data:image/jpeg%' ja barra um PNG
     * ou um binario cru.
     */
    check('medication_attachments_photo_format', sql`${t.photo} LIKE 'data:image/jpeg%'`),
  ],
);

/**
 * Cada vez que uma foto de receita ou de caixa foi mandada para a IA ler.
 *
 * FAZ DUAS COISAS QUE PARECEM UMA SO, e e por isso que e tabela e nao coluna:
 *
 * 1. E O CONTADOR do teto diario. Os dois tetos do assistente contam linhas em
 *    `assistant_messages`; uma leitura de foto nao gera mensagem nenhuma e
 *    escaparia dos dois. E o teto precisa contar as leituras ABANDONADAS —
 *    e justamente isso que um laco com defeito produz. Um contador que so
 *    enxerga o caso bem-sucedido nao e contador.
 *
 * 2. E O RASTRO. Vale o mesmo argumento escrito em `assistant_messages.
 *    tool_trace`, com mais forca: la o modelo escrevia um numero numa resposta
 *    de texto; aqui ele escreve um numero de dose que vira LEMBRETE. Se um dia
 *    alguem disser "o aplicativo mandou dar 10 ml", a pergunta e se aquele 10
 *    foi lido da receita, inventado pelo modelo, ou digitado pela pessoa.
 *
 * A LINHA NASCE ANTES DA CHAMADA, com outcome 'enviada'. Diverge de
 * mensagem.ts, que so grava quando ha resposta, e a divergencia e deliberada:
 * o que esta auditoria registra e A TRANSFERENCIA, nao o resultado. A foto
 * saiu do Brasil mesmo quando a leitura falhou. Uma linha 'enviada' orfa e o
 * registro de uma funcao cortada no meio da inferencia — informacao, nao lixo.
 *
 * NAO GUARDA A IMAGEM. Nunca. Guarda o texto cru que o modelo devolveu
 * (cortado) e a proposta que montamos a partir dele — sem o cru nao ha como
 * separar "o modelo errou" de "o nosso mapeador errou". E a mesma regra do
 * tool_trace, que tambem nao guarda o texto das paginas lidas.
 *
 * LGPD: o que fica aqui e dado de saude transcrito (nomes de remedio,
 * posologia, nome de quem receitou). A cascata users -> aqui apaga junto.
 */
export const medicationPhotoReads = pgTable(
  'medication_photo_reads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Para quem a leitura foi feita, quando o aplicativo soube dizer.
     * `set null` e nao cascade: apagar um perfil nao deve apagar o registro de
     * que uma foto saiu do pais.
     */
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    /** 'receita' | 'caixa' — sao prompts diferentes, e o rastro precisa saber qual. */
    kind: text('kind').notNull(),
    model: text('model'),
    /** 'enviada' | 'lida' | 'vazia' | 'falha' */
    outcome: text('outcome').notNull().default('enviada'),
    /** { bruto: <texto do modelo, cortado>, proposto: <o corpo devolvido> } */
    proposal: jsonb('proposal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Os dois tetos (dia e minuto) saem de UMA consulta sobre este indice. */
    index('medication_photo_reads_user_created_idx').on(t.userId, t.createdAt),
    /**
     * `text` + check em vez de pgEnum nos dois campos abaixo: um terceiro tipo
     * e plausivel (bula, pedido de exame), e acrescentar valor a um enum do
     * Postgres e ALTER TYPE, que o drizzle-kit gera mal. `medications.form` ja
     * abre o precedente de texto livre com a restricao no contrato.
     *
     * Nenhum literal aqui tem ponto e virgula, pelo motivo explicado no check
     * de formato de medication_attachments.
     */
    check('medication_photo_reads_kind', sql`${t.kind} in ('receita', 'caixa')`),
    check(
      'medication_photo_reads_outcome',
      sql`${t.outcome} in ('enviada', 'lida', 'vazia', 'falha')`,
    ),
  ],
);

/**
 * Registro de doses. E daqui que sai o "Ultima dose ha 2h" da tela inicial:
 * max(taken_at) por medicamento.
 */
export const medicationDoses = pgTable(
  'medication_doses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicationId: uuid('medication_id')
      .notNull()
      .references(() => medications.id, { onDelete: 'cascade' }),
    /**
     * Desnormalizado de proposito: a tela inicial precisa das doses de hoje da
     * familia inteira, e sem esta coluna toda consulta passaria por um join
     * com medications.
     */
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Nulo quando o medicamento e 'as_needed'. */
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    takenAt: timestamp('taken_at', { withTimezone: true }),
    status: doseStatusEnum('status').notNull().default('tomada'),
    amount: numeric('amount'),
    notes: text('notes'),
    /** Quem registrou — util quando mais de um adulto cuida da mesma pessoa. */
    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('medication_doses_medication_taken_idx').on(t.medicationId, t.takenAt),
    index('medication_doses_profile_taken_idx').on(t.profileId, t.takenAt),
    /**
     * Uma dose por horario agendado.
     *
     * Precisa ser do BANCO, nao do handler: dois toques em "tomei" sao duas
     * invocacoes concorrentes, e "consulta se existe, senao insere" perde a
     * corrida. E o caso nao e hipotetico aqui — mae e pai marcando a dose das
     * 14h nos dois celulares e o uso esperado deste aplicativo.
     *
     * O WHERE deixa 'as_needed' de fora de proposito: duas dipironas no mesmo
     * dia sao duas doses reais, nao duplicata.
     */
    uniqueIndex('medication_doses_slot_unique_idx')
      .on(t.medicationId, t.scheduledFor)
      .where(sql`${t.scheduledFor} IS NOT NULL`),
  ],
);

/**
 * Conversas com o assistente.
 *
 * DECISAO REGISTRADA: o usuario optou por guardar sem prazo de exclusao.
 * Sao perguntas sobre saude, ou seja, dado pessoal sensivel acumulando
 * indefinidamente. `created_at` esta indexado para que uma rotina de expurgo
 * possa ser ligada depois sem precisar de migration.
 *
 * As tabelas nao decidem o comportamento: o que o assistente pode responder
 * continua sendo uma decisao em aberto.
 */
export const assistantConversations = pgTable(
  'assistant_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Sobre quem e a duvida. Nulo = pergunta geral. */
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assistant_conversations_user_idx').on(t.userId, t.updatedAt),
    index('assistant_conversations_created_idx').on(t.createdAt),
  ],
);

export const assistantMessages = pgTable(
  'assistant_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => assistantConversations.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    /**
     * Qual modelo gerou a resposta. Num app de saude, poder rastrear o que foi
     * respondido e por qual modelo e o minimo para investigar uma resposta
     * problematica depois.
     */
    model: text('model'),
    /**
     * Rastro do que o assistente fez para chegar nesta resposta: quantas
     * rodadas, quais ferramentas com quais argumentos, se buscou na internet e
     * quais fontes citou.
     *
     * Existe porque o escopo deixou de ser estreito. Se um dia alguem disser
     * "o aplicativo mandou dar 10 ml", a unica pergunta que importa e de onde
     * veio o numero — do cadastro da familia, de uma pagina da internet, ou do
     * proprio modelo. Sem isto nao ha resposta.
     *
     * NAO guarda o texto das paginas nem o raciocinio do modelo: volume grande
     * e dado sensivel duplicado, sem ganho de investigacao.
     */
    toolTrace: jsonb('tool_trace'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assistant_messages_conversation_idx').on(t.conversationId, t.createdAt),
    index('assistant_messages_created_idx').on(t.createdAt),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Professional = typeof professionals.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Medication = typeof medications.$inferSelect;
export type MedicationDose = typeof medicationDoses.$inferSelect;
export type AssistantConversation = typeof assistantConversations.$inferSelect;
export type AssistantMessage = typeof assistantMessages.$inferSelect;
