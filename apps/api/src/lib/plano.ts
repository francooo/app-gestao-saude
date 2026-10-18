import type { VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';

import { API_ERROR } from '../contracts';
import { db } from '../db/client';
import { users } from '../db/schema';
import { fail } from './http';

/**
 * Niveis de acesso: o UNICO lugar que decide quem tem os recursos de IA.
 *
 *   gratuito  tudo, menos IA (ler receita/caixinha, assistente, "Descreva
 *             como tomar")
 *   premium   tudo — por assinatura vigente OU pelo teste gratis de 7 dias
 *
 * Quem decide e o SERVIDOR, a cada chamada de IA. O aplicativo so esconde o
 * botao e explica; um aplicativo adulterado que chame a rota leva 403. Nao vai
 * no JWT de proposito: o token vive 15 min, e um plano vencido continuaria
 * valendo ate ele expirar — alem de exigir token novo depois de cada compra.
 */

export const DIAS_DE_TESTE = 7;

type ColunasDoPlano = {
  trialEndsAt: Date | null;
  premiumUntil: Date | null;
};

export type Plano = {
  premium: boolean;
  /** Por que tem acesso; null no gratuito. A assinatura vence o teste. */
  motivo: 'assinatura' | 'teste' | null;
  /** Ate quando o acesso vale (ISO), ou null no gratuito. */
  ate: string | null;
  /** Fim do teste, mesmo ja vencido — a tela diz "seu teste acabou em...". */
  testeAte: string | null;
};

export function planoDe(u: ColunasDoPlano, agora = new Date()): Plano {
  const testeAte = u.trialEndsAt?.toISOString() ?? null;
  if (u.premiumUntil && u.premiumUntil > agora) {
    return { premium: true, motivo: 'assinatura', ate: u.premiumUntil.toISOString(), testeAte };
  }
  if (u.trialEndsAt && u.trialEndsAt > agora) {
    return { premium: true, motivo: 'teste', ate: testeAte, testeAte };
  }
  return { premium: false, motivo: null, ate: null, testeAte };
}

export function fimDoTeste(desde = new Date()): Date {
  return new Date(desde.getTime() + DIAS_DE_TESTE * 86_400_000);
}

/**
 * Bloqueio das rotas de IA. Chamar logo depois do requireAuth; devolve false
 * (e ja respondeu 403) quando a conta nao tem acesso.
 *
 * Responde ANTES de qualquer custo: nenhuma linha de limite diario e gravada e
 * nenhuma chamada ao provedor sai para quem nao pode usar.
 */
export async function exigirPremium(res: VercelResponse, userId: string): Promise<boolean> {
  const [u] = await db
    .select({ trialEndsAt: users.trialEndsAt, premiumUntil: users.premiumUntil })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (u && planoDe(u).premium) return true;
  fail(res, 403, API_ERROR.SUBSCRIPTION_REQUIRED);
  return false;
}
