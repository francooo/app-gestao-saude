import type { VercelRequest, VercelResponse } from '@vercel/node';

import { rotateRefreshToken } from '../../src/auth/session';
import { API_ERROR, refreshRequestSchema } from '../../src/contracts';
import {
  clientIp,
  fail,
  json,
  parseBody,
  requireMethod,
  userAgent,
  withErrorHandling,
} from '../../src/lib/http';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = parseBody(res, refreshRequestSchema, req.body);
  if (!body) return;

  const result = await rotateRefreshToken(body.refreshToken, {
    ip: clientIp(req),
    userAgent: userAgent(req),
  });

  if (!result.ok) {
    // Todos os motivos viram a mesma resposta: o cliente so precisa saber que
    // deve mandar o usuario para o login. O motivo fica nos nossos registros.
    return fail(res, 401, API_ERROR.INVALID_REFRESH_TOKEN);
  }

  json(res, 200, result.tokens);
});
