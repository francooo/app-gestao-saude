import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, desc, eq, sql } from 'drizzle-orm';

import { assistantHistorySchema } from '../../contracts';
import { db } from '../../db/client';
import { assistantConversations, assistantMessages } from '../../db/schema';
import { requireAuth } from '../../lib/auth';
import { json, parseQuery, requireMethod, withErrorHandling } from '../../lib/http';
import { perfilDaConta } from '../../lib/ownership';

/** Quantas mensagens a tela carrega ao abrir. */
const LIMITE = 30;

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'GET')) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const q = parseQuery(res, assistantHistorySchema, req.query);
  if (!q) return;

  if (q.profileId) {
    const perfil = await perfilDaConta(q.profileId, auth.userId);
    // Perfil de outra conta responde vazio, nao erro: um erro distinguiria
    // "id inexistente" de "id de outra pessoa".
    if (!perfil) return json(res, 200, { messages: [] });
  }

  const filtro = q.profileId
    ? and(
        eq(assistantConversations.userId, auth.userId),
        eq(assistantConversations.profileId, q.profileId),
      )
    : and(
        eq(assistantConversations.userId, auth.userId),
        sql`${assistantConversations.profileId} IS NULL`,
      );

  const [conversa] = await db
    .select({ id: assistantConversations.id })
    .from(assistantConversations)
    .where(filtro)
    .orderBy(desc(assistantConversations.updatedAt))
    .limit(1);

  // Ainda nao perguntou nada sobre essa pessoa.
  if (!conversa) return json(res, 200, { messages: [] });

  // As mais RECENTES, depois reordenadas: com desc + limit pegamos o fim da
  // conversa; com asc + limit pegariamos o comeco, que e o contrario do que a
  // tela precisa.
  const linhas = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, conversa.id))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(LIMITE);

  json(res, 200, { messages: linhas.reverse() });
});
