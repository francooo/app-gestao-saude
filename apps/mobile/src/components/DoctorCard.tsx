import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { StarRating } from '@/components/StarRating';
import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';

export type Doctor = {
  id: string;
  name: string;
  specialty: string | null;
  clinicName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  defaultModality: 'presencial' | 'teleconsulta' | null;
  myRating: number | null;
};

type Props = {
  doctor: Doctor;
  /** Em km, quando ha localizacao e coordenadas. */
  distanceKm?: number | null;
  onPress: () => void;
  onAction: () => void;
};

export function DoctorCard({ doctor, distanceKm, onPress, onAction }: Props) {
  const teleconsulta = doctor.defaultModality === 'teleconsulta';

  // Linha de contexto: distancia quando da, senao o consultorio.
  const contexto = [
    distanceKm != null ? `${distanceKm.toFixed(1).replace('.', ',')} km` : null,
    teleconsulta ? 'Teleconsulta' : doctor.clinicName || 'Consulta presencial',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${doctor.name}, ${doctor.specialty ?? 'sem especialidade'}`}
      style={({ pressed }) => (pressed ? styles.pressionado : undefined)}
    >
      <SurfaceCard style={styles.card}>
        <View style={styles.conteudo}>
          <Avatar nome={doctor.name} size={68} />

          <View style={styles.textos}>
            <View style={styles.tituloLinha}>
              <Text style={styles.nome} numberOfLines={1}>
                {doctor.name}
              </Text>
              <Feather name="chevron-right" size={20} color={colors.textSecondary} />
            </View>

            {doctor.specialty ? (
              <Text style={styles.especialidade} numberOfLines={1}>
                {doctor.specialty}
              </Text>
            ) : null}

            <View style={styles.contextoLinha}>
              <Feather
                name={teleconsulta ? 'video' : 'map-pin'}
                size={13}
                color={colors.textSecondary}
              />
              <Text style={styles.contexto} numberOfLines={1}>
                {contexto}
              </Text>
            </View>

            <StarRating value={doctor.myRating} size={16} label="Sem nota sua" />
          </View>
        </View>

        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={`Nova consulta com ${doctor.name}`}
          // A cor codifica a modalidade, como no mockup: verde para
          // presencial, ambar para teleconsulta.
          style={({ pressed }) => [
            styles.acao,
            { backgroundColor: teleconsulta ? colors.accent : colors.actionGreen },
            pressed && styles.acaoPressionada,
          ]}
        >
          <Text style={styles.acaoTexto}>Nova consulta</Text>
        </Pressable>
      </SurfaceCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressionado: { opacity: 0.9 },
  card: { padding: spacing.lg },
  conteudo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textos: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  tituloLinha: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nome: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.sectionTitle,
  },
  especialidade: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.accentGreenSoft,
    marginTop: 2,
  },
  contextoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  contexto: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  acao: {
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  acaoPressionada: { opacity: 0.85 },
  acaoTexto: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.onAccent,
  },
});
