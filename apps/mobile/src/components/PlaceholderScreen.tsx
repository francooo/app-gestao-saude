import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, spacing } from '@/theme';

type Props = {
  icone: keyof typeof Feather.glyphMap;
  titulo: string;
  descricao: string;
  children?: ReactNode;
};

/** Altura da barra de abas flutuante, para o conteudo nao ficar embaixo dela. */
const ESPACO_BARRA = 96;

/**
 * Tela ainda nao construida. Diz o que virá ali, em vez de mostrar uma tela
 * vazia que parece defeito.
 */
export function PlaceholderScreen({ icone, titulo, descricao, children }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.tela}>
      <LinearGradient
        colors={[colors.homeBackgroundTop, colors.homeBackgroundBottom]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: ESPACO_BARRA + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SurfaceCard style={styles.card}>
          <View style={styles.selo}>
            <Feather name={icone} size={30} color={colors.accentGreen} />
          </View>
          <Text style={styles.titulo} accessibilityRole="header">
            {titulo}
          </Text>
          <Text style={styles.descricao}>{descricao}</Text>
        </SurfaceCard>

        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.homeBackgroundTop },
  conteudo: { paddingHorizontal: spacing.xl },
  card: { alignItems: 'center' },
  selo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  titulo: {
    fontFamily: fonts.extrabold,
    fontSize: 21,
    color: colors.sectionTitle,
    textAlign: 'center',
  },
  descricao: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
