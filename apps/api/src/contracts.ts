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
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof API_ERROR)[keyof typeof API_ERROR];
