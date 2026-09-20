import { Feather } from '@expo/vector-icons';
import { Camera, Map, Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Doctor } from '@/components/DoctorCard';
import { MAPTILER_KEY } from '@/config';
import { colors, fonts, radii, spacing } from '@/theme';

/**
 * MapLibre nao usa nenhum servico do Google: e o renderizador open source, e
 * as imagens vem do MapTiler, que por sua vez usa OpenStreetMap.
 *
 * A chave do MapTiler vai na URL do estilo. Ela fica embutida no aplicativo e
 * e extraivel de qualquer APK — a protecao correta e restringi-la ao bundle
 * no painel do MapTiler, nao tentar oculta-la.
 */
const ESTILO = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;

type Props = {
  doctors: Doctor[];
  onSelectDoctor?: (id: string) => void;
  height?: number;
};

export function DoctorsMap({ doctors, onSelectDoctor, height = 220 }: Props) {
  // So entram no mapa os que foram geocodificados com confianca suficiente.
  const comCoordenada = useMemo(
    () =>
      doctors.filter(
        (d): d is Doctor & { latitude: number; longitude: number } =>
          d.latitude != null && d.longitude != null,
      ),
    [doctors],
  );

  const centro = useMemo<LngLat | null>(() => {
    if (comCoordenada.length === 0) return null;
    const soma = comCoordenada.reduce(
      (acc, d) => ({ lng: acc.lng + d.longitude, lat: acc.lat + d.latitude }),
      { lng: 0, lat: 0 },
    );
    return [soma.lng / comCoordenada.length, soma.lat / comCoordenada.length];
  }, [comCoordenada]);

  if (!MAPTILER_KEY) {
    return <Aviso height={height} texto="Mapa indisponível nesta versão do aplicativo." />;
  }

  if (!centro) {
    return (
      <Aviso
        height={height}
        texto="Nenhum endereço reconhecido ainda. Adicione o endereço do consultório para vê-lo no mapa."
      />
    );
  }

  return (
    <View style={[styles.wrapper, { height }]}>
      <Map style={StyleSheet.absoluteFill} mapStyle={ESTILO} logo={false}>
        <Camera
          // Zoom mais aberto quando ha varios pontos espalhados.
          initialViewState={{ center: centro, zoom: comCoordenada.length === 1 ? 14 : 11 }}
        />

        {comCoordenada.map((d) => (
          <Marker
            key={d.id}
            id={d.id}
            lngLat={[d.longitude, d.latitude]}
            onPress={() => onSelectDoctor?.(d.id)}
          >
            <View style={styles.alfinete}>
              <Feather name="map-pin" size={16} color={colors.onAccent} />
            </View>
          </Marker>
        ))}
      </Map>
    </View>
  );
}

function Aviso({ height, texto }: { height: number; texto: string }) {
  return (
    <View style={[styles.wrapper, styles.aviso, { height }]}>
      <Feather name="map" size={26} color={colors.textSecondary} />
      <Text style={styles.avisoTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  aviso: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  avisoTexto: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  alfinete: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.onAccent,
  },
});
