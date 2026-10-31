/**
 * Cliente HTTP do painel.
 *
 * O token de acesso (15 min) fica so nesta variavel, em memoria: nada de
 * localStorage, onde qualquer script injetado leria. A sessao longa e o cookie
 * httpOnly que so /api/auth/* recebe. Ao recarregar a pagina, `renovarSessao`
 * troca o cookie por um token novo.
 */
let tokenDeAcesso: string | null = null;
let renovacaoEmCurso: Promise<SessaoDoPainel | null> | null = null;
let aoPerderSessao: (() => void) | null = null;

export interface AdminDoPainel {
  id: string;
  email: string;
  nome: string;
  papel: string;
}

export interface SessaoDoPainel {
  tokenDeAcesso: string;
  admin: AdminDoPainel;
}

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
  ) {
    super(codigo);
  }
}

export function definirAoPerderSessao(callback: (() => void) | null): void {
  aoPerderSessao = callback;
}

async function chamar(caminho: string, opcoes: RequestInit = {}): Promise<Response> {
  const headers = new Headers(opcoes.headers);
  if (opcoes.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (tokenDeAcesso) headers.set('Authorization', `Bearer ${tokenDeAcesso}`);
  return fetch(`/api/${caminho}`, { ...opcoes, headers, credentials: 'same-origin' });
}

async function erroDe(resposta: Response): Promise<ErroDaApi> {
  const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null;
  return new ErroDaApi(resposta.status, corpo?.erro ?? 'ERRO_INTERNO');
}

export async function entrar(email: string, senha: string, lembrar: boolean): Promise<SessaoDoPainel> {
  const resposta = await chamar('auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha, lembrar }),
  });
  if (!resposta.ok) throw await erroDe(resposta);
  const sessao = (await resposta.json()) as SessaoDoPainel;
  tokenDeAcesso = sessao.tokenDeAcesso;
  return sessao;
}

/**
 * Troca o cookie de sessao por um token novo. Uma renovacao por vez: varias
 * chamadas que recebem 401 juntas esperam a mesma promessa, em vez de cada uma
 * gastar o refresh token (que so vale uma vez).
 */
export function renovarSessao(): Promise<SessaoDoPainel | null> {
  renovacaoEmCurso ??= (async () => {
    try {
      const resposta = await fetch('/api/auth/renovar', { method: 'POST', credentials: 'same-origin' });
      if (!resposta.ok) {
        tokenDeAcesso = null;
        return null;
      }
      const sessao = (await resposta.json()) as SessaoDoPainel;
      tokenDeAcesso = sessao.tokenDeAcesso;
      return sessao;
    } finally {
      renovacaoEmCurso = null;
    }
  })();
  return renovacaoEmCurso;
}

export async function sair(): Promise<void> {
  tokenDeAcesso = null;
  await fetch('/api/auth/sair', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
}

/** Chamada autenticada. Renova o token uma vez se ele tiver vencido. */
export async function api<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  let resposta = await chamar(caminho, opcoes);
  if (resposta.status === 401 && (await renovarSessao())) {
    resposta = await chamar(caminho, opcoes);
  }
  if (resposta.status === 401) {
    tokenDeAcesso = null;
    aoPerderSessao?.();
  }
  if (!resposta.ok) throw await erroDe(resposta);
  return (await resposta.json()) as T;
}
