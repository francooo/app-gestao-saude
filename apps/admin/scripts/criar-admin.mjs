// Cria um administrador do painel em painel.admin_users.
//
// Uso (na raiz do repo): node apps/admin/scripts/criar-admin.mjs <email> "<nome>"
//
// A senha inicial e gerada aqui e gravada so em apps/admin/.env.admin-inicial
// (ignorado pelo git), nunca no terminal: apague o arquivo depois do primeiro
// login. Conecta como painel_admin, que so pode inserir em painel.admin_users.
import { createRequire } from 'node:module';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pastaAdmin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(pastaAdmin, '..', '..', 'package.json'));
const { Pool, neonConfig } = require('@neondatabase/serverless');
neonConfig.webSocketConstructor = require('ws');

const [email, nome] = process.argv.slice(2);
if (!email?.includes('@') || !nome?.trim()) {
  console.error('Uso: node apps/admin/scripts/criar-admin.mjs <email> "<nome>"');
  process.exit(1);
}

const arquivoSenha = path.join(pastaAdmin, '.env.admin-inicial');
if (existsSync(arquivoSenha)) {
  console.error('apps/admin/.env.admin-inicial ja existe; apague-o antes de criar outro admin.');
  process.exit(1);
}

// Mesmo formato de apps/api/src/lib/password.ts, para o login do painel
// verificar com o mesmo codigo.
const scrypt = promisify(scryptCallback);
const N = 65536;
const r = 8;
const p = 1;
async function hashPassword(senha) {
  const salt = randomBytes(16);
  const key = await scrypt(senha.normalize('NFKC'), salt, 32, { N, r, p, maxmem: 128 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const senha = Array.from(randomBytes(20), (b) => alfabeto[b % alfabeto.length]).join('');

const env = Object.fromEntries(
  readFileSync(path.join(pastaAdmin, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const pool = new Pool({ connectionString: env.DATABASE_URL_UNPOOLED });
const { rows } = await pool.query(
  `insert into painel.admin_users (email, password_hash, full_name)
   values ($1, $2, $3)
   on conflict (email) do nothing
   returning id`,
  [email.trim(), await hashPassword(senha), nome.trim()],
);
await pool.end();

if (!rows.length) {
  console.error(`Ja existe um admin com o e-mail ${email}. Nada foi alterado.`);
  process.exit(1);
}

writeFileSync(
  arquivoSenha,
  `# Senha inicial do painel para ${email}. Apague este arquivo depois do primeiro login.\nSENHA_INICIAL=${senha}\n`,
);
console.log(`Admin criado: ${nome.trim()} <${email.trim()}> (id ${rows[0].id}).`);
console.log('Senha inicial gravada em apps/admin/.env.admin-inicial.');
