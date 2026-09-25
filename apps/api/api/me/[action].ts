import type { VercelRequest, VercelResponse } from '@vercel/node';

import { API_ERROR } from '../../src/contracts';
import { type AuthContext, requireAuth } from '../../src/lib/auth';
import { fail, withErrorHandling } from '../../src/lib/http';

import localizacao from '../../src/handlers/me/localizacao';
import perfil from '../../src/handlers/me/perfil';

/**
 * Tudo que e da CONTA de quem esta logado.
 *
 * Nasceu de `api/me/location.ts`, que era uma funcao de proposito unico. O
 * plano Hobby da Vercel aceita 12 funcoes serverless, o projeto ja estava em
 * 12/12, e a tela de Ajustes precisava de cinco rotas novas. Virando roteador,
 * a funcao passa a caber todas elas e a contagem nao se mexe.
 *
 * `location` continua com esse nome, em ingles e destoando das outras acoes,
 * porque a URL `/api/me/location` ESTA EM APLICATIVOS JA INSTALADOS. Renomear
 * quebraria a tela de medicos de quem ainda nao atualizou.
 *
 * DIVERGENCIA DELIBERADA em relacao a auth/[action].ts: ali cada handler
 * chama o que precisa de autenticacao; aqui o `requireAuth` roda no ROTEADOR,
 * uma vez, e o `auth` desce como terceiro argumento. Num arquivo onde a acao
 * seguinte pode ser `apagar-conta`, "esqueci de autenticar" precisa ser
 * impossivel por construcao, e nao uma linha que alguem lembra de escrever.
 *
 * Efeito colateral bom: uma sonda nao autenticada em /api/me/qualquer-coisa
 * responde 401 antes de 404, entao nao da para enumerar as acoes de fora.
 */
type Acao = (req: VercelRequest, res: VercelResponse, auth: AuthContext) => Promise<void>;

const ROTAS: Record<string, Acao> = {
  location: localizacao,
  perfil,
};

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  /**
   * O `typeof === 'string'` nao e zelo: a Vercel funde o parametro de rota com
   * a querystring, entao `/api/me/location?action=senha` faz `req.query.action`
   * virar array. Sem esta guarda, o indice do mapa receberia um array e o
   * comportamento passaria a depender da coercao do JavaScript.
   */
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  const handler = ROTAS[action];

  if (!handler) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  await handler(req, res, auth);
});
