import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from 'drizzle-orm';

import { db } from '../../db/client';
import { json, requireMethod, withErrorHandling } from '../../lib/http';

/**
 * Sonda de saude: responde se a funcao subiu e se o banco atende.
 *
 * MUDOU DE ENDERECO, de /api/health para /api/auth/health, e o motivo e o
 * limite de 12 funcoes serverless do plano Hobby. Esta era a UNICA das doze
 * sem consumidor instalado — a URL antiga aparecia num lugar so do
 * repositorio, a pagina de indice que nos mesmos mantemos. Nenhum bundle
 * publicado a chamava, entao mover custou zero para quem ja tem o aplicativo.
 *
 * Mora sob `auth/` e isso nao e gambiarra: aquele roteador e o UNICO sem
 * autenticacao por desenho, e a sonda precisa responder sem token. O nome da
 * pasta nao e sobre credencial, e sim sobre "o que responde sem ela" — a
 * mesma razao por que `confirmar-email` vive la.
 */
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
