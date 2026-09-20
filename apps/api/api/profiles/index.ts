import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, asc, desc, eq } from 'drizzle-orm';

import { API_ERROR } from '../../src/contracts';
import { db } from '../../src/db/client';
import { profiles } from '../../src/db/schema';
import { requireAuth } from '../../src/lib/auth';
import { fail, json, withErrorHandling } from '../../src/lib/http';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
  }

  const lista = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.userId, auth.userId), eq(profiles.isActive, true)))
    // O titular primeiro, depois os demais em ordem alfabetica: e a ordem em
    // que a tela inicial e o seletor de medicos esperam encontrar as pessoas.
    .orderBy(desc(profiles.isAccountHolder), asc(profiles.fullName));

  json(res, 200, { profiles: lista });
});
