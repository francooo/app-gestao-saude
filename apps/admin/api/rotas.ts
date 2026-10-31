import { rotear } from '../server/rotas.js';

/**
 * Unica funcao serverless do painel. O vercel.json reescreve todo /api/* para
 * ca com ?caminho=..., e `rotear` decide o handler. Uma funcao so mantem o
 * projeto longe do limite de funcoes do plano da Vercel.
 */
export function GET(request: Request): Promise<Response> {
  return rotear(request);
}

export function POST(request: Request): Promise<Response> {
  return rotear(request);
}

export function PATCH(request: Request): Promise<Response> {
  return rotear(request);
}
