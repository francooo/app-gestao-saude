import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq } from 'drizzle-orm';

import { API_ERROR, professionalPatchSchema } from '../../src/contracts';
import { db } from '../../src/db/client';
import { professionals } from '../../src/db/schema';
import { requireAuth } from '../../src/lib/auth';
import { fail, json, parseBody, withErrorHandling } from '../../src/lib/http';
import { geocodificar } from '../../src/lib/geocoding';
import { serializar } from './index';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  /**
   * O filtro por userId entra em TODA consulta, nao so na leitura.
   * Um id de outra conta precisa responder 404 — nunca 403 com dados, que ja
   * confirmaria a existencia do registro.
   */
  const dono = and(eq(professionals.id, id), eq(professionals.userId, auth.userId));

  const [atual] = await db.select().from(professionals).where(dono).limit(1);
  if (!atual) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  if (req.method === 'GET') {
    return json(res, 200, { professional: serializar(atual) });
  }

  if (req.method === 'DELETE') {
    await db.delete(professionals).where(dono);
    res.status(204).end();
    return;
  }

  if (req.method === 'PATCH') {
    const body = parseBody(res, professionalPatchSchema, req.body);
    if (!body) return;

    const mudancas: Partial<typeof professionals.$inferInsert> = { updatedAt: new Date() };

    if (body.name !== undefined) mudancas.name = body.name;
    if (body.specialty !== undefined) mudancas.specialty = body.specialty;
    if (body.phone !== undefined) mudancas.phone = body.phone;
    if (body.email !== undefined) mudancas.email = body.email;
    if (body.clinicName !== undefined) mudancas.clinicName = body.clinicName;
    if (body.defaultModality !== undefined) mudancas.defaultModality = body.defaultModality;
    if (body.myRating !== undefined) mudancas.myRating = body.myRating;
    if (body.ratingNote !== undefined) mudancas.ratingNote = body.ratingNote;
    if (body.notes !== undefined) mudancas.notes = body.notes;

    // So re-geocodifica se o endereco mudou de fato: cada chamada consome
    // cota do MapTiler, e salvar a nota nao deveria gastar uma.
    if (body.address !== undefined && body.address !== atual.address) {
      mudancas.address = body.address;
      const coords = body.address ? await geocodificar(body.address) : null;
      mudancas.latitude = coords ? String(coords.latitude) : null;
      mudancas.longitude = coords ? String(coords.longitude) : null;
    }

    const [atualizado] = await db
      .update(professionals)
      .set(mudancas)
      .where(dono)
      .returning();

    return json(res, 200, { professional: serializar(atualizado!) });
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
});
