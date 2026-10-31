import { createHash, randomBytes } from 'node:crypto';

import { consultar } from './db';

/**
 * Sessao longa do painel: refresh token aleatorio em cookie httpOnly, e no
 * banco so o SHA-256 dele (painel.admin_sessions).
 *
 * A cada renovacao o token e trocado num UPDATE atomico: o antigo deixa de
 * valer no mesmo instante, entao um cookie copiado so serve uma vez.
 */
export const COOKIE_DE_SESSAO = 'painel_sessao';

// Sem "lembrar de mim" a sessao dura um expediente; com ele, uma semana.
const DURACAO_CURTA_S = 12 * 60 * 60;
const DURACAO_LONGA_S = 7 * 24 * 60 * 60;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export interface SessaoCriada {
  token: string;
  expiraEm: Date;
  persistente: boolean;
}

export async function criarSessao(entrada: {
  adminId: string;
  lembrar: boolean;
  ip: string | null;
  userAgent: string | null;
}): Promise<SessaoCriada> {
  const token = randomBytes(32).toString('base64url');
  const duracao = entrada.lembrar ? DURACAO_LONGA_S : DURACAO_CURTA_S;
  const [linha] = await consultar<{ expires_at: string }>(
    `insert into painel.admin_sessions (admin_id, token_hash, ip, user_agent, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(secs => $5))
     returning expires_at`,
    [entrada.adminId, hash(token), entrada.ip, entrada.userAgent?.slice(0, 300) ?? null, duracao],
  );
  return { token, expiraEm: new Date(linha!.expires_at), persistente: entrada.lembrar };
}

/** Troca o token da sessao. Devolve null se o token for invalido, vencido ou revogado. */
export async function renovarSessao(
  token: string,
): Promise<{ adminId: string; sessao: SessaoCriada } | null> {
  const novo = randomBytes(32).toString('base64url');
  const [linha] = await consultar<{ admin_id: string; expires_at: string; persistente: boolean }>(
    `update painel.admin_sessions s
        set token_hash = $2, last_used_at = now()
       from painel.admin_users a
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
        and a.id = s.admin_id
        and a.is_active
     returning s.admin_id, s.expires_at,
               (s.expires_at - s.created_at) > interval '1 day' as persistente`,
    [hash(token), hash(novo)],
  );
  if (!linha) return null;
  return {
    adminId: linha.admin_id,
    sessao: { token: novo, expiraEm: new Date(linha.expires_at), persistente: linha.persistente },
  };
}

/** Revoga a sessao do token; devolve o admin dono, se havia sessao ativa. */
export async function encerrarSessao(token: string): Promise<string | null> {
  const [linha] = await consultar<{ admin_id: string }>(
    `update painel.admin_sessions set revoked_at = now()
      where token_hash = $1 and revoked_at is null
     returning admin_id`,
    [hash(token)],
  );
  return linha?.admin_id ?? null;
}

export interface SessaoAtiva {
  id: string;
  ip: string | null;
  navegador: string | null;
  criada: string;
  ultimo_uso: string;
  expira: string;
  atual: boolean;
}

/** Sessoes validas do admin; `atual` marca a do cookie desta requisicao. */
export async function listarSessoes(adminId: string, tokenAtual: string | null): Promise<SessaoAtiva[]> {
  return consultar<SessaoAtiva>(
    `select id, host(ip) as ip, user_agent as navegador, created_at as criada,
            last_used_at as ultimo_uso, expires_at as expira,
            token_hash = $2 as atual
       from painel.admin_sessions
      where admin_id = $1 and revoked_at is null and expires_at > now()
      order by (token_hash = $2) desc, last_used_at desc`,
    [adminId, tokenAtual ? hash(tokenAtual) : ''],
  );
}

/** Revoga todas as sessoes do admin menos a do cookie atual. Devolve quantas. */
export async function encerrarOutrasSessoes(adminId: string, tokenAtual: string | null): Promise<number> {
  const linhas = await consultar<{ id: string }>(
    `update painel.admin_sessions set revoked_at = now()
      where admin_id = $1 and revoked_at is null and token_hash <> $2
     returning id`,
    [adminId, tokenAtual ? hash(tokenAtual) : ''],
  );
  return linhas.length;
}

/**
 * Cookie restrito as rotas de sessao: o navegador nem envia o refresh token
 * nas chamadas de dados. Strict impede envio a partir de outro site.
 * Sem "lembrar de mim", vira cookie de sessao do navegador (sem Max-Age).
 */
export function cookieDaSessao(sessao: SessaoCriada): string {
  const partes = [
    `${COOKIE_DE_SESSAO}=${sessao.token}`,
    'Path=/api/auth',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ];
  if (sessao.persistente) {
    partes.push(`Max-Age=${Math.max(0, Math.floor((sessao.expiraEm.getTime() - Date.now()) / 1000))}`);
  }
  return partes.join('; ');
}

export function cookieApagado(): string {
  return `${COOKIE_DE_SESSAO}=; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
