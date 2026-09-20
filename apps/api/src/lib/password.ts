import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';

/**
 * promisify escolhe a sobrecarga de 3 argumentos do scrypt e descarta a que
 * aceita options, entao a chamada com { N, r, p } nao compila. O tipo abaixo
 * declara a assinatura que realmente usamos.
 */
const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Hashing de senha com scrypt do node:crypto.
 *
 * Por que scrypt e nao argon2id: argon2 exige binario nativo, e o pacote C++
 * classico falha no empacotamento de funcoes da Vercel. O @node-rs/argon2
 * resolve isso com binarios pre-compilados, mas adiciona risco de deploy logo
 * na primeira subida. scrypt e embutido no Node, tem zero dependencias, zero
 * risco de empacotamento, e os parametros abaixo atendem a recomendacao da
 * OWASP (N=2^16, r=8, p=1).
 *
 * Caminho de upgrade: o formato abaixo ja e versionado ("scrypt$..."), entao da
 * para migrar para argon2id depois re-hasheando no proximo login bem-sucedido,
 * sem invalidar as senhas existentes.
 */
const N = 65536; // 2^16 — ~64 MiB de memoria por hash
const r = 8;
const p = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

// O scrypt do Node recusa custos altos sem aumentar este limite.
const MAX_MEMORY = 128 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, {
    N,
    r,
    p,
    maxmem: MAX_MEMORY,
  });

  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, rawN, rawR, rawP, rawSalt, rawKey] = parts;
  const params = { N: Number(rawN), r: Number(rawR), p: Number(rawP) };
  if (!Number.isFinite(params.N) || !Number.isFinite(params.r) || !Number.isFinite(params.p)) {
    return false;
  }

  const salt = Buffer.from(rawSalt!, 'base64url');
  const expected = Buffer.from(rawKey!, 'base64url');

  // keylen 0 faz o scrypt lancar excecao; um hash corrompido deve so falhar.
  if (expected.length === 0 || salt.length === 0) return false;

  const actual = await scrypt(password.normalize('NFKC'), salt, expected.length, {
    ...params,
    maxmem: MAX_MEMORY,
  });

  // Comparacao de tempo constante: um === vazaria o prefixo correto por timing.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Hash descartavel, verificado quando o e-mail nao existe.
 *
 * Sem isso, a resposta para "usuario inexistente" voltaria em ~5ms e a de
 * "senha errada" em ~150ms, e essa diferenca revela quais contas existem.
 * A senha usada aqui e irrelevante — o que importa e gastar o mesmo tempo.
 */
let dummyHashPromise: Promise<string> | null = null;

export async function burnTimeAgainstDummyHash(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword('senha-inexistente-para-igualar-o-tempo');
  await verifyPassword(password, await dummyHashPromise);
}
