import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, asc, eq, gte } from 'drizzle-orm';

import { API_ERROR, appointmentInputSchema } from '../../src/contracts';
import { db } from '../../src/db/client';
import { appointments, professionals, profiles } from '../../src/db/schema';
import { requireAuth } from '../../src/lib/auth';
import { fail, json, parseBody, withErrorHandling } from '../../src/lib/http';
import { perfilDaConta } from '../../src/lib/ownership';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listar(req, res, auth.userId);
  if (req.method === 'POST') return criar(req, res, auth.userId);

  res.setHeader('Allow', 'GET, POST');
  return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
});

async function listar(req: VercelRequest, res: VercelResponse, userId: string) {
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : null;
  const somenteFuturas = req.query.upcoming === 'true';

  // O join com profiles e o que garante que so venham consultas da conta.
  const filtros = [eq(profiles.userId, userId)];

  if (profileId) {
    const perfil = await perfilDaConta(profileId, userId);
    // Perfil de outra conta responde lista vazia, nao erro: um erro
    // distinguiria "id inexistente" de "id de outra pessoa".
    if (!perfil) return json(res, 200, { appointments: [] });
    filtros.push(eq(appointments.profileId, perfil));
  }

  if (somenteFuturas) filtros.push(gte(appointments.scheduledAt, new Date()));

  const lista = await db
    .select({
      appointment: appointments,
      profileName: profiles.fullName,
      professionalName: professionals.name,
      professionalSpecialty: professionals.specialty,
    })
    .from(appointments)
    .innerJoin(profiles, eq(profiles.id, appointments.profileId))
    .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(and(...filtros))
    .orderBy(asc(appointments.scheduledAt));

  json(res, 200, {
    appointments: lista.map((l) => ({
      ...l.appointment,
      profileName: l.profileName,
      professionalName: l.professionalName,
      professionalSpecialty: l.professionalSpecialty,
    })),
  });
}

async function criar(req: VercelRequest, res: VercelResponse, userId: string) {
  const body = parseBody(res, appointmentInputSchema, req.body);
  if (!body) return;

  // Sem esta checagem, bastaria mandar o profileId de outra conta para criar
  // uma consulta na agenda alheia.
  const perfil = await perfilDaConta(body.profileId, userId);
  if (!perfil) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  // O mesmo vale para o profissional: precisa ser da conta.
  if (body.professionalId) {
    const [prof] = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(and(eq(professionals.id, body.professionalId), eq(professionals.userId, userId)))
      .limit(1);

    if (!prof) return fail(res, 404, API_ERROR.INTERNAL_ERROR);
  }

  const [criada] = await db
    .insert(appointments)
    .values({
      profileId: perfil,
      professionalId: body.professionalId ?? null,
      title: body.title ?? null,
      scheduledAt: new Date(body.scheduledAt),
      durationMinutes: body.durationMinutes ?? null,
      modality: body.modality,
      location: body.location ?? null,
      address: body.address ?? null,
      reminderMinutesBefore: body.reminderMinutesBefore ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  json(res, 201, { appointment: criada });
}
