import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { loginAttempts } from '../db/schema';

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

/**
 * Janela deslizante em Postgres. Suficiente no volume de um app clinico e nao
 * adiciona mais um fornecedor. Se a tabela virar ponto quente, troque por
 * Upstash Redis mantendo esta mesma interface.
 */
export async function isRateLimited(email: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  const [byEmail] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.emailTry, email),
        eq(loginAttempts.success, false),
        gte(loginAttempts.createdAt, since),
      ),
    );

  if ((byEmail?.count ?? 0) >= MAX_FAILURES_PER_EMAIL) return true;

  if (!ip) return false;

  const [byIp] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ip, ip),
        eq(loginAttempts.success, false),
        gte(loginAttempts.createdAt, since),
      ),
    );

  return (byIp?.count ?? 0) >= MAX_FAILURES_PER_IP;
}

export async function recordLoginAttempt(
  email: string,
  ip: string | null,
  success: boolean,
): Promise<void> {
  await db.insert(loginAttempts).values({ emailTry: email, ip, success });
}
