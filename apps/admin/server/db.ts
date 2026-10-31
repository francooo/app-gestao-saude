import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

/**
 * Conexao com o Neon pelo driver HTTP: uma consulta por requisicao, sem pool
 * para abrir e fechar dentro da funcao serverless.
 *
 * O usuario e `painel_admin` (apps/admin/db/0001_painel.sql): so leitura nas
 * tabelas do app e escrita apenas no schema `painel`. Um bug aqui nao consegue
 * alterar dado do aplicativo — o banco recusa.
 */
let sql: NeonQueryFunction<false, false> | null = null;

function conexao(): NeonQueryFunction<false, false> {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente');
  sql = neon(url);
  return sql;
}

export async function consultar<T = Record<string, unknown>>(
  texto: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  return (await conexao().query(texto, parametros)) as T[];
}
