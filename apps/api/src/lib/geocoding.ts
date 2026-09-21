import { rotuloDeLugar } from './uf';

/**
 * Converte endereco em coordenadas usando a API do MapTiler.
 *
 * Roda SEMPRE no servidor, com a chave privada. A chave de tiles, que vai
 * embutida no app, e outra e nao serve aqui: qualquer chave dentro do APK e
 * extraivel, entao a de geocodificacao nunca pode sair da Vercel.
 *
 * Nunca lanca excecao. Um endereco que o MapTiler nao reconhece — comum no
 * Brasil quando falta CEP — retorna null, e o medico e salvo sem coordenadas.
 * Endereco ruim tira o medico do mapa; nao pode impedir o cadastro.
 */

export type Coordenadas = {
  latitude: number;
  longitude: number;
};

/** Enquadra a busca no Brasil e evita acertos em outros paises. */
const PAIS = 'br';
const TIMEOUT_MS = 6000;

/**
 * Confianca minima para aceitar um resultado.
 *
 * O MapTiler nunca responde "nao achei": ele devolve o melhor palpite com um
 * `relevance` de 0 a 1. Medido na pratica: endereco real de Sao Paulo da 0,99
 * a 1,0, enquanto a string sem sentido "xkcd zzzz nao existe" deu 0,38 e
 * apontou para o centro do Rio de Janeiro.
 *
 * Um alfinete na cidade errada e pior que alfinete nenhum — quem cadastrou
 * confiaria numa localizacao falsa. Abaixo do limiar, tratamos como nao
 * encontrado e o medico fica sem mapa.
 */
const RELEVANCIA_MINIMA = 0.8;

export async function geocodificar(endereco: string): Promise<Coordenadas | null> {
  const chave = process.env.MAPTILER_PRIVATE_KEY;
  if (!chave) {
    // Ainda nao configurada: seguimos sem coordenadas em vez de travar o
    // cadastro. O aviso aparece nos logs da funcao.
    console.warn('[geocoding] MAPTILER_PRIVATE_KEY ausente — medico sera salvo sem mapa');
    return null;
  }

  const texto = endereco.trim();
  if (texto.length < 5) return null;

  const url =
    `https://api.maptiler.com/geocoding/${encodeURIComponent(texto)}.json` +
    `?key=${encodeURIComponent(chave)}&country=${PAIS}&limit=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      console.warn('[geocoding] MapTiler respondeu', response.status);
      return null;
    }

    const data = (await response.json()) as {
      features?: Array<{ center?: [number, number]; relevance?: number }>;
    };

    const melhor = data.features?.[0];
    if (!melhor) return null;

    const relevancia = melhor.relevance ?? 0;
    if (relevancia < RELEVANCIA_MINIMA) {
      console.warn(
        `[geocoding] descartado por baixa confianca (${relevancia.toFixed(2)}): "${texto}"`,
      );
      return null;
    }

    // O GeoJSON do MapTiler devolve [longitude, latitude] — nesta ordem.
    // Invertida, a coordenada cai no oceano; vale conferir num teste.
    const centro = melhor.center;
    if (!centro || centro.length !== 2) return null;

    const [longitude, latitude] = centro;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
  } catch (error) {
    console.warn('[geocoding] falhou:', error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Geocodificacao REVERSA: coordenada -> rotulo de lugar.
 *
 * Usada para mostrar "Sao Paulo, SP" quando a referencia e a posicao atual.
 *
 * Nao existe limiar de confianca aqui, ao contrario do caminho direto: uma
 * coordenada sempre cai em algum lugar real, e o risco de apontar para a
 * cidade errada nao se aplica.
 */
export async function geocodificarReverso(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const chave = process.env.MAPTILER_PRIVATE_KEY;
  if (!chave) return null;

  const url =
    `https://api.maptiler.com/geocoding/${longitude},${latitude}.json` +
    `?key=${encodeURIComponent(chave)}&limit=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      features?: Array<{ context?: Array<{ id?: string; text?: string }> }>;
    };

    const contexto = data.features?.[0]?.context ?? [];
    const achar = (prefixo: string) =>
      contexto.find((c) => c.id?.startsWith(prefixo))?.text ?? null;

    // `municipality` e a cidade e `subregion` e o estado por extenso.
    // `region` NAO serve: devolve "Regiao Sudeste".
    const cidade = achar('municipality') ?? achar('municipal_district') ?? achar('place');
    const estado = achar('subregion');

    return rotuloDeLugar(cidade, estado);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
