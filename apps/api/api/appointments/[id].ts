import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq } from 'drizzle-orm';

import { API_ERROR, appointmentPatchSchema } from '../../src/contracts';
import { db } from '../../src/db/client';
import { appointments, professionals } from '../../src/db/schema';
import { requireAuth } from '../../src/lib/auth';
import { fail, json, parseBody, withErrorHandling } from '../../src/lib/http';
import { consultaDaConta } from '../../src/lib/ownership';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  // Passa pelo join com profiles: consulta de outra conta responde 404.
  const atual = await consultaDaConta(id, auth.userId);
  if (!atual) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  if (req.method === 'GET') {
    return json(res, 200, { appointment: atual });
  }

  if (req.method === 'DELETE') {
    await db.delete(appointments).where(eq(appointments.id, id));
    res.status(204).end();
    return;
  }

  if (req.method === 'PATCH') {
    const body = parseBody(res, appointmentPatchSchema, req.body);
    if (!body) return;

    if (body.professionalId) {
      const [prof] = await db
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(eq(professionals.id, body.professionalId), eq(professionals.userId, auth.userId)),
        )
        .limit(1);

      if (!prof) return fail(res, 404, API_ERROR.INTERNAL_ERROR);
    }

    const mudancas: Partial<typeof appointments.$inferInsert> = { updatedAt: new Date() };

    if (body.professionalId !== undefined) mudancas.professionalId = body.professionalId;
    if (body.title !== undefined) mudancas.title = body.title;
    if (body.scheduledAt !== undefined) mudancas.scheduledAt = new Date(body.scheduledAt);
    if (body.durationMinutes !== undefined) mudancas.durationMinutes = body.durationMinutes;
    if (body.modality !== undefined) mudancas.modality = body.modality;
    if (body.location !== undefined) mudancas.location = body.location;
    if (body.address !== undefined) mudancas.address = body.address;
    if (body.status !== undefined) mudancas.status = body.status;
    if (body.notes !== undefined) mudancas.notes = body.notes;
    if (body.reminderMinutesBefore !== undefined) {
      mudancas.reminderMinutesBefore = body.reminderMinutesBefore;
    }

    const [atualizada] = await db
      .update(appointments)
      .set(mudancas)
      .where(eq(appointments.id, id))
      .returning();

    return json(res, 200, { appointment: atualizada });
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
});
