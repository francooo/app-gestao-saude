import type { VercelRequest, VercelResponse } from '@vercel/node';

import { API_ERROR } from '../../src/contracts';
import { fail, withErrorHandling } from '../../src/lib/http';

import historico from '../../src/handlers/assistant/historico';
import lerFoto from '../../src/handlers/assistant/ler-foto';
import mensagem from '../../src/handlers/assistant/mensagem';

/**
 * Roteador do assistente.
 *
 * FUNCAO 12 DE 12 — A ULTIMA VAGA. O plano Hobby da Vercel aceita 12 funcoes
 * serverless por deploy, e estourar NAO quebra o build: ele passa, o deploy
 * simplesmente nao sobe, e os commits somem sem aviso. Ja aconteceu neste
 * projeto.
 *
 * A PARTIR DAQUI, QUALQUER ROTA NOVA EXIGE CONSOLIDAR ALGUMA EXISTENTE. Rodar
 * `pnpm --filter @gestao/api check:funcoes` antes de qualquer deploy.
 *
 * As acoes moram em src/handlers/assistant/, no mesmo padrao de
 * api/auth/[action].ts.
 *
 * ATENCAO: `ler-foto` NAO E O ASSISTENTE. Ela mora aqui por falta de vaga e
 * porque esta e a unica rota com maxDuration de 60 s no vercel.json — nao
 * porque leitura de foto seja uma conversa. Quem for mexer nela nao deve
 * reusar ASSISTANT_BUSY nem ASSISTANT_LIMIT_REACHED por analogia: aquelas
 * mensagens dizem "o assistente" para quem talvez nunca o tenha aberto. Ela
 * tem os proprios codigos, PHOTO_READ_*.
 */
const ROTAS: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<void>> = {
  mensagem,
  historico,
  'ler-foto': lerFoto,
};

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  const handler = ROTAS[action];

  if (!handler) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  await handler(req, res);
});
