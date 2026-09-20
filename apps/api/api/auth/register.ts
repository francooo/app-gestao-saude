import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq, gte, sql, and } from 'drizzle-orm';

import { createSession } from '../../src/auth/session';
import { API_ERROR, POLICY_VERSION, registerRequestSchema } from '../../src/contracts';
import { db } from '../../src/db/client';
import { consents, loginAttempts, profiles, users } from '../../src/db/schema';
import {
  clientIp,
  fail,
  json,
  parseBody,
  requireMethod,
  userAgent,
  withErrorHandling,
} from '../../src/lib/http';
import { hashPassword } from '../../src/lib/password';

/** Limite de contas criadas por IP, para conter criacao em massa. */
const MAX_SIGNUPS_PER_IP = 5;
const SIGNUP_WINDOW_MINUTES = 60;

/** Marcador reaproveitando a tabela login_attempts para contar cadastros por IP. */
const SIGNUP_MARKER = '@cadastro';

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = parseBody(res, registerRequestSchema, req.body);
  if (!body) return;

  const ip = clientIp(req);
  const ua = userAgent(req);

  // Sem isso, o endpoint vira uma fabrica de contas: qualquer script criaria
  // milhares, cada uma custando um hash scrypt de ~250ms de CPU faturada.
  if (ip) {
    const since = new Date(Date.now() - SIGNUP_WINDOW_MINUTES * 60 * 1000);
    const [recent] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.emailTry, SIGNUP_MARKER),
          eq(loginAttempts.ip, ip),
          gte(loginAttempts.createdAt, since),
        ),
      );

    if ((recent?.count ?? 0) >= MAX_SIGNUPS_PER_IP) {
      return fail(res, 429, API_ERROR.TOO_MANY_ATTEMPTS);
    }
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  if (existing) {
    // Compromisso assumido: isto revela que o e-mail tem conta.
    // Evitar o vazamento exigiria sempre responder 200 e resolver a
    // ambiguidade por e-mail de verificacao — o que so faz sentido quando o
    // envio de e-mail estiver configurado. Enquanto isso, o limite por IP
    // acima e o que impede varrer uma lista de enderecos.
    return fail(res, 409, API_ERROR.EMAIL_ALREADY_REGISTERED);
  }

  const passwordHash = await hashPassword(body.password);

  const userId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ email: body.email, passwordHash, fullName: body.fullName })
      .returning({ id: users.id });

    if (!created) throw new Error('Falha ao criar o usuario');

    // LGPD Art. 11: dado de saude e dado pessoal sensivel e exige
    // consentimento especifico. Gravado na MESMA transacao da conta — uma
    // conta sem registro de consentimento seria indefensavel.
    await tx.insert(consents).values({
      userId: created.id,
      policyVersion: POLICY_VERSION,
      ip,
      userAgent: ua,
    });

    // Perfil do titular, tambem na mesma transacao.
    //
    // Medicamentos e consultas sempre pertencem a um perfil. Uma conta sem
    // perfil seria um estado que a tela inicial nao consegue representar, e
    // que exigiria tratar "os meus dados" como caso especial em todo lugar.
    await tx.insert(profiles).values({
      userId: created.id,
      fullName: body.fullName,
      relationship: 'titular',
      isAccountHolder: true,
    });

    return created.id;
  });

  if (ip) {
    await db.insert(loginAttempts).values({ emailTry: SIGNUP_MARKER, ip, success: true });
  }

  const tokens = await createSession(userId, { ip, userAgent: ua });

  // 201: recurso criado. Ja devolve a sessao para a pessoa entrar direto.
  json(res, 201, {
    ...tokens,
    user: { id: userId, email: body.email, fullName: body.fullName },
  });
});
