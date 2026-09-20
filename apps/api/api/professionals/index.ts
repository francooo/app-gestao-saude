import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { professionalInputSchema } from '../../src/contracts';
import { db } from '../../src/db/client';
import { appointments, professionals, profiles } from '../../src/db/schema';
import { requireAuth } from '../../src/lib/auth';
import { fail, json, parseBody, withErrorHandling } from '../../src/lib/http';
import { geocodificar } from '../../src/lib/geocoding';
import { API_ERROR } from '../../src/contracts';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listar(req, res, auth.userId);
  if (req.method === 'POST') return criar(req, res, auth.userId);

  res.setHeader('Allow', 'GET, POST');
  return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
});

async function listar(req: VercelRequest, res: VercelResponse, userId: string) {
  const specialty = typeof req.query.specialty === 'string' ? req.query.specialty : null;
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : null;

  const filtros = [eq(professionals.userId, userId)];
  if (specialty) filtros.push(eq(professionals.specialty, specialty));

  /**
   * Filtro por perfil: como `professionals` pertence a conta e nao ao perfil,
   * a associacao e DERIVADA das consultas — os medicos que ja atenderam
   * aquela pessoa. Evita obrigar o usuario a marcar cada medico a mao.
   */
  if (profileId) {
    // O perfil precisa ser da propria conta, senao o profileId viraria uma
    // forma de descobrir dados alheios.
    const [perfil] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
      .limit(1);

    if (!perfil) return json(res, 200, { professionals: [] });

    const vinculos = await db
      .selectDistinct({ id: appointments.professionalId })
      .from(appointments)
      .where(eq(appointments.profileId, perfil.id));

    const ids = vinculos.map((v) => v.id).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return json(res, 200, { professionals: [] });

    filtros.push(inArray(professionals.id, ids));
  }

  const lista = await db
    .select()
    .from(professionals)
    .where(and(...filtros))
    .orderBy(asc(professionals.name));

  json(res, 200, { professionals: lista.map(serializar) });
}

async function criar(req: VercelRequest, res: VercelResponse, userId: string) {
  const body = parseBody(res, professionalInputSchema, req.body);
  if (!body) return;

  // Geocodifica antes de inserir. Nunca lanca: endereco irreconhecivel apenas
  // deixa o medico fora do mapa.
  const coords = body.address ? await geocodificar(body.address) : null;

  const [criado] = await db
    .insert(professionals)
    .values({
      userId,
      name: body.name,
      specialty: body.specialty ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      clinicName: body.clinicName ?? null,
      address: body.address ?? null,
      latitude: coords ? String(coords.latitude) : null,
      longitude: coords ? String(coords.longitude) : null,
      defaultModality: body.defaultModality ?? null,
      myRating: body.myRating ?? null,
      ratingNote: body.ratingNote ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  json(res, 201, { professional: serializar(criado!) });
}

/**
 * numeric do Postgres chega como string no driver. Converter aqui evita que
 * cada tela do app tenha que lembrar disso.
 */
export function serializar(p: typeof professionals.$inferSelect) {
  return {
    ...p,
    latitude: p.latitude === null ? null : Number(p.latitude),
    longitude: p.longitude === null ? null : Number(p.longitude),
  };
}
