import type { VercelRequest, VercelResponse } from '@vercel/node';

import { API_ERROR } from '../../src/contracts';
import { type AuthContext, requireAuth } from '../../src/lib/auth';
import { fail, withErrorHandling } from '../../src/lib/http';

import sintomas from '../../src/handlers/diary/sintomas';

/**
 * Os diarios: o que a pessoa SENTIU e, depois, o que ela MEDIU.
 *
 * NASCEU ROTEADOR, e nao rota unica, por causa do limite de 12 funcoes
 * serverless do plano Hobby. O diario de medicoes (pressao, glicemia) ja esta
 * anunciado: aqui ele entra como acao nova, custando ZERO funcao. Como
 * `api/sintomas.ts`, o proximo dominio recomecaria esta discussao — e nao
 * haveria vaga para recomecar.
 *
 * A vaga desta funcao veio de `api/health.ts`, que virou acao do roteador de
 * auth. Era a unica das doze sem consumidor instalado.
 *
 * AS ACOES SAO NOMES DE RECURSO, NAO VERBOS. O verbo e o metodo HTTP: GET
 * lista, POST registra, DELETE apaga. Sem esta frase, a proxima acao vira
 * `registrar-sintoma` e o roteador degenera numa lista de procedimentos.
 *
 * O `requireAuth` roda NO ROTEADOR, como em me/[action].ts e ao contrario de
 * auth/[action].ts. Num arquivo cuja proxima acao sera `glicemia`, "esqueci de
 * autenticar" precisa ser impossivel por construcao: diario lido sem token e
 * vazamento de dado sensivel de saude.
 */
type Acao = (req: VercelRequest, res: VercelResponse, auth: AuthContext) => Promise<void>;

const ROTAS: Record<string, Acao> = {
  sintomas,
};

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  /**
   * O `typeof === 'string'` nao e zelo: a Vercel funde o parametro de rota com
   * a querystring, entao `/api/diary/sintomas?action=x` faz `req.query.action`
   * virar array.
   */
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  const handler = ROTAS[action];

  if (!handler) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  await handler(req, res, auth);
});
