/**
 * Distancia em linha reta entre duas coordenadas, pela formula de Haversine.
 *
 * E a distancia "de passaro", nao a de trajeto: serve para dar nocao de perto
 * ou longe e para ordenar a lista, nao para estimar tempo de deslocamento.
 *
 * Vive aqui porque duas telas precisam dela — a lista de medicos e o mapa em
 * tela cheia.
 */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type ComCoordenada = {
  name: string;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Ordena do mais perto ao mais longe.
 *
 * Quem nao tem coordenada vai para o FIM — nao some, apenas desce. Sem ponto
 * de referencia, cai para ordem alfabetica, que e estavel e previsivel.
 */
export function ordenarPorDistancia<T extends ComCoordenada>(
  itens: T[],
  referencia: { latitude: number; longitude: number } | null,
): T[] {
  const alfabetica = (a: T, b: T) => a.name.localeCompare(b.name, 'pt-BR');

  if (!referencia) return [...itens].sort(alfabetica);

  return [...itens].sort((a, b) => {
    const da =
      a.latitude != null && a.longitude != null
        ? distanciaKm(referencia.latitude, referencia.longitude, a.latitude, a.longitude)
        : null;
    const db =
      b.latitude != null && b.longitude != null
        ? distanciaKm(referencia.latitude, referencia.longitude, b.latitude, b.longitude)
        : null;

    if (da == null && db == null) return alfabetica(a, b);
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
}
