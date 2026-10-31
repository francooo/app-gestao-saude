import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de acesso do painel: JWT HS256 com segredo PROPRIO (ADMIN_JWT_SECRET),
 * diferente do JWT_SECRET do app. Um token do app mobile nunca passa aqui, e
 * vice-versa: segredo, emissor e audiencia sao outros.
 *
 * Vive 15 minutos e so na memoria do navegador; a sessao longa e o refresh
 * token em cookie httpOnly (server/sessao.ts).
 */
const EMISSOR = 'familia-saude-painel';
const AUDIENCIA = 'painel';
export const DURACAO_DO_ACESSO_S = 15 * 60;

interface Carga {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

function segredo(): string {
  const valor = process.env.ADMIN_JWT_SECRET;
  if (!valor || valor.length < 32) throw new Error('ADMIN_JWT_SECRET ausente ou curto');
  return valor;
}

const base64url = (dado: string | Buffer) => Buffer.from(dado).toString('base64url');

function assinar(conteudo: string): string {
  return createHmac('sha256', segredo()).update(conteudo).digest('base64url');
}

export function emitirTokenDeAcesso(adminId: string): string {
  const agora = Math.floor(Date.now() / 1000);
  const carga: Carga = { sub: adminId, iss: EMISSOR, aud: AUDIENCIA, iat: agora, exp: agora + DURACAO_DO_ACESSO_S };
  const conteudo = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify(carga))}`;
  return `${conteudo}.${assinar(conteudo)}`;
}

/** Devolve o id do admin, ou null se o token for invalido ou vencido. */
export function verificarTokenDeAcesso(token: string): string | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [cabecalho, corpo, assinatura] = partes as [string, string, string];

  const esperada = Buffer.from(assinar(`${cabecalho}.${corpo}`));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;

  try {
    const carga = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as Partial<Carga>;
    if (carga.iss !== EMISSOR || carga.aud !== AUDIENCIA) return null;
    if (typeof carga.exp !== 'number' || carga.exp <= Math.floor(Date.now() / 1000)) return null;
    return typeof carga.sub === 'string' ? carga.sub : null;
  } catch {
    return null;
  }
}
