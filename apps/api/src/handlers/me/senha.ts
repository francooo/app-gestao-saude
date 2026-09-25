import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, isNull } from 'drizzle-orm';

import { API_ERROR, trocaDeSenhaSchema } from '../../contracts';
import { revokeAllSessionsExcept } from '../../auth/session';
import { db } from '../../db/client';
import { passwordResetTokens, users } from '../../db/schema';
import type { AuthContext } from '../../lib/auth';
import { clientIp, fail, json, parseBody } from '../../lib/http';
import { hashPassword, verifyPassword } from '../../lib/password';
import { isRateLimited, recordLoginAttempt } from '../../lib/rateLimit';

/**
 * Marcador proprio no balde de tentativas.
 *
 * Deliberadamente NAO usa o e-mail real: usar acoplaria este contador ao do
 * login e deixaria alguem trancar o login legitimo da vitima gastando
 * tentativas aqui. O balde por IP continua compartilhado com o login, o que e
 * desejavel.
 */
const MARCADOR = '@senha:';

/**
 * Trocar a senha estando logado.
 *
 * EXIGE A SENHA ATUAL. Um access token esquecido num celular destravado nao
 * pode virar troca de credencial — se pudesse, quem pegasse o aparelho tomaria
 * a conta sem saber nada sobre ela.
 */
export default async function senha(
  req: VercelRequest,
  res: VercelResponse,
  auth: AuthContext,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
  }

  const body = parseBody(res, trocaDeSenhaSchema, req.body);
  if (!body) return;

  const ip = clientIp(req);
  const balde = `${MARCADOR}${auth.userId}`;

  // Alguem com access token roubado poderia forcar a senha atual daqui.
  if (await isRateLimited(balde, ip)) {
    return fail(res, 429, API_ERROR.TOO_MANY_ATTEMPTS);
  }

  const [u] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  if (!u) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  if (!(await verifyPassword(body.currentPassword, u.passwordHash))) {
    await recordLoginAttempt(balde, ip, false);
    return fail(res, 403, API_ERROR.WRONG_PASSWORD);
  }

  /**
   * Recusa trocar por ela mesma.
   *
   * Custa um scrypt a mais (~150 ms), e paga: "senha alterada" sem alteracao
   * nenhuma e mentira na tela. Tres scrypt sequenciais cabem folgados nos 15 s
   * de maxDuration da rota.
   */
  if (await verifyPassword(body.newPassword, u.passwordHash)) {
    return fail(res, 400, API_ERROR.VALIDATION_ERROR, {
      newPassword: 'A nova senha precisa ser diferente da atual',
    });
  }

  const passwordHash = await hashPassword(body.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, auth.userId));

    /**
     * Mata os links de recuperacao pendentes.
     *
     * Um link vivo na caixa de entrada vale 30 minutos — e pode ser justamente
     * o phishing que a pessoa suspeitou e por isso esta trocando a senha.
     * Trocar a senha tem que apaga-lo. O reset-password so marca o token que
     * ele mesmo consumiu, entao isto nao acontecia em lugar nenhum.
     */
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, auth.userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );
  });

  // Esta sessao sobrevive; as outras caem. O porque esta no comentario da
  // funcao, em auth/session.ts.
  await revokeAllSessionsExcept(auth.userId, auth.sessionId);

  return json(res, 200, { ok: true });
}
