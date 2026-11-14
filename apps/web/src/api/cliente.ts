import {
  loginResponseSchema,
  type ForgotPasswordRequest,
  type LoginRequest,
  type PublicUser,
  type RegisterRequest,
  type ResetPasswordRequest,
} from '@gestao/shared';
import { configurarCliente, rawRequest, request } from '@gestao/shared/api/client';
import { z } from 'zod';

/**
 * A ponta web do cliente HTTP compartilhado.
 *
 * O access token (15 min) fica SO em memoria: nada de localStorage, onde
 * qualquer script da pagina o leria. O refresh token o JavaScript nem ve — ele
 * mora num cookie httpOnly que o BFF (server/rotas.ts) grava e le. Recarregar
 * a pagina perde o access token, e `renovar` busca outro com o cookie.
 */
let accessToken: string | null = null;
let aoExpirar: (() => void) | null = null;

export function definirAoExpirar(handler: (() => void) | null): void {
  aoExpirar = handler;
}

const renovacaoSchema = z.object({ accessToken: z.string() });

async function pedirRenovacao(): Promise<string | null> {
  const resposta = await rawRequest('/api/auth/refresh', { method: 'POST' });
  if (!resposta.ok) {
    // 5xx e falha do servidor, nao sessao morta: lanca, e o cliente tenta depois.
    if (resposta.status >= 500 || resposta.status === 429) throw new Error('renovacao indisponivel');
    accessToken = null;
    return null;
  }
  const dado = renovacaoSchema.safeParse(await resposta.json());
  accessToken = dado.success ? dado.data.accessToken : null;
  return accessToken;
}

/**
 * Renova a sessao, uma aba por vez.
 *
 * A API rotaciona o refresh token a cada uso e trata um token repetido como
 * roubo: revoga a sessao inteira. Duas abas abertas renovando ao mesmo tempo
 * mandariam o mesmo cookie e uma derrubaria a outra. O Web Lock faz a segunda
 * aba esperar a primeira terminar — e ai o cookie dela ja e o novo.
 */
async function renovar(): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    const token: string | null = await navigator.locks.request('gs-renovar-sessao', () =>
      pedirRenovacao(),
    );
    return token;
  }
  return pedirRenovacao();
}

configurarCliente({
  // Mesma origem: quem atende /api e o BFF.
  baseUrl: '',
  getAccessToken: () => accessToken,
  renovar,
  aoExpirar: () => aoExpirar?.(),
  fetchInit: { credentials: 'same-origin' },
});

/** O que o BFF devolve no login: a resposta da API sem o refresh token. */
const sessaoSchema = loginResponseSchema.omit({ refreshToken: true });

function guardar(dado: unknown): PublicUser {
  const sessao = sessaoSchema.parse(dado);
  accessToken = sessao.accessToken;
  return sessao.user;
}

export const authApi = {
  /**
   * `lembrar` nao vai para a API: o servidor do site (BFF) o le para decidir
   * se o cookie da sessao dura 60 dias ou so ate o navegador fechar.
   */
  login(payload: LoginRequest, lembrar = false): Promise<PublicUser> {
    return request('/api/auth/login', { method: 'POST', body: { ...payload, lembrar } }, guardar);
  },

  register(payload: RegisterRequest): Promise<PublicUser> {
    return request('/api/auth/register', { method: 'POST', body: payload }, guardar);
  },

  forgotPassword(payload: ForgotPasswordRequest): Promise<void> {
    return request('/api/auth/forgot-password', { method: 'POST', body: payload }, () => undefined);
  },

  resetPassword(payload: ResetPasswordRequest): Promise<void> {
    return request('/api/auth/reset-password', { method: 'POST', body: payload }, () => undefined);
  },

  /** Esquece o access token ja, e pede ao BFF para revogar e apagar o cookie. */
  async logout(): Promise<void> {
    accessToken = null;
    try {
      await rawRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Sair deste navegador importa mais que revogar no servidor.
    }
  },
};

export { ApiRequestError, renovarSessao } from '@gestao/shared/api/client';
