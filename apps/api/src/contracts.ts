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
 * Ao mudar qualquer schema aqui, mude tambem em packages/shared/src/auth.ts.
 * Quando este arquivo passar de ~200 linhas, promova para o workspace e
 * resolva a configuracao da Vercel de uma vez.
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
