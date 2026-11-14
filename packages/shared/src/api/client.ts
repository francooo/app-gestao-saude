import { API_ERROR, apiErrorSchema } from '../auth';
import { REQUEST_TIMEOUT_MS } from './config';

/**
 * Cliente HTTP da API, sem plataforma dentro.
 *
 * E o mesmo desenho de apps/mobile/src/api/client.ts — prazo, erro tipado,
 * uma unica renovacao em voo — com as duas coisas que mudam de plataforma
 * para plataforma vindas de fora, por `configurarCliente`:
 *
 * - onde fica o access token (SecureStore no aparelho, memoria no navegador);
 * - como a sessao e renovada (refresh token no corpo, no aparelho; cookie
 *   httpOnly, no navegador — la o JavaScript nem ve o refresh token).
 */

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

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Anexa o access token e tenta renovar a sessao em caso de 401. */
  authenticated?: boolean;
  /** Sobrescreve o prazo padrao (assistente, anexo, leitura de foto). */
  timeoutMs?: number;
  /** Cancelamento vindo de fora, somado ao do prazo. */
  signal?: AbortSignal;
};

export type ConfiguracaoDoCliente = {
  /** Prefixo das rotas. Vazio quando a API e servida na mesma origem. */
  baseUrl: string;
  /** Access token atual, ou null sem sessao. */
  getAccessToken: () => Promise<string | null> | string | null;
  /**
   * Renova a sessao e devolve o access token novo, ou null se ela morreu.
   *
   * Guardar o token novo e limpar o armazenamento na falha e trabalho de quem
   * implementa. O cliente so garante que isto roda uma vez por vez.
   */
  renovar: () => Promise<string | null>;
  /** Chamado quando a renovacao falha de vez. */
  aoExpirar?: () => void;
  /**
   * true quando o pacote saiu sem a URL da API. Falha de rede vira
   * API_NOT_CONFIGURED, para nao mandar a pessoa conferir a Wi-Fi.
   */
  malConfigurada?: boolean;
  /** Opcoes extras do fetch (o navegador usa `credentials: 'same-origin'`). */
  fetchInit?: RequestInit;
};

let config: ConfiguracaoDoCliente | null = null;

export function configurarCliente(nova: ConfiguracaoDoCliente): void {
  config = { ...nova, baseUrl: nova.baseUrl.replace(/\/+$/, '') };
}

function configuracao(): ConfiguracaoDoCliente {
  if (!config) throw new Error('configurarCliente() precisa rodar antes da primeira requisicao.');
  return config;
}

/** fetch com prazo e cancelamento. Nao trata status: devolve a Response crua. */
export async function rawRequest(
  path: string,
  options: RequestOptions,
  accessToken?: string | null,
): Promise<Response> {
  const cfg = configuracao();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);

  // `AbortSignal.any` nao existe no Hermes, entao o encadeamento e manual. O
  // `once: true` impede que um sinal reusado acumule ouvintes.
  const externo = options.signal;
  const abortar = () => controller.abort();
  if (externo) {
    if (externo.aborted) controller.abort();
    else externo.addEventListener('abort', abortar, { once: true });
  }

  try {
    return await fetch(`${cfg.baseUrl}${path}`, {
      ...cfg.fetchInit,
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
    externo?.removeEventListener('abort', abortar);
  }
}

export async function parseError(response: Response): Promise<ApiRequestError> {
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
 * Renovacao em voo unica: se tres requisicoes tomarem 401 ao mesmo tempo, so
 * uma renovacao acontece e as outras aguardam o mesmo resultado. Sem isso, as
 * chamadas concorrentes rotacionariam o token uma por cima da outra.
 */
let renovacaoEmVoo: Promise<string | null> | null = null;

export function renovarSessao(): Promise<string | null> {
  if (renovacaoEmVoo) return renovacaoEmVoo;

  const cfg = configuracao();
  renovacaoEmVoo = (async () => {
    try {
      const token = await cfg.renovar();
      if (!token) cfg.aoExpirar?.();
      return token;
    } catch {
      // Falha de rede na renovacao nao encerra a sessao: a proxima tenta de novo.
      return null;
    } finally {
      renovacaoEmVoo = null;
    }
  })();

  return renovacaoEmVoo;
}

export async function request<T>(
  path: string,
  options: RequestOptions,
  parse: (data: unknown) => T,
): Promise<T> {
  const cfg = configuracao();
  let accessToken = options.authenticated ? await cfg.getAccessToken() : null;

  let response: Response;
  try {
    response = await rawRequest(path, options, accessToken);
  } catch {
    if (cfg.malConfigurada) throw new ApiRequestError('API_NOT_CONFIGURED', 0);
    // Rede indisponivel, DNS, prazo estourado.
    throw new ApiRequestError('NETWORK_ERROR', 0);
  }

  // Uma unica tentativa de renovacao — se a repeticao tambem der 401, a sessao morreu.
  if (response.status === 401 && options.authenticated) {
    accessToken = await renovarSessao();
    if (accessToken) {
      try {
        response = await rawRequest(path, options, accessToken);
      } catch {
        throw new ApiRequestError('NETWORK_ERROR', 0);
      }
    }
  }

  if (!response.ok) throw await parseError(response);

  // 204 nao tem corpo, e json() de corpo vazio lanca SyntaxError.
  if (response.status === 204) return parse(undefined);

  return parse(await response.json());
}
