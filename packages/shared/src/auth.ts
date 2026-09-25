import { z } from 'zod';

/**
 * Contratos da API de autenticacao.
 *
 * Os mesmos schemas validam no app (antes de enviar, para dar feedback imediato)
 * e na funcao serverless (fonte da verdade — o cliente nunca e confiavel).
 *
 * Nota de produto: na UI o campo se chama "Usuario", mas o valor e um e-mail.
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
// 72 e o limite real do bcrypt: bytes alem disso sao silenciosamente ignorados.

/** Login nao aplica as regras de forca da senha — so exige que nao esteja vazia. */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Informe sua senha' }).max(72),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string().nullable(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Segundos ate o access token expirar. */
  expiresIn: z.number().int().positive(),
  user: publicUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/**
 * Schema do FORMULARIO de nova senha, com a confirmacao.
 *
 * Separado do contrato da API de proposito: a confirmacao existe para pegar
 * erro de digitacao na tela e nunca e enviada ao servidor.
 */
export const resetPasswordFormSchema = z
  .object({
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'As senhas não são iguais',
    path: ['passwordConfirmation'],
  });
export type ResetPasswordForm = z.infer<typeof resetPasswordFormSchema>;

/**
 * Codigos de erro da API. O app traduz o codigo para uma mensagem — o servidor
 * nunca manda texto pronto para o usuario final.
 */
export const API_ERROR = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /**
   * A senha atual informada nao confere, numa acao de quem JA esta logado.
   *
   * 403 e nao 401, e isso e load-bearing: o cliente faz retry automatico com
   * rotacao de refresh em qualquer 401 de requisicao autenticada (ver
   * client.ts). Um 401 aqui faria o aplicativo REENVIAR a senha errada
   * sozinho, gastando dois scrypt, contando duas tentativas no limite e
   * queimando uma rotacao de token a toa.
   *
   * Tambem nao reusa INVALID_CREDENTIALS: a mensagem daquele fala em "e-mail
   * ou senha", e estas telas nao tem campo de e-mail.
   */
  WRONG_PASSWORD: 'WRONG_PASSWORD',
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
  /** Erros do lado do cliente, nunca vindos da API. */
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_NOT_CONFIGURED: 'API_NOT_CONFIGURED',
} as const;

export type ApiErrorCode = (typeof API_ERROR)[keyof typeof API_ERROR];

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  /** Erros por campo, quando o codigo e VALIDATION_ERROR. */
  fields: z.record(z.string(), z.string()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Mensagens em pt-BR exibidas ao usuario, indexadas pelo codigo de erro. */
export const ERROR_MESSAGES_PT: Record<string, string> = {
  // "E-mail" e nao "Usuario": as duas telas rotulam o campo assim.
  [API_ERROR.INVALID_CREDENTIALS]: 'E-mail ou senha inválidos.',
  [API_ERROR.WRONG_PASSWORD]: 'Senha incorreta.',
  [API_ERROR.EMAIL_ALREADY_REGISTERED]: 'Já existe uma conta com este e-mail.',
  [API_ERROR.INVALID_REFRESH_TOKEN]: 'Sua sessão expirou. Entre novamente.',
  [API_ERROR.INVALID_RESET_TOKEN]: 'Este link de recuperação expirou ou já foi usado.',
  [API_ERROR.VALIDATION_ERROR]: 'Verifique os dados informados.',
  [API_ERROR.ACCOUNT_DISABLED]: 'Esta conta está desativada. Fale com o suporte.',
  [API_ERROR.TOO_MANY_ATTEMPTS]: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  [API_ERROR.METHOD_NOT_ALLOWED]: 'Requisição inválida.',
  [API_ERROR.ASSISTANT_LIMIT_REACHED]:
    'Você já usou as perguntas do assistente de hoje. Amanhã libera de novo.',
  [API_ERROR.ASSISTANT_TIMEOUT]:
    'A busca demorou demais. Tente perguntar de forma mais específica.',
  [API_ERROR.ASSISTANT_BUSY]:
    'O assistente atingiu o limite de uso deste minuto. Tente de novo em instantes.',
  [API_ERROR.INTERNAL_ERROR]: 'Algo deu errado do nosso lado. Tente novamente.',
  [API_ERROR.NETWORK_ERROR]: 'Sem conexão com o servidor. Verifique sua internet.',
  // Nao e problema da pessoa: o app foi publicado sem a URL da API.
  [API_ERROR.API_NOT_CONFIGURED]:
    'Esta versão do app está mal configurada e não consegue falar com o servidor. Avise o suporte.',
};

export function messageForError(code: string | undefined): string {
  if (code && code in ERROR_MESSAGES_PT) return ERROR_MESSAGES_PT[code]!;
  return 'Não foi possível completar a operação. Tente novamente.';
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

/**
 * Versao da politica de privacidade aceita no cadastro.
 *
 * Gravada junto do consentimento. Quando o texto da politica mudar, suba esta
 * versao: a LGPD exige saber a QUAL texto a pessoa consentiu, nao apenas que
 * consentiu. Sem isso, um consentimento antigo vira indefensavel.
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
    /**
     * Consentimento LGPD Art. 11. Precisa ser um aceite ativo — por isso
     * literal(true), e nao boolean: um payload sem o campo, ou com false,
     * e recusado pelo schema antes de chegar ao banco.
     */
    acceptedPolicy: z.literal(true, {
      message: 'É necessário aceitar a política de privacidade',
    }),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'As senhas não são iguais',
    path: ['passwordConfirmation'],
  });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** O cadastro ja devolve a sessao: a pessoa entra direto, sem relogar. */
export const registerResponseSchema = loginResponseSchema;
export type RegisterResponse = LoginResponse;
