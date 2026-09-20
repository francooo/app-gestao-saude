import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, isNull } from 'drizzle-orm';

import { API_ERROR } from '../contracts';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import { fail } from './http';
import { verifyAccessToken } from './tokens';

export type AuthContext = {
  userId: string;
  sessionId: string;
};

/**
 * Exige um access token valido no cabecalho Authorization.
 *
 * Retorna null quando ja respondeu com 401 — o handler so precisa fazer
 * `const auth = await requireAuth(req, res); if (!auth) return;`
 *
 * Alem de conferir a assinatura do JWT, confirma que a SESSAO ainda existe e
 * nao foi revogada. Sem essa checagem, um access token continuaria valido por
 * ate 15 minutos depois de um logout ou de uma troca de senha — justamente os
 * momentos em que alguem quer cortar o acesso agora.
 */
export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
): Promise<AuthContext | null> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    fail(res, 401, API_ERROR.INVALID_CREDENTIALS);
    return null;
  }

  const claims = await verifyAccessToken(token);
  if (!claims) {
    fail(res, 401, API_ERROR.INVALID_CREDENTIALS);
    return null;
  }

  const [sessao] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, claims.sid), isNull(sessions.revokedAt)))
    .limit(1);

  if (!sessao) {
    fail(res, 401, API_ERROR.INVALID_CREDENTIALS);
    return null;
  }

  return { userId: claims.sub, sessionId: claims.sid };
}
