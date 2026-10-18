import { Feather } from '@expo/vector-icons';
import { Camera, Map, Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Doctor } from '@/components/DoctorCard';
import { ICONES, Icone } from '@/components/Icone';
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
// Variante clara do Streets (MapStyle.STREETS.LIGHT no SDK do MapTiler): o
// mockup mostra um mapa desbotado, que nao briga com os alfinetes coloridos.
const ESTILO = `https://api.maptiler.com/maps/pastel/style.json?key=${MAPTILER_KEY}`;

/**
 * Cores dos alfinetes, como no mockup: o primeiro da lista (o mais proximo,
 * porque a tela ordena por distancia) em verde e maior; os demais alternam
 * ambar e oliva so para se distinguirem entre si — a cor nao codifica nada.
 */
const COR_DESTAQUE = colors.accentGreen;
const CORES_DEMAIS = [colors.accent, colors.tileClock, colors.tileSun];

type Props = {
  doctors: Doctor[];
  onSelectDoctor?: (id: string) => void;
  /** Medido do mockup: o card do mapa ocupa 10,5% da altura da tela. */
  height?: number;
  /** Ocupa a tela toda, sem cantos arredondados. */
  fullScreen?: boolean;
};

export function DoctorsMap({ doctors, onSelectDoctor, height = 140, fullScreen }: Props) {
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

  const molde = fullScreen ? styles.wrapperCheio : [styles.wrapper, { height }];

  if (!MAPTILER_KEY) {
    return <Aviso molde={molde} texto="Mapa indisponível nesta versão do aplicativo." />;
  }

  if (!centro) {
    return (
      <Aviso
        molde={molde}
        texto="Nenhum endereço reconhecido ainda. Adicione o endereço do consultório para vê-lo no mapa."
      />
    );
  }

  return (
    <View style={molde}>
      <Map style={StyleSheet.absoluteFill} mapStyle={ESTILO} logo={false}>
        <Camera
          // Zoom mais aberto quando ha varios pontos espalhados.
          initialViewState={{ center: centro, zoom: comCoordenada.length === 1 ? 14 : 11 }}
        />

        {comCoordenada.map((d, i) => (
          <Marker
            key={d.id}
            id={d.id}
            lngLat={[d.longitude, d.latitude]}
            // A ponta da gota marca o endereco, nao o centro do desenho.
            anchor="bottom"
            onPress={() => onSelectDoctor?.(d.id)}
          >
            <Alfinete
              size={i === 0 ? 44 : 32}
              cor={i === 0 ? COR_DESTAQUE : CORES_DEMAIS[(i - 1) % CORES_DEMAIS.length]!}
            />
          </Marker>
        ))}
      </Map>
    </View>
  );
}

/**
 * Gota cheia com o miolo branco.
 *
 * O glifo `map-marker` tem o miolo VAZADO: sem nada atras, o mapa apareceria
 * pelo furo. O circulo branco fica ATRAS do glifo, um pouco maior que o furo —
 * o excesso some sob a tinta da gota, e so o miolo fica branco.
 */
function Alfinete({ size, cor }: { size: number; cor: string }) {
  const miolo = size * 0.3;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.miolo,
          {
            width: miolo,
            height: miolo,
            borderRadius: miolo / 2,
            left: (size - miolo) / 2,
            // O furo do glifo fica a 9/24 da altura.
            top: size * (9 / 24) - miolo / 2,
          },
        ]}
      />
      <Icone nome={ICONES.pinoCheio} size={size} color={cor} />
    </View>
  );
}

function Aviso({ molde, texto }: { molde: StyleProp<ViewStyle>; texto: string }) {
  return (
    <View style={[molde, styles.aviso]}>
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
  wrapperCheio: {
    flex: 1,
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
  miolo: {
    position: 'absolute',
    backgroundColor: colors.onAccent,
  },
});
