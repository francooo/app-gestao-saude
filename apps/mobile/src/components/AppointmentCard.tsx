import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';

export type Appointment = {
  id: string;
  medico: string;
  especialidade: string;
  /** Ex.: "23 jun" */
  data: string;
  /** Ex.: "09:00" */
  hora: string;
  /** Ex.: "Consulta presencial · Clínica Vida" */
  local: string;
};

type Props = {
  consulta: Appointment;
  onPress?: () => void;
};

export function AppointmentCard({ consulta, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${consulta.medico}, ${consulta.especialidade}, ${consulta.data} às ${consulta.hora}. ${consulta.local}.`}
      style={({ pressed }) => (pressed && onPress ? styles.pressionado : undefined)}
    >
      <SurfaceCard style={styles.card}>
        <View style={styles.conteudo}>
          {/* Com dados reais, aqui pode entrar a foto do profissional; as
              iniciais funcionam como estado inicial e como alternativa. */}
          <Avatar nome={consulta.medico} size={56} />

          <View style={styles.textos}>
            <Text style={styles.medico} numberOfLines={1}>
              {consulta.medico}
            </Text>
            <Text style={styles.especialidade} numberOfLines={1}>
              {consulta.especialidade}
            </Text>

            <View style={styles.selos}>
              <View style={styles.selo}>
                <Feather name="calendar" size={13} color={colors.accentGreen} />
                <Text style={styles.seloTexto}>{consulta.data}</Text>
              </View>
              <View style={styles.selo}>
                <Feather name="clock" size={13} color={colors.accentGreen} />
                <Text style={styles.seloTexto}>{consulta.hora}</Text>
              </View>
            </View>

            <View style={styles.linhaLocal}>
              <Feather name="map-pin" size={13} color={colors.textSecondary} />
              <Text style={styles.local} numberOfLines={2}>
                {consulta.local}
              </Text>
            </View>
          </View>

          {onPress ? (
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          ) : null}
        </View>
      </SurfaceCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressionado: { opacity: 0.85 },
  card: { padding: spacing.lg },
  conteudo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textos: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  medico: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.sectionTitle,
  },
  especialidade: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.accentGreenSoft,
    marginTop: 2,
  },
  selos: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  selo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  seloTexto: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.sectionTitle,
  },
  linhaLocal: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  local: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
