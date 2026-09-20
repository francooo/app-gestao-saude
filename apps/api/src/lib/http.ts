import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ZodType } from 'zod';

import { API_ERROR, type ApiErrorCode } from '../contracts';

export function json(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(body));
}

export function fail(
  res: VercelResponse,
  status: number,
  code: ApiErrorCode,
  fields?: Record<string, string>,
): void {
  json(res, status, fields ? { error: code, fields } : { error: code });
}

/** Garante o verbo esperado. Retorna false quando ja respondeu. */
export function requireMethod(
  req: VercelRequest,
  res: VercelResponse,
  method: 'GET' | 'POST' | 'DELETE',
): boolean {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
  return false;
}

/** Valida o corpo com um schema zod. Retorna null quando ja respondeu com 400. */
export function parseBody<T>(res: VercelResponse, schema: ZodType<T>, body: unknown): T | null {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !fields[key]) fields[key] = issue.message;
  }
  fail(res, 400, API_ERROR.VALIDATION_ERROR, fields);
  return null;
}

/**
 * IP do cliente. Na Vercel, x-forwarded-for e confiavel porque o proxy da
 * plataforma reescreve o header — nao da para o cliente forjar.
 */
export function clientIp(req: VercelRequest): string | null {
  const header = req.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header[0] : header;
  const first = raw?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export function userAgent(req: VercelRequest): string | null {
  const value = req.headers['user-agent'];
  return typeof value === 'string' ? value.slice(0, 500) : null;
}

/**
 * Envolve um handler capturando qualquer excecao.
 *
 * O detalhe nunca vai para o cliente: numa rota de auth, a mensagem de erro do
 * Postgres pode revelar estrutura. Os logs da Vercel ficam fora do Brasil,
 * entao tambem nao registramos corpo de requisicao nem credenciais.
 */
export function withErrorHandling(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('[api] erro nao tratado em', req.url, {
        name: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) fail(res, 500, API_ERROR.INTERNAL_ERROR);
    }
  };
}
