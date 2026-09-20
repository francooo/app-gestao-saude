import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * JWT HS256 implementado com node:crypto.
 *
 * Antes isto usava a biblioteca `jose`, que derrubava a funcao na Vercel com
 * FUNCTION_INVOCATION_FAILED no carregamento do modulo (confirmado isolando o
 * import numa sonda). HS256 e simplesmente um HMAC-SHA256 sobre
 * "header.payload" em base64url — nao vale arrastar uma dependencia com risco
 * de empacotamento para isso, pela mesma razao que o hash de senha usa o
 * scrypt embutido em vez de argon2 nativo.
 *
 * Escopo deliberado: so assinamos e verificamos nossos proprios tokens, com um
 * unico algoritmo fixo. Nao ha negociacao de "alg" — o campo do header e
 * conferido contra HS256 e qualquer outra coisa e rejeitada, o que elimina de
 * saida o ataque classico de "alg: none".
 */

/** 15 minutos: curto o bastante para limitar a janela de revogacao. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** 60 dias, com rotacao a cada uso. */
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

const ISSUER = 'gestao-saude';
const AUDIENCE = 'mobile';
const HEADER = { alg: 'HS256', typ: 'JWT' } as const;

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error('JWT_SECRET ausente ou com menos de 32 caracteres. Veja .env.example.');
  }
  return value;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function sign(signingInput: string): string {
  return createHmac('sha256', secret()).update(signingInput).digest('base64url');
}

export type AccessTokenClaims = {
  /** id do usuario */
  sub: string;
  /** id da sessao — permite revogar um dispositivo especifico */
  sid: string;
};

type Payload = AccessTokenClaims & {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: Payload = {
    sub: claims.sub,
    sid: claims.sid,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
  };

  const signingInput = `${encode(HEADER)}.${encode(payload)}`;
  return `${signingInput}.${sign(signingInput)}`;
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [rawHeader, rawPayload, providedSignature] = parts as [string, string, string];

    const expected = Buffer.from(sign(`${rawHeader}.${rawPayload}`), 'base64url');
    const provided = Buffer.from(providedSignature, 'base64url');

    // Comparacao de tempo constante: um === vazaria o prefixo correto.
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

    const header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf8')) as {
      alg?: string;
    };
    // Rejeita qualquer algoritmo diferente do nosso, inclusive "none".
    if (header.alg !== HEADER.alg) return null;

    const payload = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8')) as
      Partial<Payload>;

    if (payload.iss !== ISSUER || payload.aud !== AUDIENCE) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;

    return { sub: payload.sub, sid: payload.sid };
  } catch {
    // base64 ou JSON malformado — token invalido, nao erro do servidor.
    return null;
  }
}

/** Token opaco de 256 bits. Nao e JWT: nao precisa carregar informacao. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 e suficiente aqui — ao contrario de uma senha, o token ja tem 256
 * bits de entropia, entao nao ha dicionario nem forca bruta viavel.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
