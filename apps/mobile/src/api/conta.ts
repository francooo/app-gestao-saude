import { z } from 'zod';

import { request } from '@/api/client';

/**
 * As rotas da CONTA — o que fica atras da tela de Ajustes.
 *
 * Arquivo proprio, e nao dentro de health.ts, porque nada aqui e dominio de
 * saude: sao credenciais, consentimento e exclusao. Misturar faria o arquivo
 * que ja tem perfis, remedios, doses e consultas crescer com um assunto que
 * nao e dele.
 */

export const contaSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string().nullable(),
  createdAt: z.string(),
});
export type Conta = z.infer<typeof contaSchema>;

export const consentimentoSchema = z.object({
  policyVersion: z.string(),
  grantedAt: z.string(),
  /** Falso quando a politica mudou depois deste aceite. */
  atual: z.boolean(),
});
export type Consentimento = z.infer<typeof consentimentoSchema>;

export const contagensSchema = z.object({
  profiles: z.number(),
  medications: z.number(),
  doses: z.number(),
  prescriptions: z.number(),
  appointments: z.number(),
  assistantConversations: z.number(),
});
export type Contagens = z.infer<typeof contagensSchema>;

const perfilDaContaSchema = z.object({
  user: contaSchema,
  consent: consentimentoSchema.nullable(),
  policyVersion: z.string(),
  counts: contagensSchema.optional(),
});

export const contaApi = {
  /**
   * Revalida a conta contra o servidor.
   *
   * O aplicativo guarda e-mail e nome no armazenamento seguro no login e nunca
   * confere de novo. Sem isto, trocar o e-mail num aparelho deixaria o outro
   * mostrando o antigo por ate 60 dias.
   */
  perfil(comContagens = false): Promise<z.infer<typeof perfilDaContaSchema>> {
    return request(
      `/api/me/perfil${comContagens ? '?counts=true' : ''}`,
      { authenticated: true },
      (data) => perfilDaContaSchema.parse(data),
    );
  },

  trocarSenha(input: { currentPassword: string; newPassword: string }): Promise<void> {
    return request('/api/me/senha', { method: 'POST', body: input, authenticated: true }, () =>
      undefined,
    );
  },

  /**
   * Pede a troca de e-mail. NAO troca: manda o link para o endereco novo.
   *
   * Responde 204 tambem quando o endereco ja tem conta — a tela mostra a mesma
   * mensagem de "confira sua caixa" nos dois casos, de proposito. Distinguir
   * transformaria isto num verificador de quem tem conta no aplicativo.
   */
  pedirTrocaDeEmail(input: { currentPassword: string; newEmail: string }): Promise<void> {
    return request('/api/me/email', { method: 'POST', body: input, authenticated: true }, () =>
      undefined,
    );
  },

  aceitarPolitica(): Promise<Consentimento> {
    return request(
      '/api/me/consentimento',
      { method: 'POST', body: { acceptedPolicy: true }, authenticated: true },
      (data) => z.object({ consent: consentimentoSchema }).parse(data).consent,
    );
  },

  /** Irreversivel. A cascata do banco leva tudo. */
  apagarConta(currentPassword: string): Promise<void> {
    return request(
      '/api/me/apagar-conta',
      { method: 'POST', body: { currentPassword, confirmacao: true }, authenticated: true },
      () => undefined,
    );
  },
};
