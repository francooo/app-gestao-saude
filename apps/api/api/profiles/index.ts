import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, asc, count, desc, eq } from 'drizzle-orm';

import {
  API_ERROR,
  MAXIMO_DE_PERFIS,
  profileInputSchema,
  profileQuerySchema,
} from '../../src/contracts';
import { db } from '../../src/db/client';
import { profiles } from '../../src/db/schema';
import { requireAuth } from '../../src/lib/auth';
import { fail, json, parseBody, parseQuery, withErrorHandling } from '../../src/lib/http';
import { serializarPerfil } from '../../src/lib/serialize';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listar(req, res, auth.userId);
  if (req.method === 'POST') return criar(req, res, auth.userId);

  res.setHeader('Allow', 'GET, POST');
  return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
});

async function listar(req: VercelRequest, res: VercelResponse, userId: string) {
  const q = parseQuery(res, profileQuerySchema, req.query);
  if (!q) return;

  const filtros = [eq(profiles.userId, userId)];
  // Removidos so aparecem sob pedido: e assim que a tela de cadastro oferece
  // trazer alguem de volta, sem poluir as outras quatro telas que listam
  // perfis a cada foco.
  if (q.includeInactive !== 'true') filtros.push(eq(profiles.isActive, true));

  const lista = await db
    .select()
    .from(profiles)
    .where(and(...filtros))
    // O titular primeiro, os removidos por ultimo, o resto em ordem
    // alfabetica: e a ordem em que a tela inicial e os seletores esperam
    // encontrar as pessoas.
    .orderBy(desc(profiles.isAccountHolder), desc(profiles.isActive), asc(profiles.fullName));

  json(res, 200, { profiles: lista.map(serializarPerfil) });
}

async function criar(req: VercelRequest, res: VercelResponse, userId: string) {
  const body = parseBody(res, profileInputSchema, req.body);
  if (!body) return;

  // Teto de gente por conta. O custo e um COUNT; sem ele, um duplo toque num
  // botao sem trava vira pessoa duplicada — e num aplicativo de saude pessoa
  // duplicada significa remedio duplicado.
  const [ativos] = await db
    .select({ total: count() })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.isActive, true)));

  if ((ativos?.total ?? 0) >= MAXIMO_DE_PERFIS) {
    return fail(res, 400, API_ERROR.VALIDATION_ERROR, {
      fullName: `Você já cadastrou o limite de ${MAXIMO_DE_PERFIS} pessoas`,
    });
  }

  const [criado] = await db
    .insert(profiles)
    .values({
      userId,
      fullName: body.fullName,
      birthDate: body.birthDate ?? null,
      relationship: body.relationship ?? null,
      avatarColor: body.avatarColor ?? null,
      notes: body.notes ?? null,
      photo: body.photo ?? null,
      // numeric exige string na escrita.
      weightKg: body.weightKg == null ? null : String(body.weightKg),
      // A data da medicao sai do SERVIDOR, nunca do corpo: quem cadastra um
      // peso esta dizendo quanto a pessoa pesa AGORA. Aceitar a data do
      // cliente abriria caminho para um peso antigo se passar por atual, que e
      // exatamente o que esta coluna existe para impedir.
      weightMeasuredAt: body.weightKg == null ? null : new Date(),
      heightCm: body.heightCm ?? null,
      // isAccountHolder fica de fora do contrato E daqui: so o cadastro da
      // conta cria titular, e o indice unico parcial recusaria um segundo.
    })
    .returning();

  json(res, 201, { profile: serializarPerfil(criado!) });
}
