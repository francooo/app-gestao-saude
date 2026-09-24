import Constants from 'expo-constants';

/**
 * URL base da API na Vercel.
 *
 * Lembrete: o Expo Go rodando num celular fisico nao enxerga o localhost da sua
 * maquina. Em desenvolvimento, aponte EXPO_PUBLIC_API_URL para o preview
 * deployment da Vercel, ou para http://<ip-da-maquina>:3000 na mesma Wi-Fi.
 *
 * O valor precisa estar nas Environment Variables do EAS, e nao apenas no
 * bloco `env` do eas.json: o `eas build` le o eas.json, mas o `eas update`
 * NAO — ele usa as variaveis do servidor. Um update publicado sem a variavel
 * sai apontando para localhost e o app falha como se fosse problema de rede.
 */
const doExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
const configurada = process.env.EXPO_PUBLIC_API_URL ?? doExtra;

const LOCALHOST = 'http://localhost:3000';

/**
 * true quando o bundle saiu sem a URL da API, ou apontando para localhost
 * fora do desenvolvimento.
 *
 * Existe para nao repetir o diagnostico ruim que isto ja causou: sem esta
 * checagem, um erro de configuracao de build chega ao usuario como
 * "verifique sua internet", que manda a pessoa investigar o lugar errado.
 */
export const API_URL_MAL_CONFIGURADA =
  !__DEV__ && (!configurada || configurada.includes('localhost') || configurada.includes('10.0.2.2'));

export const API_URL = (configurada ?? LOCALHOST).replace(/\/+$/, '');

if (API_URL_MAL_CONFIGURADA) {
  console.error(
    '[config] EXPO_PUBLIC_API_URL ausente ou apontando para localhost neste bundle. ' +
      'Defina a variavel no ambiente do EAS: eas env:set --environment <ambiente> ' +
      '--name EXPO_PUBLIC_API_URL --value https://... ',
  );
}

/**
 * Chave do MapTiler usada para baixar as imagens do mapa.
 *
 * Esta chave vai EMBUTIDA no aplicativo e e extraivel de qualquer APK — nao ha
 * como esconde-la. A protecao correta e restringi-la ao bundle
 * br.com.gestaosaude.app no painel do MapTiler, nao tentar oculta-la.
 *
 * A chave de geocodificacao e OUTRA e vive so na Vercel: converter endereco em
 * coordenada acontece no servidor, nunca aqui.
 */
export const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '';

/** Requisicoes que passarem disso sao abortadas — rede movel pode travar sem erro. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Tempo limite das perguntas ao assistente.
 *
 * Ele busca na internet e consulta o banco em rodadas, entao uma resposta pode
 * levar de 5 a 40 segundos — os 15 s padrao cortariam quase toda pergunta que
 * exige busca.
 *
 * E PROPOSITAL que este seja o MAIOR dos tres prazos:
 *
 *   laco no servidor 45 s  <  maxDuration da Vercel 60 s  <  este, 75 s
 *
 * Se o cliente desistisse primeiro, o servidor terminaria, gravaria a resposta,
 * e a pessoa veria erro para algo que existe no historico — e reenviaria,
 * pagando a busca duas vezes. Deixando o servidor morrer primeiro, o erro que
 * chega e real e nada foi gravado.
 */
export const ASSISTANT_TIMEOUT_MS = 75_000;
