import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';

import { createSession } from '../../auth/session';
import { API_ERROR, loginRequestSchema } from '../../contracts';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { clientIp, fail, json, parseBody, requireMethod, userAgent, withErrorHandling } from '../../lib/http';
import { burnTimeAgainstDummyHash, verifyPassword } from '../../lib/password';
import { isRateLimited, recordLoginAttempt } from '../../lib/rateLimit';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = parseBody(res, loginRequestSchema, req.body);
  if (!body) return;

  const ip = clientIp(req);

  if (await isRateLimited(body.email, ip)) {
    return fail(res, 429, API_ERROR.TOO_MANY_ATTEMPTS);
  }

  const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);

  if (!user) {
    // Gasta o mesmo tempo de um hash real. Sem isso, a resposta para um e-mail
    // inexistente voltaria em milissegundos e revelaria quais contas existem.
    await burnTimeAgainstDummyHash(body.password);
    await recordLoginAttempt(body.email, ip, false);
    return fail(res, 401, API_ERROR.INVALID_CREDENTIALS);
  }

  const passwordOk = await verifyPassword(body.password, user.passwordHash);
  if (!passwordOk) {
    await recordLoginAttempt(body.email, ip, false);
    // Mesmo codigo e mesmo status do caso "usuario inexistente".
    return fail(res, 401, API_ERROR.INVALID_CREDENTIALS);
  }

  if (!user.isActive) {
    await recordLoginAttempt(body.email, ip, false);
    return fail(res, 403, API_ERROR.ACCOUNT_DISABLED);
  }

  const tokens = await createSession(user.id, { ip, userAgent: userAgent(req) });
  await recordLoginAttempt(body.email, ip, true);

  json(res, 200, {
    ...tokens,
    user: { id: user.id, email: user.email, fullName: user.fullName },
  });
});
