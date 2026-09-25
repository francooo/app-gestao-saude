import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { API_ERROR, confirmacaoDeEmailSchema } from '../../contracts';
import { revokeAllSessions } from '../../auth/session';
import { db } from '../../db/client';
import { emailChangeTokens, users } from '../../db/schema';
import { fail, json, parseBody } from '../../lib/http';
import { hashToken } from '../../lib/tokens';

/**
 * Consome o link que efetiva a troca de e-mail.
 *
 * NAO É AUTENTICADA, e e por isso que mora aqui e nao no roteador me/[action]:
 * o link e aberto no NAVEGADOR, que nao tem o token da sessao do aplicativo.
 * Mesma razao pela qual reset-password vive neste roteador.
 *
 * Quem prova ser dono do endereco novo e quem abre o link — o token e a prova,
 * e ela vale uma vez so.
 */
export default async function confirmarEmail(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
  }

  const body = parseBody(res, confirmacaoDeEmailSchema, req.body);
  if (!body) return;

  const [registro] = await db
    .select({
      id: emailChangeTokens.id,
      userId: emailChangeTokens.userId,
      newEmail: emailChangeTokens.newEmail,
    })
    .from(emailChangeTokens)
    .where(
      and(
        eq(emailChangeTokens.tokenHash, hashToken(body.token)),
        isNull(emailChangeTokens.usedAt),
        gt(emailChangeTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  // Token inexistente, ja usado ou vencido dao a MESMA resposta: distinguir
  // contaria a quem tem o link o que aconteceu com ele.
  if (!registro) return fail(res, 400, API_ERROR.INVALID_RESET_TOKEN);

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ email: registro.newEmail, updatedAt: new Date() })
        .where(eq(users.id, registro.userId));

      await tx
        .update(emailChangeTokens)
        .set({ usedAt: new Date() })
        .where(eq(emailChangeTokens.id, registro.id));
    });
  } catch (erro) {
    /**
     * Entre o pedido e a confirmacao cabe outra conta adotando o mesmo
     * endereco. O UNIQUE de users.email estoura 23505, e sem este tratamento
     * viraria 500 — uma pagina de erro generica para uma situacao que tem
     * explicacao clara.
     */
    if ((erro as { code?: string }).code === '23505') {
      return fail(res, 409, API_ERROR.EMAIL_ALREADY_REGISTERED);
    }
    throw erro;
  }

  /**
   * Agora sim derruba TUDO, inclusive quem pediu.
   *
   * Diferente da troca de senha, aqui a credencial de entrada mudou: continuar
   * logado com um e-mail que nao existe mais na conta seria um estado que nao
   * corresponde a nada. E se quem pediu a troca foi um invasor, isto tira a
   * sessao dele junto.
   */
  await revokeAllSessions(registro.userId);

  return json(res, 200, { email: registro.newEmail });
}
