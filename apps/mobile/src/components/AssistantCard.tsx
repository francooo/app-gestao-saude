import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  onPress: () => void;
};

/**
 * Entrada do Assistente de Saude.
 *
 * DELIBERADAMENTE NAO FUNCIONAL nesta versao. O campo e um botao disfarcado:
 * nao aceita digitacao e o toque em qualquer parte do card leva ao mesmo
 * aviso de "em breve".
 *
 * O motivo e de produto, nao de prazo. O placeholder do mockup ("qual remedio
 * posso dar para febre?") pede indicacao de medicamento e dose a um leigo —
 * a decisao de maior risco do aplicativo. Ela precisa ser tomada de proposito,
 * com as protecoes definidas, e nao herdada de uma tela de layout.
 */
export function AssistantCard({ onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Assistente de Saúde. Em breve."
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressionado]}
    >
      <LinearGradient
        colors={[colors.assistantGradientFrom, colors.assistantGradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradiente}
      >
        <View style={styles.cabecalho}>
          <View style={styles.selo}>
            <Feather name="zap" size={20} color={colors.onAccent} />
          </View>
          <View style={styles.textos}>
            <Text style={styles.titulo}>Assistente de Saúde</Text>
            <Text style={styles.subtitulo}>Em breve neste aplicativo</Text>
          </View>
        </View>

        {/* Campo apenas ilustrativo — nao e um TextInput de proposito. */}
        <View style={styles.campo}>
          <Text style={styles.placeholder} numberOfLines={1}>
            Ex.: qual remédio posso dar para febre?
          </Text>
          <View style={styles.enviar}>
            <Feather name="send" size={18} color={colors.onAccent} />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radii.card,
    overflow: 'hidden',
    shadowColor: '#2C3520',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 3,
  },
  pressionado: {
    opacity: 0.9,
  },
  gradiente: {
    padding: spacing.xl,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  textos: {
    flex: 1,
  },
  titulo: {
    fontFamily: fonts.extrabold,
    fontSize: 19,
    color: colors.onAccent,
  },
  subtitulo: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.onAccent,
    borderRadius: radii.pill,
    paddingLeft: spacing.xl,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    marginTop: spacing.xl,
  },
  placeholder: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textPlaceholder,
    marginRight: spacing.sm,
  },
  enviar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
