import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Endpoint temporario de diagnostico.
 *
 * Importa cada modulo do grafo de /api/auth/login isoladamente, para que uma
 * falha de carregamento vire uma resposta JSON em vez de derrubar a funcao
 * inteira com FUNCTION_INVOCATION_FAILED (que nao diz qual modulo quebrou).
 *
 * REMOVER assim que o login estiver funcionando.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const results: Record<string, string> = {};

  const modules: Array<[string, () => Promise<unknown>]> = [
    ['zod', () => import('zod')],
    ['jose', () => import('jose')],
    ['node:crypto', () => import('node:crypto')],
    ['drizzle-orm', () => import('drizzle-orm')],
    ['@neondatabase/serverless', () => import('@neondatabase/serverless')],
    ['@vercel/functions', () => import('@vercel/functions')],
    ['ws', () => import('ws')],
    ['src/contracts', () => import('../src/contracts')],
    ['src/db/schema', () => import('../src/db/schema')],
    ['src/db/client', () => import('../src/db/client')],
    ['src/lib/http', () => import('../src/lib/http')],
    ['src/lib/tokens', () => import('../src/lib/tokens')],
    ['src/lib/password', () => import('../src/lib/password')],
    ['src/lib/rateLimit', () => import('../src/lib/rateLimit')],
    ['src/lib/email', () => import('../src/lib/email')],
    ['src/auth/session', () => import('../src/auth/session')],
  ];

  for (const [name, load] of modules) {
    try {
      await load();
      results[name] = 'ok';
    } catch (error) {
      results[name] = `FALHOU: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
    }
  }

  // Tenta tambem exercitar o scrypt, que e pesado em memoria.
  let scryptResult: string;
  try {
    const { hashPassword } = await import('../src/lib/password');
    const started = Date.now();
    await hashPassword('teste-de-diagnostico');
    scryptResult = `ok em ${Date.now() - started}ms`;
  } catch (error) {
    scryptResult = `FALHOU: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(
    JSON.stringify(
      {
        node: process.version,
        region: process.env.VERCEL_REGION ?? 'local',
        temJwtSecret: Boolean(process.env.JWT_SECRET),
        tamanhoJwtSecret: (process.env.JWT_SECRET ?? '').length,
        temDatabaseUrl: Boolean(process.env.DATABASE_URL),
        modulos: results,
        scrypt: scryptResult,
      },
      null,
      2,
    ),
  );
}
