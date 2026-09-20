import type { VercelRequest, VercelResponse } from '@vercel/node';

import { revokeSessionByRefreshToken } from '../../src/auth/session';
import { refreshRequestSchema } from '../../src/contracts';
import { parseBody, requireMethod, withErrorHandling } from '../../src/lib/http';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = parseBody(res, refreshRequestSchema, req.body);
  if (!body) return;

  // Idempotente: um token ja invalido nao e erro, o resultado desejado e o mesmo.
  await revokeSessionByRefreshToken(body.refreshToken);

  res.status(204).end();
});
