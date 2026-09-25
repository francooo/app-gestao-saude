import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, isNull } from 'drizzle-orm';

import { API_ERROR, trocaDeEmailSchema } from '../../contracts';
import { db } from '../../db/client';
import { emailChangeTokens, users } from '../../db/schema';
import type { AuthContext } from '../../lib/auth';
import {
  sendEmailChangeConfirmation,
  sendEmailChangeNotice,
  sendEmailTakenNotice,
} from '../../lib/email';
import { clientIp, fail, parseBody } from '../../lib/http';
import { verifyPassword } from '../../lib/password';
import { isRateLimited, recordLoginAttempt } from '../../lib/rateLimit';
import { generateRefreshToken, hashToken } from '../../lib/tokens';

const MARCADOR = '@senha:';

/** O link vale meia hora, igual ao de recuperacao de senha. */
const VALIDADE_MS = 30 * 60 * 1000;

/**
 * Pedir a troca do e-mail da conta.
 *
 * O e-mail NAO muda aqui. Ele muda quando o link enviado ao endereco NOVO for
 * aberto — e essa e a peca que evita o pior desfecho possivel deste
 * aplicativo: digitar o endereco errado, esquecer a senha meses depois, e
 * descobrir que a recuperacao vai para uma caixa que nao existe, com o
 * historico de saude da familia inteira preso do outro lado.
 *
 * O endereco antigo continua valendo ate la, e recebe um aviso de que a troca
 * foi pedida — e a chance de reagir se nao foi ele quem pediu.
 *
 * RESPONDE 204 SEMPRE, inclusive quando o endereco novo ja pertence a outra
 * conta. Dizer "ja existe" transformaria esta rota num verificador de "esta
 * pessoa tem conta num aplicativo de saude", que e informacao sensivel por si
 * so. Quem recebe o aviso, nesse caso, e o dono do endereco disputado.
 */
export default async function email(
  req: VercelRequest,
  res: VercelResponse,
  auth: AuthContext,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
  }

  const body = parseBody(res, trocaDeEmailSchema, req.body);
  if (!body) return;

  const ip = clientIp(req);
  const balde = `${MARCADOR}${auth.userId}`;

  /**
   * O limite conta TAMBEM a tentativa com endereco ja usado, e nao so a senha
   * errada. Sem isso, quem tivesse um token valido poderia varrer uma lista de
   * enderecos a custo de um scrypt da propria senha por tentativa.
   */
  if (await isRateLimited(balde, ip)) {
    return fail(res, 429, API_ERROR.TOO_MANY_ATTEMPTS);
  }

  const [u] = await db
    .select({ email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  if (!u) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  if (!(await verifyPassword(body.currentPassword, u.passwordHash))) {
    await recordLoginAttempt(balde, ip, false);
    return fail(res, 403, API_ERROR.WRONG_PASSWORD);
  }

  /**
   * Trocar pelo mesmo endereco, com outra caixa, nao e erro.
   *
   * `emailSchema` ja faz toLowerCase e a coluna e citext, entao "Ana@X.com" e
   * "ana@x.com" sao o MESMO endereco — e a checagem de duplicidade casaria a
   * propria linha do usuario. Sem este curto-circuito, a pessoa tomaria um
   * erro tentando corrigir a caixa do proprio e-mail.
   */
  if (body.newEmail === u.email) {
    res.status(204).end();
    return;
  }

  const [ocupado] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.newEmail))
    .limit(1);

  const token = generateRefreshToken();

  if (!ocupado) {
    await db.transaction(async (tx) => {
      // Um pedido de cada vez: um link antigo numa caixa de entrada que a
      // pessoa ja desistiu de usar nao pode continuar valendo.
      await tx
        .update(emailChangeTokens)
        .set({ usedAt: new Date() })
        .where(
          and(eq(emailChangeTokens.userId, auth.userId), isNull(emailChangeTokens.usedAt)),
        );

      await tx.insert(emailChangeTokens).values({
        userId: auth.userId,
        newEmail: body.newEmail,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VALIDADE_MS),
        requestedIp: ip,
      });
    });
  }

  // Contabiliza inclusive o caso "endereco ocupado": e o que impede a varredura
  // de lista descrita acima.
  await recordLoginAttempt(balde, ip, false);

  /**
   * Envio best-effort, exatamente como em forgot-password.
   *
   * Falha de e-mail nao pode virar 500: o 500 denunciaria, pela diferenca de
   * resposta, se o endereco estava ocupado ou nao — que e justamente o que o
   * 204 constante existe para esconder.
   */
  try {
    if (ocupado) {
      // O endereco pertence a outra conta. Quem precisa saber disso e o DONO
      // dele, nao quem pediu a troca.
      await sendEmailTakenNotice(body.newEmail);
    } else {
      await sendEmailChangeConfirmation(body.newEmail, token);
      await sendEmailChangeNotice(u.email, body.newEmail);
    }
  } catch (erro) {
    console.error('[conta] falha ao enviar e-mail de troca', {
      name: erro instanceof Error ? erro.name : 'unknown',
    });
  }

  res.status(204).end();
}
