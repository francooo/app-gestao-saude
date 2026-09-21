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
    // Gera o codigo nativo do MapLibre. Renderizador open source, sem
    // dependencia de servicos do Google — as imagens vem do MapTiler.
    '@maplibre/maplibre-react-native',
    [
      'expo-notifications',
      {
        // Icone e cor da notificacao no Android. Sem isto o sistema usa um
        // quadrado branco generico.
        icon: './assets/images/icon.png',
        color: SAGE,
      },
    ],
    [
      'expo-location',
      {
        // A permissao e OPCIONAL: sem ela a tela de medicos funciona igual,
        // apenas sem mostrar a distancia ate o consultorio. O texto precisa
        // dizer para que serve, senao a pessoa nega por falta de contexto.
        locationAlwaysAndWhenInUsePermission:
          'O aplicativo usa sua localização apenas para mostrar a distância até os consultórios dos seus médicos.',
        locationWhenInUsePermission:
          'O aplicativo usa sua localização apenas para mostrar a distância até os consultórios dos seus médicos.',
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
    [
      'expo-image-picker',
      {
        // Foto do medico no cadastro. Como a de localizacao, e opcional: sem
        // ela o avatar continua sendo as iniciais coloridas. O texto diz para
        // que serve, senao a pessoa nega por falta de contexto.
        photosPermission:
          'O aplicativo acessa suas fotos apenas para você escolher a foto de um médico que cadastrar.',
        cameraPermission:
          'O aplicativo usa a câmera apenas para você fotografar um médico que cadastrar.',
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
    // Escrito a mao porque o `eas init` nao consegue editar config dinamica.
    // Identifica o projeto em expo.dev/accounts/francooo/projects.
    eas: {
      projectId: '5aac8cc3-be3d-45d3-a69d-f2c699e78cea',
    },
  },

  owner: 'francooo',

  updates: {
    url: 'https://u.expo.dev/5aac8cc3-be3d-45d3-a69d-f2c699e78cea',
  },

  /**
   * `fingerprint` e nao `appVersion`.
   *
   * Com `appVersion`, todo build carregava a versao 0.1.0 e portanto o mesmo
   * runtime — um `eas update` com um modulo nativo novo chegava a um binario
   * que nao o tinha, e o aplicativo travava na abertura. Nao existe rollback
   * de OTA que conserte rapido um app que nao abre.
   *
   * Com `fingerprint`, a identidade vem das dependencias nativas de verdade:
   * uma atualizacao incompativel simplesmente nao e entregue.
   *
   * Consequencia conhecida: os APKs gerados antes desta mudanca tem outra
   * impressao digital e param de receber atualizacoes.
   */
  runtimeVersion: {
    policy: 'fingerprint',
  },
};

export default config;
