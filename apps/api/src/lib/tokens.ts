import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

/** 15 minutos: curto o bastante para limitar a janela de revogacao. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** 60 dias, com rotacao a cada uso. */
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

const ISSUER = 'gestao-saude';
const AUDIENCE = 'mobile';

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error('JWT_SECRET ausente ou com menos de 32 caracteres. Veja .env.example.');
  }
  return new TextEncoder().encode(value);
}

export type AccessTokenClaims = {
  /** id do usuario */
  sub: string;
  /** id da sessao — permite revogar um dispositivo especifico */
  sid: string;
};

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return { sub: payload.sub, sid: payload.sid };
  } catch {
    // Assinatura invalida, expirado, issuer/audience errados.
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
