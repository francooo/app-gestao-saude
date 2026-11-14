/**
 * BFF da versao web: fica entre o navegador e a API do aplicativo (apps/api).
 *
 * Existe por dois motivos.
 *
 * 1. A API nao tem CORS e esta no limite de funcoes do plano da Vercel. Aqui o
 *    navegador fala com a propria origem, e este servidor fala com a API.
 *
 * 2. A API entrega o refresh token (60 dias) no corpo da resposta, desenhado
 *    para o armazenamento seguro do celular. No navegador isso iria parar no
 *    localStorage, ao alcance de qualquer script. Este arquivo tira o refresh
 *    token da resposta e o guarda num cookie httpOnly restrito a /api/auth: o
 *    JavaScript da pagina nunca o ve.
 *
 * Todo o resto e repasse transparente, com o `Authorization: Bearer` que o
 * navegador mandou. Nenhuma regra de negocio mora aqui.
 *
 * Autocontido de proposito: nao importa packages/shared, como a API.
 */

const COOKIE = 'gs_sessao';
/** A mesma validade do refresh token na API (apps/api/src/auth/session.ts). */
const DURACAO_S = 60 * 24 * 60 * 60;

/** Abaixo do maxDuration da funcao (60 s), para o erro sair daqui e nao da plataforma. */
const PRAZO_MS = 58_000;

