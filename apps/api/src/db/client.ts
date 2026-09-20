import { Pool, neonConfig } from '@neondatabase/serverless';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

import * as schema from './schema';

/**
 * Driver WebSocket, e nao o HTTP.
 *
 * O conselho usual em serverless e usar o driver HTTP do Neon, mais leve. Mas
 * ele so faz batches nao-interativos, e a rotacao de refresh token precisa de
 * uma transacao interativa de verdade (validar -> revogar o antigo -> inserir o
 * novo -> atualizar a sessao, tudo atomico, com deteccao de reuso). Contornar
 * isso com CTEs para economizar um WebSocket nao compensa.
 *
 * Com o Fluid Compute da Vercel as instancias sao reaproveitadas quentes,
 * entao manter um pool em escopo de modulo e o padrao recomendado.
 */

// O Node 22+ tem WebSocket global, mas deteccao implicita e aposta: explicitamos.
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL nao configurada. Veja .env.example.');
}

const pool = new Pool({ connectionString });

// Faz a Vercel drenar o pool antes de suspender a instancia, em vez de cortar
// conexoes no meio.
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
export { schema };
