import {
  API_ERROR,
  apiErrorSchema,
  loginResponseSchema,
  refreshResponseSchema,
  registerResponseSchema,
  type ForgotPasswordRequest,
  type LoginRequest,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
} from '@gestao/shared';

import { API_URL, API_URL_MAL_CONFIGURADA, REQUEST_TIMEOUT_MS } from '@/config';
import { tokenStorage } from '@/auth/tokenStorage';

/** Erro tipado que as telas capturam para decidir a mensagem exibida. */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(code: string, status: number, fields?: Record<string, string>) {
    super(code);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Anexa o access token e tenta refresh em caso de 401. */
  authenticated?: boolean;
};

async function rawRequest(path: string, options: RequestOptions, accessToken?: string | null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseError(response: Response): Promise<ApiRequestError> {
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    if (parsed.success) {
      return new ApiRequestError(parsed.data.error, response.status, parsed.data.fields);
    }
  } catch {
    // Corpo vazio ou nao-JSON (ex.: pagina de erro da Vercel).
  }
  return new ApiRequestError(API_ERROR.INTERNAL_ERROR, response.status);
}

/**
 * Renovacao em voo unica: se tres requisicoes tomarem 401 ao mesmo tempo,
 * so uma chamada de refresh acontece e as outras aguardam o mesmo resultado.
 * Sem isso, as chamadas concorrentes rotacionariam o token uma por cima da
 * outra e todas menos a primeira falhariam.
 */
let refreshInFlight: Promise<string | null> | null = null;

/** Chamado quando o refresh falha de vez — o AuthContext registra aqui o logout. */
let onSessionExpired: (() => void) | null = null;

export function setOnSessionExpired(handler: (() => void) | null) {
  onSessionExpired = handler;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) return null;

      const response = await rawRequest('/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
      });

      if (!response.ok) {
        await tokenStorage.clear();
        onSessionExpired?.();
        return null;
      }

      const parsed = refreshResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        await tokenStorage.clear();
        onSessionExpired?.();
        return null;
      }

      await tokenStorage.saveTokens(parsed.data.accessToken, parsed.data.refreshToken);
      return parsed.data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function request<T>(
  path: string,
  options: RequestOptions,
  parse: (data: unknown) => T,
): Promise<T> {
  let accessToken = options.authenticated ? await tokenStorage.getAccessToken() : null;

  let response: Response;
  try {
    response = await rawRequest(path, options, accessToken);
  } catch {
    // Distingue os dois casos que produzem a mesma excecao do fetch: um bundle
    // mal configurado apontando para localhost falha exatamente como falta de
    // internet, e mandar a pessoa conferir a Wi-Fi nao resolve nada.
    if (API_URL_MAL_CONFIGURADA) throw new ApiRequestError('API_NOT_CONFIGURED', 0);
    // Rede indisponivel, DNS, timeout do AbortController.
    throw new ApiRequestError('NETWORK_ERROR', 0);
  }

  // Uma unica tentativa de refresh — se o retry tambem der 401, a sessao morreu.
  if (response.status === 401 && options.authenticated) {
    accessToken = await refreshAccessToken();
    if (accessToken) {
      try {
        response = await rawRequest(path, options, accessToken);
      } catch {
        throw new ApiRequestError('NETWORK_ERROR', 0);
      }
    }
  }

  if (!response.ok) throw await parseError(response);

  return parse(await response.json());
}

export const authApi = {
  login(payload: LoginRequest): Promise<LoginResponse> {
    return request('/api/auth/login', { method: 'POST', body: payload }, (data) =>
      loginResponseSchema.parse(data),
    );
  },

  register(payload: RegisterRequest): Promise<RegisterResponse> {
    return request('/api/auth/register', { method: 'POST', body: payload }, (data) =>
      registerResponseSchema.parse(data),
    );
  },

  forgotPassword(payload: ForgotPasswordRequest): Promise<void> {
    return request('/api/auth/forgot-password', { method: 'POST', body: payload }, () => undefined);
  },

  async logout(refreshToken: string): Promise<void> {
    try {
      await rawRequest('/api/auth/logout', { method: 'POST', body: { refreshToken } });
    } catch {
      // Sair localmente e mais importante que revogar no servidor; o refresh
      // token expira sozinho em 60 dias de qualquer forma.
    }
  },
};