function cookieDaSessao(token: string): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACAO_S}`;
}

function cookieApagado(): string {
  return `${COOKIE}=; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function lerCookie(request: Request): string | null {
  const cabecalho = request.headers.get('cookie');
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === COOKIE) {
      try {
        return decodeURIComponent(resto.join('=')) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function json(status: number, corpo: unknown, cabecalhos?: HeadersInit): Response {
  const headers = new Headers(cabecalhos);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  // Dado de saude nunca fica em cache de navegador ou proxy.
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(corpo), { status, headers });
}

/** Erro no formato da API ({ error: CODIGO }), que o cliente ja sabe traduzir. */
function falha(status: number, codigo: string, cabecalhos?: HeadersInit): Response {
  return json(status, { error: codigo }, cabecalhos);
}

/**
 * Caminho pedido, sem o prefixo /api/, e a query sem o parametro do rewrite.
 *
 * Em producao o caminho chega em ?caminho= (rewrite do vercel.json); no dev do
 * Vite, direto na URL.
 */
function destinoDe(request: Request): { caminho: string; query: string } {
  const url = new URL(request.url);
  const doRewrite = url.searchParams.get('caminho');
  url.searchParams.delete('caminho');
  const bruto = doRewrite ?? url.pathname.replace(/^\/api\//, '');
  const caminho = bruto.replace(/^\/+|\/+$/g, '');
  const query = url.searchParams.toString();
  return { caminho, query: query ? `?${query}` : '' };
}

/** So letras, numeros, hifen e barra: nada de `..`, `//` ou esquema de URL. */
const CAMINHO_VALIDO = /^[a-zA-Z0-9-]+(\/[a-zA-Z0-9-]+)*$/;

function urlDaApi(): string | null {
  const base = process.env.API_URL?.replace(/\/+$/, '');
  return base ? base : null;
}

/**
 * Cabecalhos repassados a API.
 *
 * O IP de quem chamou vai em x-forwarded-for porque o limite de tentativas de
 * login da API e por IP. Se a plataforma reescrever o cabecalho com o IP desta
 * funcao, todos os usuarios da web dividem a mesma cota — ver "IP atras do
 * BFF" no README deste app.
 */
function cabecalhosParaApi(request: Request, comCorpo: boolean): Headers {
  const headers = new Headers();
  if (comCorpo) headers.set('Content-Type', 'application/json');
  const autorizacao = request.headers.get('authorization');
  if (autorizacao) headers.set('Authorization', autorizacao);
  const agente = request.headers.get('user-agent');
  if (agente) headers.set('User-Agent', agente);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (ip) headers.set('X-Forwarded-For', ip);
  return headers;
}

async function chamarApi(
  request: Request,
  caminho: string,
  query: string,
  corpo: BodyInit | undefined,
): Promise<Response> {
  const base = urlDaApi();
  if (!base) return falha(500, 'INTERNAL_ERROR');
  return fetch(`${base}/api/${caminho}${query}`, {
    method: request.method,
    headers: cabecalhosParaApi(request, corpo !== undefined),
    body: corpo,
    signal: AbortSignal.timeout(PRAZO_MS),
    redirect: 'manual',
  });
}

/** Devolve a resposta da API ao navegador, sem os cabecalhos dela (cookies, CORS, servidor). */
async function devolver(resposta: Response, cabecalhos?: HeadersInit): Promise<Response> {
  const headers = new Headers(cabecalhos);
  const tipo = resposta.headers.get('content-type');
  if (tipo) headers.set('Content-Type', tipo);
  headers.set('Cache-Control', 'no-store');
  const semCorpo = resposta.status === 204 || resposta.status === 304;
  return new Response(semCorpo ? null : await resposta.arrayBuffer(), {
    status: resposta.status,
    headers,
  });
}

async function lerJson(resposta: Response): Promise<Record<string, unknown> | null> {
  try {
    const dado: unknown = await resposta.json();
    return dado && typeof dado === 'object' ? (dado as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Recusa chamada vinda de outro site nas rotas que usam o cookie.
 *
 * O SameSite=Strict ja impede o envio do cookie; isto e a segunda tranca, para
 * o caso de um navegador que nao o respeite.
 */
function origemEstranha(request: Request): boolean {
  const origem = request.headers.get('origin');
  if (!origem) return false;
  try {
    return new URL(origem).host !== (request.headers.get('host') ?? new URL(request.url).host);
  } catch {
    return true;
  }
}

/** Login e cadastro: a sessao nasce aqui, e o refresh token vira cookie. */
async function abrirSessao(request: Request, caminho: string, query: string): Promise<Response> {
  const resposta = await chamarApi(request, caminho, query, await request.text());
  if (!resposta.ok) return devolver(resposta);

  const dado = await lerJson(resposta);
  const refreshToken = dado?.refreshToken;
  if (!dado || typeof refreshToken !== 'string') return falha(502, 'INTERNAL_ERROR');

  const { refreshToken: _fora, ...resto } = dado;
  return json(resposta.status, resto, { 'Set-Cookie': cookieDaSessao(refreshToken) });
}

/** Troca o cookie por um access token novo. A API rotaciona o refresh a cada uso. */
async function renovar(request: Request, query: string): Promise<Response> {
  const refreshToken = lerCookie(request);
  if (!refreshToken) return falha(401, 'INVALID_REFRESH_TOKEN');

  const resposta = await chamarApi(request, 'auth/refresh', query, JSON.stringify({ refreshToken }));
  if (!resposta.ok) {
    // Falha da API (5xx) nao e sessao morta: o cookie fica, e a proxima tenta.
    const morta = resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429;
    return devolver(resposta, morta ? { 'Set-Cookie': cookieApagado() } : undefined);
  }

  const dado = await lerJson(resposta);
  const novo = dado?.refreshToken;
  if (!dado || typeof novo !== 'string') return falha(502, 'INTERNAL_ERROR');

  const { refreshToken: _fora, ...resto } = dado;
  return json(200, resto, { 'Set-Cookie': cookieDaSessao(novo) });
}

/** Sai: revoga na API se der, e apaga o cookie de qualquer jeito. */
async function sair(request: Request, query: string): Promise<Response> {
  const refreshToken = lerCookie(request);
  if (refreshToken) {
    try {
      await chamarApi(request, 'auth/logout', query, JSON.stringify({ refreshToken }));
    } catch {
      // Sair deste navegador importa mais que revogar no servidor.
    }
  }
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookieApagado() } });
}

export async function rotear(request: Request): Promise<Response> {
  const { caminho, query } = destinoDe(request);
  if (!CAMINHO_VALIDO.test(caminho)) return falha(404, 'INTERNAL_ERROR');

  /**
   * A politica de privacidade completa e uma pagina publica do projeto da API.
   * O navegador nao conhece o endereco da API (API_URL e so do servidor), entao
   * o link do site aponta para ca e este redirecionamento o leva ate la.
   */
  if (request.method === 'GET' && caminho === 'privacidade') {
    const base = urlDaApi();
    if (!base) return falha(500, 'INTERNAL_ERROR');
    return new Response(null, { status: 302, headers: { Location: `${base}/privacidade` } });
  }

  try {
    if (request.method === 'POST') {
      if (caminho === 'auth/login' || caminho === 'auth/register') {
        return await abrirSessao(request, caminho, query);
      }
      if (caminho === 'auth/refresh' || caminho === 'auth/logout') {
        if (origemEstranha(request)) return falha(403, 'INVALID_REFRESH_TOKEN');
        return caminho === 'auth/refresh' ? await renovar(request, query) : await sair(request, query);
      }
    }

    const temCorpo = request.method !== 'GET' && request.method !== 'HEAD';
    const corpo = temCorpo ? await request.text() : undefined;
    return await devolver(await chamarApi(request, caminho, query, corpo || undefined));
  } catch {
    // API fora do ar ou prazo estourado. O detalhe nao vai para o navegador.
    return falha(504, 'INTERNAL_ERROR');
  }
}
