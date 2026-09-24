/**
 * Confere o que o assistente gravou em tool_trace e se a contagem de buscas
 * do dia bate. Script de apoio; nao entra em nenhum caminho de producao.
 *
 * uso: pnpm --filter @gestao/api exec tsx scripts/conferir-rastro.ts
 */
import 'dotenv/config';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from '../src/db/client';
import { assistantConversations, assistantMessages } from '../src/db/schema';

async function principal() {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const ultimas = await db
    .select({
      quando: assistantMessages.createdAt,
      papel: assistantMessages.role,
      rastro: assistantMessages.toolTrace,
    })
    .from(assistantMessages)
    .where(eq(assistantMessages.role, 'assistant'))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(8);

  console.log('Ultimas respostas gravadas:');
  for (const m of ultimas) {
    console.log(' ', m.quando.toISOString(), JSON.stringify(m.rastro));
  }

  const [conta] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(assistantMessages)
    .innerJoin(
      assistantConversations,
      eq(assistantConversations.id, assistantMessages.conversationId),
    )
    .where(
      and(
        gte(assistantMessages.createdAt, desde),
        sql`${assistantMessages.toolTrace}->>'buscou' = 'true'`,
      ),
    );

  console.log('\nBuscas nas ultimas 24 h (todas as contas):', conta?.total ?? 0);
  process.exit(0);
}

void principal();
