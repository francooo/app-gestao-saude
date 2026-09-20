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
 * Codigos de erro da API. O app traduz o codigo para uma mensagem — o servidor
 * nunca manda texto pronto para o usuario final.
 */
export const API_ERROR = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
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
  [API_ERROR.INVALID_CREDENTIALS]: 'Usuario ou senha invalidos.',
  [API_ERROR.INVALID_REFRESH_TOKEN]: 'Sua sessao expirou. Entre novamente.',
  [API_ERROR.INVALID_RESET_TOKEN]: 'Este link de recuperacao expirou ou ja foi usado.',
  [API_ERROR.VALIDATION_ERROR]: 'Verifique os dados informados.',
  [API_ERROR.ACCOUNT_DISABLED]: 'Esta conta esta desativada. Fale com o suporte.',
  [API_ERROR.TOO_MANY_ATTEMPTS]: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  [API_ERROR.METHOD_NOT_ALLOWED]: 'Requisicao invalida.',
  [API_ERROR.INTERNAL_ERROR]: 'Algo deu errado do nosso lado. Tente novamente.',
};

export function messageForError(code: string | undefined): string {
  if (code && code in ERROR_MESSAGES_PT) return ERROR_MESSAGES_PT[code]!;
  return 'Nao foi possivel completar a operacao. Tente novamente.';
}
