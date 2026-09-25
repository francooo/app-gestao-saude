import type { VercelRequest, VercelResponse } from '@vercel/node';

import { API_ERROR, POLICY_VERSION, reaceiteSchema } from '../../contracts';
import { db } from '../../db/client';
import { consents } from '../../db/schema';
import type { AuthContext } from '../../lib/auth';
import { clientIp, fail, json, parseBody, userAgent } from '../../lib/http';

/**
 * Registra um novo aceite da politica de privacidade.
 *
 * INSERE, nunca atualiza. A tabela e append-only por natureza: o historico de
 * a quais versoes a pessoa consentiu E o registro de conformidade que a LGPD
 * pede (Art. 8 §2 poe o onus da prova no controlador). Sobrescrever a linha
 * anterior apagaria justamente a prova de que houve base legal no periodo
 * anterior.
 *
 * Grava IP e user-agent pelo mesmo motivo do cadastro: reconstruir a
 * procedencia de um consentimento depois e inviavel.
 */
export default async function consentimento(
  req: VercelRequest,
  res: VercelResponse,
  auth: AuthContext,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
  }

  const body = parseBody(res, reaceiteSchema, req.body);
  if (!body) return;

  const [linha] = await db
    .insert(consents)
    .values({
      userId: auth.userId,
      policyVersion: POLICY_VERSION,
      ip: clientIp(req),
      userAgent: userAgent(req),
    })
    .returning({ policyVersion: consents.policyVersion, grantedAt: consents.grantedAt });

  return json(res, 201, {
    consent: {
      policyVersion: linha!.policyVersion,
      grantedAt: linha!.grantedAt.toISOString(),
      atual: true,
    },
  });
}
