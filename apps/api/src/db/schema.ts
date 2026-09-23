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
});

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('medications_profile_active_idx').on(t.profileId, t.isActive),
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
