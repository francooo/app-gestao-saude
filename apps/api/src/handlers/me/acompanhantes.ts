import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, asc, eq } from 'drizzle-orm';

import { acompanhantePatchSchema, acompanhanteSchema, API_ERROR } from '../../contracts';
import { db } from '../../db/client';
import { caregivers, profiles, users } from '../../db/schema';
import type { AuthContext } from '../../lib/auth';
import { enviarRegistrado } from '../../lib/avisos-whatsapp';
import { fusoValido } from '../../lib/grade-de-doses';
import { fail, json, parseBody } from '../../lib/http';
import { NOMES_DOS_AVISOS, textoDoConvite } from '../../lib/mensagens-whatsapp';
import { perfilDaConta } from '../../lib/ownership';
import { normalizarTelefone, whatsappConfigurado } from '../../lib/whatsapp';

/**
 * Acompanhantes: quem recebe os avisos de uma pessoa da familia pelo WhatsApp.
 *
 *   GET    ?profileId=   lista (de uma pessoa, ou da conta toda)
 *   POST                 cadastra E manda o convite
 *   PATCH  ?id=          permissoes, ativo, nome, telefone
 *   DELETE ?id=          remove
 *
 * Mora em /api/me por falta de vaga (12/12 funcoes). Acompanhante de outra
 * conta responde 404, nunca 403 — o padrao do projeto.
 */
export default async function acompanhantes(
  req: VercelRequest,
  res: VercelResponse,
  auth: AuthContext,
) {
  const id = typeof req.query.id === 'string' ? req.query.id : null;

  if (req.method === 'GET') return listar(req, res, auth.userId);
  if (req.method === 'POST') return criar(req, res, auth.userId);
  if (req.method === 'PATCH' && id) return atualizar(req, res, auth.userId, id);
  if (req.method === 'DELETE' && id) return remover(res, auth.userId, id);

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
}

function serializar(c: typeof caregivers.$inferSelect, paciente: string) {
  return {
    id: c.id,
    profileId: c.profileId,
    patientName: paciente,
    fullName: c.fullName,
    phone: c.phone,
    relationship: c.relationship,
    notifyDose: c.notifyDose,
    notifyLate: c.notifyLate,
    notifyLowStock: c.notifyLowStock,
    notifyTaken: c.notifyTaken,
    active: c.active,
    invitedAt: c.invitedAt?.toISOString() ?? null,
  };
}

async function listar(req: VercelRequest, res: VercelResponse, userId: string) {
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : null;

  const filtros = [eq(caregivers.userId, userId), eq(profiles.isActive, true)];
  if (profileId) filtros.push(eq(caregivers.profileId, profileId));

  const linhas = await db
    .select({ c: caregivers, paciente: profiles.fullName })
    .from(caregivers)
    .innerJoin(profiles, eq(profiles.id, caregivers.profileId))
    .where(and(...filtros))
    .orderBy(asc(caregivers.createdAt));

  return json(res, 200, {
    caregivers: linhas.map((l) => serializar(l.c, l.paciente)),
    whatsappConfigurado: whatsappConfigurado(),
  });
}

/** Guarda o fuso do aparelho na conta — o agendador precisa dele. */
async function salvarFuso(userId: string, fuso: string | null | undefined) {
  if (!fuso || !fusoValido(fuso)) return;
  await db.update(users).set({ timezone: fuso }).where(eq(users.id, userId));
}

