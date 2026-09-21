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
  /** Data URI da foto. Opcional para o tipo aceitar Professional direto. */
  photo?: string | null;
};

type Props = {
  doctor: Doctor;
  /** Em km, quando ha ponto de referencia e coordenadas. */
  distanceKm?: number | null;
  onPress: () => void;
  onAction: () => void;
};

/**
 * Card do medico, no layout do mockup: avatar a esquerda, dados no meio,
 * chevron no canto superior direito e o botao de acao a direita.
 *
 * O botao ao lado (em vez de largura total embaixo) encolhe o card de ~170pt
 * para ~110pt, o que faz caber tres medicos na tela em vez de dois.
 */
export function DoctorCard({ doctor, distanceKm, onPress, onAction }: Props) {
  const teleconsulta = doctor.defaultModality === 'teleconsulta';

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
        <View style={styles.linha}>
          <Avatar nome={doctor.name} photo={doctor.photo} recyclingKey={doctor.id} size={58} />

          <View style={styles.meio}>
            <Text style={styles.nome} numberOfLines={1}>
              {doctor.name}
            </Text>

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

            <View style={styles.rodape}>
              <StarRating value={doctor.myRating} size={15} label="Sem nota" />

              <Pressable
                onPress={onAction}
                accessibilityRole="button"
                accessibilityLabel={`Nova consulta com ${doctor.name}`}
                hitSlop={6}
                // A cor codifica a modalidade, como no mockup: verde para
                // presencial, ambar para teleconsulta.
                style={({ pressed }) => [
                  styles.acao,
                  { backgroundColor: teleconsulta ? colors.accent : colors.actionGreen },
                  pressed && styles.acaoPressionada,
                ]}
              >
                <Text style={styles.acaoTexto} numberOfLines={1}>
                  Agendar
                </Text>
              </Pressable>
            </View>
          </View>

          <Feather
            name="chevron-right"
            size={20}
            color={colors.textSecondary}
            style={styles.chevron}
          />
        </View>
      </SurfaceCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressionado: { opacity: 0.9 },
  card: { padding: spacing.lg },
  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  meio: {
    flex: 1,
    marginLeft: spacing.lg,
    // Abre espaco para o chevron ancorado no topo direito.
    marginRight: spacing.lg,
  },
  nome: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.sectionTitle,
  },
  especialidade: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.accentGreenSoft,
    marginTop: 1,
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
  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  acao: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  acaoPressionada: { opacity: 0.85 },
  acaoTexto: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.onAccent,
  },
  chevron: {
    // Alinhado com a primeira linha do nome, como no mockup.
    marginTop: 2,
  },
});
