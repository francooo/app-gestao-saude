import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/theme';

const ilustracao = require('../../assets/images/header-mother-baby.png');

type Props = {
  titulo: string;
  subtitulo: string;
};

/**
 * Faixa de boas-vindas no topo da home.
 *
 * A ilustracao sangra pela direita e e fundida ao creme do card por um
 * gradiente horizontal. O recorte veio do asset do splash e tem fundo verde
 * proprio; sem essa transicao, apareceria uma borda reta de verde contra o
 * creme, que e exatamente o que o mockup evita com uma silhueta organica.
 */
export function HomeHeaderCard({ titulo, subtitulo }: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.ilustracaoArea} pointerEvents="none">
        <Image source={ilustracao} contentFit="cover" style={StyleSheet.absoluteFill} />
        {/* Funde a esquerda da imagem no creme do card. */}
        <LinearGradient
          colors={[colors.surface, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.fadeHorizontal}
        />
        {/* Funde a base, onde comeca a lista de membros. */}
        <LinearGradient
          colors={['transparent', colors.surface]}
          style={styles.fadeVertical}
        />
      </View>

      <View style={styles.texto}>
        <Text style={styles.titulo} accessibilityRole="header">
          {titulo}
        </Text>
        <Text style={styles.subtitulo}>{subtitulo}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    minHeight: 150,
    justifyContent: 'center',
  },
  ilustracaoArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    // Metade do card: deixa espaco confortavel para o titulo em duas linhas.
    width: '52%',
  },
  fadeHorizontal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '55%',
  },
  fadeVertical: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '35%',
  },
  texto: {
    // Sem isto o titulo passaria por baixo da ilustracao.
    maxWidth: '62%',
  },
  titulo: {
    fontFamily: fonts.extrabold,
    fontSize: 27,
    lineHeight: 33,
    letterSpacing: -0.3,
    color: colors.sectionTitle,
  },
  subtitulo: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
