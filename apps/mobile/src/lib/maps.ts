import { Linking, Platform } from 'react-native';

/**
 * Abre a rota ate um endereco no app de mapas do celular.
 *
 * Nao tracamos rota dentro do aplicativo de proposito: a pessoa ja tem Waze
 * ou Google Maps com as preferencias dela, e nenhum mapa que construissemos
 * aqui teria transito em tempo real nem navegacao por voz.
 *
 * O `geo:` do Android abre o seletor com todos os apps de mapa instalados.
 * Se nada atender o esquema, `Linking.openURL` falha e o toque nao faria nada
 * — por isso a reserva em https, que sempre abre ao menos o navegador.
 */
export async function abrirRotaPara(
  latitude: number,
  longitude: number,
  rotulo?: string,
): Promise<boolean> {
  const coords = `${latitude},${longitude}`;
  const nome = rotulo?.trim();

  const nativo =
    Platform.OS === 'ios'
      ? `maps://?daddr=${coords}`
      : `geo:${coords}?q=${coords}${nome ? `(${encodeURIComponent(nome)})` : ''}`;

  const reserva = `https://www.google.com/maps/dir/?api=1&destination=${coords}`;

  try {
    await Linking.openURL(nativo);
    return true;
  } catch {
    try {
      await Linking.openURL(reserva);
      return true;
    } catch {
      return false;
    }
  }
}
