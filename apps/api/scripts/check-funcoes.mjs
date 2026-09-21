/**
 * Conta as funcoes serverless e falha antes do deploy.
 *
 * O plano Hobby da Vercel aceita 12 por deploy. Estourar NAO quebra o build:
 * ele passa, o deploy simplesmente nao sobe, e os commits somem sem aviso.
 * Ja aconteceu neste projeto (13 funcoes; a saida foi juntar as rotas de auth
 * num roteador). Este script transforma esse desastre mudo num erro visivel.
 *
 * Vive em scripts/ e nao em api/, senao contaria a si mesmo.
 */
import { readdirSync } from 'node:fs';
import { sep } from 'node:path';

const LIMITE = 12;

const funcoes = readdirSync('api', { recursive: true })
  .map((f) => String(f).split(sep))
  // Arquivos e pastas iniciados por _ a Vercel ignora.
  .filter((partes) => partes.at(-1).endsWith('.ts') && !partes.some((p) => p.startsWith('_')))
  .map((partes) => partes.join('/'))
  .sort();

for (const f of funcoes) console.log('  ' + f);

if (funcoes.length > LIMITE) {
  console.error(`\nFuncoes: ${funcoes.length}/${LIMITE} — o deploy vai falhar EM SILENCIO.`);
  console.error('Junte rotas num roteador, como api/auth/[action].ts.');
  process.exit(1);
}

console.log(`\nFuncoes: ${funcoes.length}/${LIMITE}`);
