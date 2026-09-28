import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, desc, eq, gte, lte } from 'drizzle-orm';

import {
  API_ERROR,
  symptomEntryInputSchema,
  symptomIdQuerySchema,
  symptomQuerySchema,
} from '../../contracts';
import { db } from '../../db/client';
import { profiles, symptomEntries } from '../../db/schema';
import type { AuthContext } from '../../lib/auth';
import { fail, json, parseBody, parseQuery } from '../../lib/http';
import { perfilDaConta, sintomaDaConta } from '../../lib/ownership';
import { serializarSintoma } from '../../lib/serialize';

/**
 * O diario de sintomas: listar, registrar e apagar.
 *
 * Nao ha PATCH de proposito — corrigir um registro e apaga-lo e anotar de
 * novo. Ver o comentario da tabela sobre a ausencia de `updatedAt`.
 */

/** Teto da janela, o mesmo numero da listagem de doses. */
const JANELA_MAXIMA_MS = 31 * 24 * 60 * 60 * 1000;

export default async function sintomas(
  req: VercelRequest,
  res: VercelResponse,
  auth: AuthContext,
): Promise<void> {
  if (req.method === 'GET') return listar(req, res, auth.userId);
  if (req.method === 'POST') return criar(req, res, auth.userId);
  if (req.method === 'DELETE') return apagar(req, res, auth.userId);

  res.setHeader('Allow', 'GET, POST, DELETE');
  fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
}

async function listar(req: VercelRequest, res: VercelResponse, userId: string) {
  const q = parseQuery(res, symptomQuerySchema, req.query);
  if (!q) return;

  const de = new Date(q.from);
  const ate = new Date(q.to);
  if (ate <= de || ate.getTime() - de.getTime() > JANELA_MAXIMA_MS) {
    return fail(res, 400, API_ERROR.VALIDATION_ERROR, { to: 'Período inválido' });
  }

  /**
   * O escopo e o JOIN, nunca uma coluna `userId` nesta tabela — o vinculo com
   * a conta so aparece depois de passar por profiles.
   *
   * O `isActive` entra pelo motivo ja escrito na listagem de consultas e de
   * remedios: sem ele, remover alguem da familia deixaria o diario dessa
   * pessoa continuar aparecendo, com nome e cor vindos deste mesmo join — e a
   * tela provaria que a remocao nao aconteceu.
   */
  const filtros = [
    eq(profiles.userId, userId),
    eq(profiles.isActive, true),
    gte(symptomEntries.occurredAt, de),
    lte(symptomEntries.occurredAt, ate),
  ];

  if (q.profileId) {
    const perfil = await perfilDaConta(q.profileId, userId);
    // Perfil de outra conta devolve LISTA VAZIA, e nao erro: um erro
    // distinguiria "id inexistente" de "id de outra pessoa".
    if (!perfil) return json(res, 200, { symptoms: [] });
    filtros.push(eq(symptomEntries.profileId, perfil));
  }

  const linhas = await db
    .select({
      registro: symptomEntries,
      profileName: profiles.fullName,
      profileColor: profiles.avatarColor,
    })
    .from(symptomEntries)
    .innerJoin(profiles, eq(profiles.id, symptomEntries.profileId))
    .where(and(...filtros))
    .orderBy(desc(symptomEntries.occurredAt));

  json(res, 200, {
    symptoms: linhas.map((l) => ({
      ...serializarSintoma(l.registro),
      profileName: l.profileName,
      profileColor: l.profileColor,
    })),
  });
}

async function criar(req: VercelRequest, res: VercelResponse, userId: string) {
  const body = parseBody(res, symptomEntryInputSchema, req.body);
  if (!body) return;

  // Sem isto, bastaria mandar o profileId de outra conta para escrever no
  // diario alheio. 404 e nunca 403: um 403 ja confirmaria que o perfil existe.
  const perfil = await perfilDaConta(body.profileId, userId);
  if (!perfil) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  const [criado] = await db
    .insert(symptomEntries)
    .values({
      profileId: perfil,
      kind: body.kind,
      intensity: body.intensity,
      // numeric exige string na escrita, como o peso em profiles.
      temperatureC: body.temperatureC == null ? null : String(body.temperatureC),
      occurredAt: new Date(body.occurredAt),
      note: body.note ?? null,
    })
    .returning();

  json(res, 201, { symptom: serializarSintoma(criado!) });
}

async function apagar(req: VercelRequest, res: VercelResponse, userId: string) {
  const q = parseQuery(res, symptomIdQuerySchema, req.query);
  if (!q) return;

  const atual = await sintomaDaConta(q.id, userId);
  if (!atual) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  await db.delete(symptomEntries).where(eq(symptomEntries.id, q.id));
  res.status(204).end();
}
