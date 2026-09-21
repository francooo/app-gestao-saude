import { Feather } from '@expo/vector-icons';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  ligado: boolean;
  onChange: (valor: boolean) => void;
  /** Some enquanto a preferencia ainda esta sendo lida do aparelho. */
  carregando?: boolean;
};

/**
 * Liga e desliga os avisos de dose.
 *
 * O interruptor e o `Switch` NATIVO do React Native, e nao um desenhado a mao:
 * ele ja vem com o papel de acessibilidade e o anuncio de estado corretos, o
 * que num aplicativo de medicamento nao e enfeite.
 *
 * O rotulo diz "neste aparelho" porque e a verdade: nao ha coluna no banco
 * para isso, a preferencia mora no proprio celular, e outro aparelho da mesma
 * conta tem a sua.
 */
export function ReminderCard({ ligado, onChange, carregando = false }: Props) {
  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.ladrilho}>
        <Feather name="bell" size={20} color={colors.pillTabletIcon} />
      </View>

      <View style={styles.textos}>
        <Text style={styles.titulo}>Lembretes</Text>
        <Text style={styles.descricao}>Avisar neste aparelho nos horários das doses</Text>
      </View>

      <Switch
        value={ligado}
        onValueChange={onChange}
        disabled={carregando}
        trackColor={{ true: colors.switchOn, false: colors.starEmpty }}
        thumbColor={colors.surface}
        // No Android o trilho desligado fica quase invisivel sem isto.
        ios_backgroundColor={colors.starEmpty}
        accessibilityLabel="Lembretes das doses neste aparelho"
      />
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  ladrilho: {
    width: 44,
    height: 44,
    borderRadius: radii.card - 14,
    backgroundColor: colors.pillTablet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { flex: 1 },
  titulo: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.sectionTitle,
  },
  descricao: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
