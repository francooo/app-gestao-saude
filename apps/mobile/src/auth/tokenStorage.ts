import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { PublicUser } from '@gestao/shared';

/**
 * Tokens ficam no Keychain (iOS) / EncryptedSharedPreferences (Android) via
 * expo-secure-store — que funciona dentro do Expo Go, sem dev build.
 * Nunca usar AsyncStorage para isto: e texto puro no disco do app.
 *
 * No web o SecureStore nao existe; caimos para localStorage apenas para nao
 * quebrar o `expo start --web` durante o desenvolvimento. O alvo do produto e
 * mobile, entao isso nao e um caminho de producao.
 */

const ACCESS_KEY = 'gs.accessToken';
const REFRESH_KEY = 'gs.refreshToken';
const USER_KEY = 'gs.user';

const isWeb = Platform.OS === 'web';

/** Tipado a mao para nao depender da lib DOM no tsconfig do app. */
type WebStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const webStorage = (globalThis as { localStorage?: WebStorage }).localStorage;

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    // Nao sincroniza com o iCloud Keychain: credencial de app de saude nao
    // deve atravessar dispositivos.
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return webStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    webStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};

export const tokenStorage = {
  async save(session: StoredSession): Promise<void> {
    await Promise.all([
      setItem(ACCESS_KEY, session.accessToken),
      setItem(REFRESH_KEY, session.refreshToken),
      setItem(USER_KEY, JSON.stringify(session.user)),
    ]);
  },

  /** Usado pela rotacao de refresh token, que nao muda o usuario. */
  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([setItem(ACCESS_KEY, accessToken), setItem(REFRESH_KEY, refreshToken)]);
  },

  async load(): Promise<StoredSession | null> {
    const [accessToken, refreshToken, rawUser] = await Promise.all([
      getItem(ACCESS_KEY),
      getItem(REFRESH_KEY),
      getItem(USER_KEY),
    ]);

    if (!accessToken || !refreshToken || !rawUser) return null;

    try {
      return { accessToken, refreshToken, user: JSON.parse(rawUser) as PublicUser };
    } catch {
      // JSON corrompido: trata como sessao inexistente e limpa.
      await tokenStorage.clear();
      return null;
    }
  },

  async getRefreshToken(): Promise<string | null> {
    return getItem(REFRESH_KEY);
  },

  async getAccessToken(): Promise<string | null> {
    return getItem(ACCESS_KEY);
  },

  async clear(): Promise<void> {
    await Promise.all([removeItem(ACCESS_KEY), removeItem(REFRESH_KEY), removeItem(USER_KEY)]);
  },
};
