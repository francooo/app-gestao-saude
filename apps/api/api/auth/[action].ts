import type { VercelRequest, VercelResponse } from '@vercel/node';

import { API_ERROR } from '../../src/contracts';
import { fail, withErrorHandling } from '../../src/lib/http';

import forgotPassword from '../../src/handlers/auth/forgot-password';
import login from '../../src/handlers/auth/login';
import logout from '../../src/handlers/auth/logout';
import refresh from '../../src/handlers/auth/refresh';
import register from '../../src/handlers/auth/register';
import confirmarEmail from '../../src/handlers/auth/confirmar-email';
import resetPassword from '../../src/handlers/auth/reset-password';

/**
 * Roteador das rotas de autenticacao.
 *
 * Existe por um limite da plataforma, nao por desenho: o plano Hobby da
 * Vercel aceita no maximo 12 funcoes serverless por deploy, e o projeto
 * chegou a 13. Juntar as seis rotas de auth num arquivo so derruba a
 * contagem para 8 e deixa folga para as proximas telas.
 *
 * As URLs nao mudam: /api/auth/login continua sendo /api/auth/login. Cada
 * handler segue no seu proprio arquivo, agora em src/handlers/auth/, com a
 * logica intacta — este arquivo so despacha.
 */
const ROTAS: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<void>> = {
  login,
  register,
  refresh,
  logout,
  'forgot-password': forgotPassword,
  'reset-password': resetPassword,
  // Aberta de proposito: o link e aberto no NAVEGADOR, que nao tem o token da
  // sessao do aplicativo. Quem prova ser dono do endereco e quem abre o link.
  'confirmar-email': confirmarEmail,
};

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  const handler = ROTAS[action];

  if (!handler) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  await handler(req, res);
});
