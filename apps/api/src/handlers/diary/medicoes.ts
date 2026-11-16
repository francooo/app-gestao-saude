import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';

import {
  API_ERROR,
  measurementIdQuerySchema,
  measurementInputSchema,
  measurementQuerySchema,
} from '../../contracts';
import { db } from '../../db/client';
import { healthMeasurements, profiles } from '../../db/schema';
import type { AuthContext } from '../../lib/auth';
import { fail, json, parseBody, parseQuery } from '../../lib/http';
import { medicaoDaConta, perfilDaConta } from '../../lib/ownership';
import { serializarMedicao } from '../../lib/serialize';

/**
 * O diario de medicoes: pressao, glicemia, peso e oxigenacao.
 *
 * Mesmo molde do diario de sintomas (handlers/diary/sintomas.ts): GET lista
 * uma janela de ate 31 dias, POST registra, DELETE apaga. Sem PATCH: corrigir
 * e apagar e registrar de novo.
 *
 * PESO E UM SO HISTORICO. Registrar um peso atualiza a ficha da pessoa
 * (profiles.weight_kg), que e de onde leem o aviso de "peso desatualizado" e
 * o contexto do assistente — mas so quando a medicao e a MAIS RECENTE: anotar
 * hoje o peso da semana passada nao pode apagar o de ontem. Apagar o peso que
 * a ficha mostra devolve a ficha ao anterior.
 */
const JANELA_MAXIMA_MS = 31 * 24 * 60 * 60 * 1000;

export default async function medicoes(
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
  const q = parseQuery(res, measurementQuerySchema, req.query);
  if (!q) return;

  const de = new Date(q.from);
  const ate = new Date(q.to);
  if (ate <= de || ate.getTime() - de.getTime() > JANELA_MAXIMA_MS) {
    return fail(res, 400, API_ERROR.VALIDATION_ERROR, { to: 'Período inválido' });
  }

  const filtros = [
    eq(profiles.userId, userId),
    eq(profiles.isActive, true),
    gte(healthMeasurements.measuredAt, de),
    lte(healthMeasurements.measuredAt, ate),
  ];

  if (q.profileId) {
    const perfil = await perfilDaConta(q.profileId, userId);
    if (!perfil) return json(res, 200, { measurements: [] });
    filtros.push(eq(healthMeasurements.profileId, perfil));
  }

  const linhas = await db
    .select({ registro: healthMeasurements, profileName: profiles.fullName })
    .from(healthMeasurements)
    .innerJoin(profiles, eq(profiles.id, healthMeasurements.profileId))
    .where(and(...filtros))
    .orderBy(desc(healthMeasurements.measuredAt));

  json(res, 200, {
    measurements: linhas.map((l) => ({
      ...serializarMedicao(l.registro),
      profileName: l.profileName,
    })),
  });
}

async function criar(req: VercelRequest, res: VercelResponse, userId: string) {
  const body = parseBody(res, measurementInputSchema, req.body);
  if (!body) return;

  const perfil = await perfilDaConta(body.profileId, userId);
  if (!perfil) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  const medidaEm = new Date(body.measuredAt);

  const criado = await db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(healthMeasurements)
      .values({
        profileId: perfil,
        kind: body.kind,
        systolic: body.systolic ?? null,
        diastolic: body.diastolic ?? null,
        pulse: body.pulse ?? null,
        glucose: body.glucose ?? null,
        glucoseContext: body.glucoseContext ?? null,
        weightKg: body.weightKg == null ? null : String(body.weightKg),
        spo2: body.spo2 ?? null,
        measuredAt: medidaEm,
        note: body.note ?? null,
        source: body.source ?? 'manual',
      })
      .returning();

    // O peso mais recente vira o peso da ficha. Um peso antigo anotado agora
    // entra no historico sem mexer na ficha.
    if (body.kind === 'peso' && body.weightKg != null) {
      await tx
        .update(profiles)
        .set({ weightKg: String(body.weightKg), weightMeasuredAt: medidaEm, updatedAt: new Date() })
        .where(
          and(
            eq(profiles.id, perfil),
            or(isNull(profiles.weightMeasuredAt), lte(profiles.weightMeasuredAt, medidaEm)),
          ),
        );
    }
    return linha!;
  });

  json(res, 201, { measurement: serializarMedicao(criado) });
}

async function apagar(req: VercelRequest, res: VercelResponse, userId: string) {
  const q = parseQuery(res, measurementIdQuerySchema, req.query);
  if (!q) return;

  const atual = await medicaoDaConta(q.id, userId);
  if (!atual) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  await db.transaction(async (tx) => {
    const [apagada] = await tx
      .delete(healthMeasurements)
      .where(eq(healthMeasurements.id, q.id))
      .returning({ measuredAt: healthMeasurements.measuredAt });

    if (atual.kind !== 'peso' || !apagada) return;

    // Se a ficha mostrava ESTE peso, ela volta ao peso anterior (ou fica
    // vazia, se nao sobrou nenhum). Outro peso na ficha fica como esta.
    const [ficha] = await tx
      .select({ em: profiles.weightMeasuredAt })
      .from(profiles)
      .where(eq(profiles.id, atual.profileId))
      .limit(1);
    if (!ficha?.em || ficha.em.getTime() !== apagada.measuredAt.getTime()) return;

    const [anterior] = await tx
      .select({ kg: healthMeasurements.weightKg, em: healthMeasurements.measuredAt })
      .from(healthMeasurements)
      .where(and(eq(healthMeasurements.profileId, atual.profileId), eq(healthMeasurements.kind, 'peso')))
      .orderBy(desc(healthMeasurements.measuredAt))
      .limit(1);

    await tx
      .update(profiles)
      .set({
        weightKg: anterior?.kg ?? null,
        weightMeasuredAt: anterior?.em ?? null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, atual.profileId));
  });

  res.status(204).end();
}
