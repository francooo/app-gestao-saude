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
      features?: Array<{ center?: [number, number] }>;
    };

    // O GeoJSON do MapTiler devolve [longitude, latitude] — nesta ordem.
    // Invertida, a coordenada cai no oceano; vale conferir num teste.
    const centro = data.features?.[0]?.center;
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
