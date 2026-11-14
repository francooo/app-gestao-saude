import { rotear } from '../server/rotas.js';

/**
 * Unica funcao serverless da versao web. O vercel.json reescreve todo /api/*
 * para ca com ?caminho=..., e `rotear` repassa a chamada a API do aplicativo.
 */
export function GET(request: Request): Promise<Response> {
  return rotear(request);
}

export function POST(request: Request): Promise<Response> {
  return rotear(request);
}

export function PUT(request: Request): Promise<Response> {
  return rotear(request);
}

export function PATCH(request: Request): Promise<Response> {
  return rotear(request);
}

export function DELETE(request: Request): Promise<Response> {
  return rotear(request);
}
