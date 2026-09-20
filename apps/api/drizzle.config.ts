import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Migrations usam a conexao DIRETA (sem "-pooler" no host).
 * O pooler do Neon roda em modo de transacao e nao suporta bem os comandos de
 * DDL e os locks de sessao que o drizzle-kit precisa.
 */
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error('Defina DATABASE_URL_UNPOOLED (ou DATABASE_URL) em apps/api/.env.local');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