async function criar(req: VercelRequest, res: VercelResponse, userId: string) {
  const body = parseBody(res, acompanhanteSchema, req.body);
  if (!body) return;

  const perfil = await perfilDaConta(body.profileId, userId);
  if (!perfil) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  const telefone = normalizarTelefone(body.phone);
  if (!telefone) {
    return fail(res, 400, API_ERROR.VALIDATION_ERROR, {
      phone: 'Informe um celular com DDD, como (11) 99999-1234',
    });
  }

  await salvarFuso(userId, body.fuso);

  const [criado] = await db
    .insert(caregivers)
    .values({
      userId,
      profileId: perfil,
      fullName: body.fullName,
      phone: telefone,
      relationship: body.relationship?.trim() || null,
      notifyDose: body.notifyDose ?? true,
      notifyLate: body.notifyLate ?? true,
      notifyLowStock: body.notifyLowStock ?? true,
      notifyTaken: body.notifyTaken ?? true,
      active: body.active ?? true,
    })
    .returning();

  const [nomes] = await db
    .select({ quem: users.fullName, paciente: profiles.fullName })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(eq(profiles.id, perfil))
    .limit(1);

  // O convite e best-effort: o acompanhante fica cadastrado mesmo se o envio
  // falhar, e a tela diz o que aconteceu. Sem provedor configurado, nao tenta.
  let convite: 'enviada' | 'falha' | 'nao-configurado' = 'nao-configurado';
  if (whatsappConfigurado()) {
    const avisos = (Object.keys(NOMES_DOS_AVISOS) as (keyof typeof NOMES_DOS_AVISOS)[])
      .filter((k) => criado![k])
      .map((k) => NOMES_DOS_AVISOS[k]);
    const r = await enviarRegistrado({
      caregiverId: criado!.id,
      medicationId: null,
      kind: 'convite',
      slot: null,
      telefone,
      texto: textoDoConvite({
        quemConvida: nomes?.quem ?? 'Uma pessoa da família',
        paciente: nomes?.paciente ?? '',
        avisos,
      }),
    });
    convite = r === 'enviada' ? 'enviada' : 'falha';
    if (convite === 'enviada') {
      await db.update(caregivers).set({ invitedAt: new Date() }).where(eq(caregivers.id, criado!.id));
    }
  }

  return json(res, 201, {
    caregiver: serializar(criado!, nomes?.paciente ?? ''),
    convite,
  });
}

async function atualizar(req: VercelRequest, res: VercelResponse, userId: string, id: string) {
  const body = parseBody(res, acompanhantePatchSchema, req.body);
  if (!body) return;

  const [atual] = await db
    .select({ c: caregivers, paciente: profiles.fullName })
    .from(caregivers)
    .innerJoin(profiles, eq(profiles.id, caregivers.profileId))
    .where(and(eq(caregivers.id, id), eq(caregivers.userId, userId)))
    .limit(1);
  if (!atual) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  const mudancas: Partial<typeof caregivers.$inferInsert> = {};
  if (body.fullName !== undefined) mudancas.fullName = body.fullName;
  if (body.relationship !== undefined) mudancas.relationship = body.relationship?.trim() || null;
  if (body.phone !== undefined) {
    const telefone = normalizarTelefone(body.phone);
    if (!telefone) {
      return fail(res, 400, API_ERROR.VALIDATION_ERROR, {
        phone: 'Informe um celular com DDD, como (11) 99999-1234',
      });
    }
    mudancas.phone = telefone;
  }
  for (const k of ['notifyDose', 'notifyLate', 'notifyLowStock', 'notifyTaken', 'active'] as const) {
    if (body[k] !== undefined) mudancas[k] = body[k];
  }

  await salvarFuso(userId, body.fuso);

  const [salvo] = Object.keys(mudancas).length
    ? await db.update(caregivers).set(mudancas).where(eq(caregivers.id, id)).returning()
    : [atual.c];

  return json(res, 200, { caregiver: serializar(salvo!, atual.paciente) });
}

async function remover(res: VercelResponse, userId: string, id: string) {
  const apagados = await db
    .delete(caregivers)
    .where(and(eq(caregivers.id, id), eq(caregivers.userId, userId)))
    .returning({ id: caregivers.id });
  if (apagados.length === 0) return fail(res, 404, API_ERROR.INTERNAL_ERROR);
  res.status(204).end();
}
