import { and, eq, isNull, ne } from 'drizzle-orm';

import { db } from '../db/client';
import { refreshTokens, sessions } from '../db/schema';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from '../lib/tokens';

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type Context = { ip: string | null; userAgent: string | null };

/** Cria uma sessao nova (um dispositivo) e o primeiro refresh token dela. */
export async function createSession(userId: string, ctx: Context): Promise<IssuedTokens> {
  const [session] = await db
    .insert(sessions)
    .values({ userId, ip: ctx.ip, userAgent: ctx.userAgent })
    .returning({ id: sessions.id });

  if (!session) throw new Error('Falha ao criar a sessao');

  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokens).values({
    sessionId: session.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return {
    accessToken: await signAccessToken({ sub: userId, sid: session.id }),
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export type RotationResult =
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; reason: 'not_found' | 'expired' | 'revoked' | 'session_revoked' };

/**
 * Rotaciona o refresh token dentro de uma transacao.
 *
 * Deteccao de reuso: se alguem apresentar um token que ja foi usado e revogado,
 * o token vazou. Nesse caso revogamos a familia inteira — todos os refresh
 * tokens daquela sessao — e forcamos novo login. E o padrao recomendado pelo
 * OAuth 2.1 e a parte que quase toda implementacao artesanal esquece.
 */
export async function rotateRefreshToken(
  presentedToken: string,
  ctx: Context,
): Promise<RotationResult> {
  const presentedHash = hashToken(presentedToken);

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, presentedHash))
      .for('update');

    if (!current) return { ok: false, reason: 'not_found' } as const;

    if (current.revokedAt) {
      // Replay de um token ja rotacionado: mata a familia toda.
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.sessionId, current.sessionId), isNull(refreshTokens.revokedAt)));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, current.sessionId));
      return { ok: false, reason: 'revoked' } as const;
    }

    if (current.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' } as const;
    }

    const [session] = await tx.select().from(sessions).where(eq(sessions.id, current.sessionId));
    if (!session || session.revokedAt) return { ok: false, reason: 'session_revoked' } as const;

    const nextToken = generateRefreshToken();
    const [inserted] = await tx
      .insert(refreshTokens)
      .values({
        sessionId: session.id,
        tokenHash: hashToken(nextToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      })
      .returning({ id: refreshTokens.id });

    await tx
      .update(refreshTokens)
      .set({ usedAt: new Date(), revokedAt: new Date(), replacedBy: inserted?.id })
      .where(eq(refreshTokens.id, current.id));

    await tx
      .update(sessions)
      .set({ lastUsedAt: new Date(), ip: ctx.ip, userAgent: ctx.userAgent })
      .where(eq(sessions.id, session.id));

    return {
      ok: true,
      tokens: {
        accessToken: await signAccessToken({ sub: session.userId, sid: session.id }),
        refreshToken: nextToken,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    } as const;
  });
}

/** Encerra uma sessao especifica (logout do dispositivo atual). */
export async function revokeSessionByRefreshToken(presentedToken: string): Promise<void> {
  const presentedHash = hashToken(presentedToken);

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ sessionId: refreshTokens.sessionId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, presentedHash));

    if (!current) return;

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.sessionId, current.sessionId), isNull(refreshTokens.revokedAt)));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, current.sessionId));
  });
}

/**
 * Derruba todos os aparelhos MENOS um.
 *
 * Usado ao trocar a senha estando logado, e a diferenca em relacao ao
 * revokeAllSessions e deliberada. La a premissa e "a conta pode estar
 * comprometida, e quem pede prova a identidade por e-mail" — derrubar tudo e
 * certo. Aqui a premissa e o oposto: a pessoa tem sessao valida E sabe a senha
 * atual, ou seja, e a unica sessao comprovadamente legitima. Expulsa-la logo
 * depois de "senha alterada com sucesso" seria o pior par de telas possivel.
 *
 * Derrubar as OUTRAS continua importando: se a troca foi por suspeita de
 * invasao, deixar o invasor logado anula o ato. E como o requireAuth confere a
 * linha de `sessions` a cada requisicao, o corte e imediato — nao espera os 15
 * minutos do access token.
 */
export async function revokeAllSessionsExcept(
  userId: string,
  sessionId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          ne(sessions.id, sessionId),
        ),
      );

    for (const row of rows) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.sessionId, row.id), isNull(refreshTokens.revokedAt)));
    }

    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          ne(sessions.id, sessionId),
        ),
      );
  });
}

/** Usado apos redefinicao de senha: derruba todos os dispositivos do usuario. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

    for (const row of rows) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.sessionId, row.id), isNull(refreshTokens.revokedAt)));
    }

    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  });
}
