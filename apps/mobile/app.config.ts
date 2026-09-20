import type { ExpoConfig } from 'expo/config';

/**
 * Sage do fundo da ilustracao. Repetido aqui como literal porque este arquivo
 * roda no Node durante o build do Expo, antes de qualquer resolucao de
 * workspace — nao da para importar @gestao/shared.
 * Mantenha em sincronia com packages/shared/src/theme.ts -> colors.sage.
 */
const SAGE = '#7F8E5C';

const config: ExpoConfig = {
  name: 'Gestao Saude',
  slug: 'app-gestao-saude',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'gestaosaude',
  userInterfaceStyle: 'light',
  icon: './assets/images/icon.png',
  backgroundColor: SAGE,

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'br.com.gestaosaude.app',
  },

  android: {
    package: 'br.com.gestaosaude.app',
    adaptiveIcon: {
      foregroundImage: './assets/images/icon.png',
      backgroundColor: SAGE,
    },
    // Encolhe a tela quando o teclado abre, em vez de empurrar a janela inteira.
    softwareKeyboardLayoutMode: 'resize',
  },

  web: {
    bundler: 'metro',
    output: 'single',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    // No SDK 57 o splash deixou de ser campo do ExpoConfig e passou a ser
    // configuracao do proprio plugin.
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash.png',
        resizeMode: 'cover',
        backgroundColor: SAGE,
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  },
};

export default config;
