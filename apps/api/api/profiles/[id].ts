import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, count, eq, gte } from 'drizzle-orm';

import { API_ERROR, profilePatchSchema } from '../../src/contracts';
import { db } from '../../src/db/client';
import {
  appointments,
  assistantConversations,
  medicationDoses,
  medications,
  profiles,
} from '../../src/db/schema';
import { requireAuth } from '../../src/lib/auth';
import { fail, json, parseBody, withErrorHandling } from '../../src/lib/http';
import { serializarPerfil } from '../../src/lib/serialize';

/**
 * Uma pessoa da familia.
 *
 * FUNCAO 11 DE 12. O plano Hobby da Vercel aceita 12 funcoes serverless por
 * deploy e estourar falha EM SILENCIO — o build passa e nada sobe. Sobra uma
 * vaga, reservada para o Assistente, que cabe num roteador unico no padrao de
 * api/auth/[action].ts. Rodar `pnpm --filter @gestao/api check:funcoes` antes
 * de acrescentar qualquer arquivo aqui.
 */
export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  // De proposito NAO filtra isActive: a ficha de alguem removido precisa
  // abrir, senao nao ha como oferecer restaurar.
  const [atual] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, id), eq(profiles.userId, auth.userId)))
    .limit(1);

  if (!atual) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  if (req.method === 'GET') return detalhar(res, atual);
  if (req.method === 'PATCH') return atualizar(req, res, atual);
  if (req.method === 'DELETE') return remover(res, atual);

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
});

/**
 * Quanta coisa some junto se este perfil for apagado.
 *
 * Fica so aqui, nunca na listagem: listProfiles roda em quatro telas a cada
 * foco, e pendurar agregacoes nela seria pagar em toda navegacao por um numero
 * que uma tela so mostra.
 */
async function contagens(profileId: string) {
  const [[remedios], [doses], [consultas], [futuras], [conversas]] = await Promise.all([
    db.select({ n: count() }).from(medications).where(eq(medications.profileId, profileId)),
    db
      .select({ n: count() })
      .from(medicationDoses)
      .where(eq(medicationDoses.profileId, profileId)),
    db.select({ n: count() }).from(appointments).where(eq(appointments.profileId, profileId)),
    db
      .select({ n: count() })
      .from(appointments)
      .where(
        and(eq(appointments.profileId, profileId), gte(appointments.scheduledAt, new Date())),
      ),
    db
      .select({ n: count() })
      .from(assistantConversations)
      .where(eq(assistantConversations.profileId, profileId)),
  ]);

  return {
    medications: remedios?.n ?? 0,
    doses: doses?.n ?? 0,
    appointments: consultas?.n ?? 0,
    upcomingAppointments: futuras?.n ?? 0,
    assistantConversations: conversas?.n ?? 0,
  };
}

async function detalhar(res: VercelResponse, atual: typeof profiles.$inferSelect) {
  return json(res, 200, { profile: serializarPerfil(atual), counts: await contagens(atual.id) });
}

async function atualizar(
  req: VercelRequest,
  res: VercelResponse,
  atual: typeof profiles.$inferSelect,
) {
  const body = parseBody(res, profilePatchSchema, req.body);
  if (!body) return;

  if (atual.isAccountHolder && body.isActive === false) {
    return fail(res, 400, API_ERROR.VALIDATION_ERROR, {
      isActive: 'O titular da conta não pode ser removido',
    });
  }

  // updatedAt e manual: nao ha gatilho no banco.
  const mudancas: Partial<typeof profiles.$inferInsert> = { updatedAt: new Date() };

  if (body.fullName !== undefined) mudancas.fullName = body.fullName;
  if (body.birthDate !== undefined) mudancas.birthDate = body.birthDate;
  if (body.relationship !== undefined) mudancas.relationship = body.relationship;
  if (body.avatarColor !== undefined) mudancas.avatarColor = body.avatarColor;
  if (body.notes !== undefined) mudancas.notes = body.notes;
  if (body.photo !== undefined) mudancas.photo = body.photo;
  if (body.weightKg !== undefined) {
    mudancas.weightKg = body.weightKg == null ? null : String(body.weightKg);
  }
  if (body.heightCm !== undefined) mudancas.heightCm = body.heightCm;
  if (body.isActive !== undefined) mudancas.isActive = body.isActive;

  const [atualizado] = await db
    .update(profiles)
    .set(mudancas)
    .where(eq(profiles.id, atual.id))
    .returning();

  return json(res, 200, { profile: serializarPerfil(atualizado!) });
}

async function remover(res: VercelResponse, atual: typeof profiles.$inferSelect) {
  if (atual.isAccountHolder) {
    return fail(res, 400, API_ERROR.VALIDATION_ERROR, {
      isActive: 'O titular da conta não pode ser apagado',
    });
  }

  await db.transaction(async (tx) => {
    /**
     * As conversas do assistente sao apagadas EXPLICITAMENTE, antes do perfil.
     *
     * A regra da coluna e SET NULL, e nao cascata. Sem esta linha a conversa
     * sobreviveria orfa — com o nome da pessoa no titulo e detalhes de saude
     * dela nas mensagens — logo depois de a tela prometer "apaga tudo". Num
     * aplicativo com consentimento LGPD gravado no cadastro, e o pior lugar
     * possivel para deixar dado sensivel solto.
     *
     * Hoje isso custa uma linha sobre zero registros (o Assistente ainda nao
     * existe). Depois custaria migracao de dados.
     */
    await tx.delete(assistantConversations).where(eq(assistantConversations.profileId, atual.id));

    // O resto — remedios, horarios, doses e consultas — sai por cascata.
    await tx.delete(profiles).where(eq(profiles.id, atual.id));
  });

  res.status(204).end();
}
