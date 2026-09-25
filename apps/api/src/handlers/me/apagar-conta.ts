import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';

import { API_ERROR, exclusaoDeContaSchema } from '../../contracts';
import { db } from '../../db/client';
import { loginAttempts, users } from '../../db/schema';
import type { AuthContext } from '../../lib/auth';
import { clientIp, fail, parseBody } from '../../lib/http';
import { verifyPassword } from '../../lib/password';
import { isRateLimited, recordLoginAttempt } from '../../lib/rateLimit';

const MARCADOR = '@senha:';

/**
 * Direito a eliminacao, LGPD Art. 18 VI.
 *
 * APAGA DE VERDADE. `isActive: false` NAO atende: bloquear acesso e "bloqueio"
 * (inciso IV), que e outra coisa e nao substitui a eliminacao. Um registro de
 * saude inativo continua sendo tratamento de dado sensivel sem base legal — e
 * o `isActive` deste schema nem esconde os dados de um SELECT, so impede o
 * login.
 *
 * A cascata faz o trabalho pesado, como o schema promete em tres lugares:
 * users -> sessions -> refresh_tokens; users -> password_reset_tokens;
 * users -> email_change_tokens; users -> consents; users -> professionals;
 * users -> assistant_conversations -> assistant_messages; e
 * users -> profiles -> medications -> horarios, anexos e doses, alem de
 * profiles -> appointments.
 *
 * Os ANEXOS DE RECEITA sao o caso que mais justifica o apagamento real: eles
 * guardam nome do paciente, nome e CRM de um profissional que nunca consentiu
 * com este aplicativo, e as vezes o diagnostico escrito a mao. Esse dado de
 * terceiro so tinha base para existir como acessorio do prontuario do
 * paciente; sem o paciente, sem base. Deixar a foto de um CRM viva no banco,
 * sem titular e sem finalidade, seria indefensavel.
 *
 * Aqui a decisao antiga de guardar a foto como base64 no Postgres PAGA: a
 * exclusao e de verdade, e nao sobra objeto orfao em bucket nenhum.
 */
export default async function apagarConta(
  req: VercelRequest,
  res: VercelResponse,
  auth: AuthContext,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
  }

  const body = parseBody(res, exclusaoDeContaSchema, req.body);
  if (!body) return;

  const ip = clientIp(req);
  const balde = `${MARCADOR}${auth.userId}`;

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

  await db.transaction(async (tx) => {
    /**
     * `login_attempts` NAO TEM CHAVE ESTRANGEIRA para users — e por isso a
     * cascata nao a alcanca.
     *
     * Ela guarda o e-mail tentado e o IP. Sem esta linha, dado pessoal
     * diretamente identificavel sobreviveria a uma exclusao que a tela acabou
     * de prometer ser total. O comentario do schema ("a cascata faz o direito
     * a exclusao funcionar sem codigo novo") esta certo para o dominio de
     * saude e errado para esta tabela.
     *
     * As linhas de cadastro por IP ficam: sao chaveadas por IP, nao
     * identificam a pessoa, e apaga-las zeraria a protecao antifraude.
     */
    await tx.delete(loginAttempts).where(eq(loginAttempts.emailTry, u.email));

    // E daqui desce toda a cascata.
    await tx.delete(users).where(eq(users.id, auth.userId));
  });

  // Sem corpo: nao ha mais conta sobre a qual dizer nada. O aplicativo limpa os
  // tokens e cai na tela de entrada pelo guard de sessao.
  res.status(204).end();
}
