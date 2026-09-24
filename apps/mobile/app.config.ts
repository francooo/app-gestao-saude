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
  /**
   * A versao E a identidade do runtime (ver runtimeVersion, no fim). Subir
   * para 0.2.0 e o que impede este pacote, que traz modulos nativos novos,
   * de ser entregue por OTA aos APKs 0.1.0 que nao os tem.
   *
   * REGRA: toda vez que uma dependencia NATIVA entrar ou sair, suba a versao
   * no mesmo commit em que ela muda.
   */
  version: '0.2.0',
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
        // Tres usos hoje: foto de um medico, foto de alguem da familia e a
        // foto da RECEITA de um remedio. Todos opcionais — sem eles o avatar
        // continua sendo as iniciais coloridas e o remedio segue sem anexo.
        //
        // O texto precisa citar os tres. Ele mencionava so o medico, e pedir
        // permissao falando de medico enquanto a pessoa tenta fotografar uma
        // receita e o tipo de descompasso que faz alguem negar — com razao.
        photosPermission:
          'O aplicativo acessa suas fotos apenas para você escolher a foto de um médico, de alguém da família ou da receita de um remédio.',
        cameraPermission:
          'O aplicativo usa a câmera apenas para você fotografar um médico, alguém da família ou a receita de um remédio.',
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
   * Continua em `appVersion`, com a versao subindo a cada mudanca nativa.
   *
   * O problema que isto resolve e real: antes, todo build se identificava
   * como 0.1.0, entao um `eas update` com um modulo nativo novo chegava a um
   * binario que nao o tinha e travava o aplicativo na abertura — sem rollback
   * que conserte rapido um app que nao abre.
   *
   * A politica `fingerprint` resolveria isso automaticamente, e foi tentada.
   * Ela NAO funciona neste projeto: a EAS recusa o build quando a impressao
   * digital calculada aqui difere da calculada la, e elas divergem sempre,
   * por duas razoes estruturais:
   *
   *  1. A EAS roda `prebuild` e gera a pasta `android/`, que entra na conta.
   *     Aqui ela nao existe, porque a configuracao nativa e gerada.
   *  2. Os arquivos de @expo/config-plugins e da arvore dele tem hashes
   *     diferentes entre a instalacao local (Windows, pnpm) e a do servidor.
   *
   * Ver o build 6ab3daa6, fase CONFIGURE_EXPO_UPDATES: 207 diferencas.
   */
  runtimeVersion: {
    policy: 'appVersion',
  },
};

export default config;
