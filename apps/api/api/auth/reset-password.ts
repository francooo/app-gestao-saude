import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';

import { revokeAllSessions } from '../../src/auth/session';
import { API_ERROR, resetPasswordRequestSchema } from '../../src/contracts';
import { db } from '../../src/db/client';
import { passwordResetTokens, users } from '../../src/db/schema';
import { fail, json, parseBody, requireMethod, withErrorHandling } from '../../src/lib/http';
import { hashPassword } from '../../src/lib/password';
import { hashToken } from '../../src/lib/tokens';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = parseBody(res, resetPasswordRequestSchema, req.body);
  if (!body) return;

  const tokenHash = hashToken(body.token);

  const [record] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  // Uso unico e com prazo. Os tres casos dao a mesma resposta.
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    return fail(res, 401, API_ERROR.INVALID_RESET_TOKEN);
  }

  const passwordHash = await hashPassword(body.password);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, record.userId));

    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, record.id));
  });

  // Trocar a senha derruba todos os dispositivos: se a conta foi comprometida,
  // manter as sessoes antigas vivas anularia o proposito da redefinicao.
  await revokeAllSessions(record.userId);

  json(res, 200, { ok: true });
});
