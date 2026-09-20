import Constants from 'expo-constants';

/**
 * URL base da API na Vercel.
 *
 * Lembrete: o Expo Go rodando num celular fisico nao enxerga o localhost da sua
 * maquina. Em desenvolvimento, aponte EXPO_PUBLIC_API_URL para o preview
 * deployment da Vercel, ou para http://<ip-da-maquina>:3000 na mesma Wi-Fi.
 */
const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? fromExtra ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

/** Requisicoes que passarem disso sao abortadas — rede movel pode travar sem erro. */
export const REQUEST_TIMEOUT_MS = 15_000;
