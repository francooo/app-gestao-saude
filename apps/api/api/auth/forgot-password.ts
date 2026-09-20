import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';

import { forgotPasswordRequestSchema } from '../../src/contracts';
import { db } from '../../src/db/client';
import { passwordResetTokens, users } from '../../src/db/schema';
import { clientIp, json, parseBody, requireMethod, withErrorHandling } from '../../src/lib/http';
import { sendPasswordResetEmail } from '../../src/lib/email';
import { generateRefreshToken, hashToken } from '../../src/lib/tokens';

/** 30 minutos. Curto o bastante para um link que vai por e-mail. */
const RESET_TTL_MS = 30 * 60 * 1000;

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = parseBody(res, forgotPasswordRequestSchema, req.body);
  if (!body) return;

  const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);

  if (user?.isActive) {
    const token = generateRefreshToken();
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
      requestedIp: clientIp(req),
    });

    try {
      await sendPasswordResetEmail(user.email, token);
    } catch (error) {
      // Deixar a falha subir viraria um 500 — e como o caminho de conta
      // inexistente sempre responde 200, esse 500 revelaria que a conta
      // existe. Registra e segue.
      console.error('[auth] falha ao enviar e-mail de recuperacao', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Sempre 200, exista a conta ou nao. Responder 404 para e-mail desconhecido
  // transformaria este endpoint num verificador de quem e cliente da clinica.
  json(res, 200, { ok: true });
});
