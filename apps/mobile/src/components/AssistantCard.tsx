import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icone, ICONES } from '@/components/Icone';
import { SeloDeAssinatura } from '@/components/SeloDeAssinatura';
import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  onPress: () => void;
  /** Fora do plano: mostra o selo. O destino do toque e de quem usa o cartao. */
  bloqueado?: boolean;
};

/**
 * Entrada do Assistente de Saude, na tela inicial.
 *
 * O bloqueio que este comentario registrava foi RESOLVIDO: a decisao de
 * produto que faltava era o escopo, e ele ficou estreito de proposito — o
 * assistente responde sobre os dados que a familia cadastrou (quais remedios,
 * que horas e a proxima dose, quando e a consulta) e recusa indicar remedio,
 * dose ou diagnostico. O texto de sistema esta em
 * apps/api/src/lib/assistente-prompt.ts, com o comportamento medido.
 *
 * O campo aqui continua ILUSTRATIVO: quem toca vai para a aba, onde ha um
 * campo de verdade. Dois campos que aceitam digitacao, um dentro do outro,
 * seria pior que um so.
 */
export function AssistantCard({ onPress, bloqueado = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        bloqueado
          ? 'Assistente de Saúde. Faz parte da assinatura.'
          : 'Assistente de Saúde. Abre a conversa.'
      }
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
            <Icone nome={ICONES.brilho} size={22} color={colors.onAccent} />
          </View>
          <View style={styles.textos}>
            <Text style={styles.titulo}>Assistente de Saúde</Text>
            <Text style={styles.subtitulo}>Tire dúvidas sobre remédios e consultas</Text>
            {bloqueado ? <SeloDeAssinatura style={styles.seloAssinatura} /> : null}
          </View>
        </View>

        {/* Campo apenas ilustrativo — nao e um TextInput de proposito. */}
        <View style={styles.campo}>
          <Text style={styles.placeholder} numberOfLines={1}>
            Ex.: quando é a próxima dose do Lucas?
          </Text>
          <View style={styles.enviar}>
            <Feather name={bloqueado ? 'lock' : 'send'} size={18} color={colors.onAccent} />
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
  seloAssinatura: { marginTop: spacing.sm },
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
  // Quadrado de cantos arredondados, nao circulo, como no mockup.
  enviar: {
    width: 44,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.accentGreenBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
