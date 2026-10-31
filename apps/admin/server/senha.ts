import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Verificacao de senha no mesmo formato de apps/api/src/lib/password.ts
 * ("scrypt$N$r$p$salt$chave"). Copiado, e nao importado, porque o painel e
 * um projeto separado e nao depende de codigo da API do app.
 */
const scrypt = promisify(scryptCallback) as (
  senha: string | Buffer,
  salt: string | Buffer,
  tamanho: number,
  opcoes: ScryptOptions,
) => Promise<Buffer>;

const MEMORIA_MAXIMA = 128 * 1024 * 1024;

// Mesmos parametros de scripts/criar-admin.mjs.
const N = 65536;
const R = 8;
const P = 1;

export async function gerarHashDeSenha(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const chave = await scrypt(senha.normalize('NFKC'), salt, 32, { N, r: R, p: P, maxmem: MEMORIA_MAXIMA });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${chave.toString('base64url')}`;
}

export async function verificarSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const [, N, r, p, salt64, chave64] = partes;
  const parametros = { N: Number(N), r: Number(r), p: Number(p) };
  if (!Number.isFinite(parametros.N) || !Number.isFinite(parametros.r) || !Number.isFinite(parametros.p)) {
    return false;
  }

  const salt = Buffer.from(salt64!, 'base64url');
  const esperado = Buffer.from(chave64!, 'base64url');
  if (esperado.length === 0 || salt.length === 0) return false;

  const obtido = await scrypt(senha.normalize('NFKC'), salt, esperado.length, {
    ...parametros,
    maxmem: MEMORIA_MAXIMA,
  });
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
}

/**
 * Gasta o mesmo tempo de uma verificacao real quando o e-mail nao existe, para
 * a resposta nao revelar quais e-mails sao de administradores.
 */
const HASH_DESCARTAVEL =
  'scrypt$65536$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function gastarTempoDeVerificacao(senha: string): Promise<void> {
  await verificarSenha(senha, HASH_DESCARTAVEL);
}
