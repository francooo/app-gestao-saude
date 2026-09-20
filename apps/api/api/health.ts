import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from 'drizzle-orm';

import { db } from '../src/db/client';
import { json, requireMethod, withErrorHandling } from '../src/lib/http';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'GET')) return;

  const started = Date.now();
  await db.execute(sql`select 1`);

  json(res, 200, {
    ok: true,
    db: 'ok',
    dbLatencyMs: Date.now() - started,
    region: process.env.VERCEL_REGION ?? 'local',
  });
});
