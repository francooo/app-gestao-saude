/** Codigos de erro que o site do painel entende. */
export const ERRO = {
  NAO_ENCONTRADO: 'NAO_ENCONTRADO',
  METODO_NAO_PERMITIDO: 'METODO_NAO_PERMITIDO',
  DADOS_INVALIDOS: 'DADOS_INVALIDOS',
  CREDENCIAIS_INVALIDAS: 'CREDENCIAIS_INVALIDAS',
  MUITAS_TENTATIVAS: 'MUITAS_TENTATIVAS',
  NAO_AUTENTICADO: 'NAO_AUTENTICADO',
  SESSAO_EXPIRADA: 'SESSAO_EXPIRADA',
  ERRO_INTERNO: 'ERRO_INTERNO',
} as const;
export type CodigoDeErro = (typeof ERRO)[keyof typeof ERRO];

export function json(status: number, corpo: unknown, cabecalhos?: HeadersInit): Response {
  const headers = new Headers(cabecalhos);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  // Dado de familia nunca fica em cache de navegador ou proxy.
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(corpo), { status, headers });
}

export function falha(status: number, codigo: CodigoDeErro, cabecalhos?: HeadersInit): Response {
  return json(status, { erro: codigo }, cabecalhos);
}

export async function lerJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function lerCookie(request: Request, nome: string): string | null {
  const cabecalho = request.headers.get('cookie');
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return decodeURIComponent(resto.join('='));
  }
  return null;
}

/** IP do cliente para o registro de acesso; null se nao parecer um IP. */
export function ipDe(request: Request): string | null {
  const encaminhado = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = encaminhado || request.headers.get('x-real-ip');
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null;
}
