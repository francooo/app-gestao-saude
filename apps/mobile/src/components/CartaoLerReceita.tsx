import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  onFotografar: () => void;
  onGaleria: () => void;
};

/**
 * Entrada "Ler receita com IA", na tela inicial.
 *
 * Primo visual do AssistantCard — mesmo gradiente ambar->verde, mesmo selo
 * translucido —, mas NAO e um Pressable so: tem duas acoes de verdade (camera e
 * galeria), e dois Pressable aninhados num terceiro brigariam pelo toque. Por
 * isso o cartao e uma View, e so os dois botoes recebem toque.
 *
 * Leva ao fluxo da RECEITA (a IA preenche o cadastro em lote), diferente do
 * "Fotografar caixinha" de dentro de Remedios, que so identifica o produto pela
 * embalagem. Os cinco chips sao os campos que a leitura extrai de verdade —
 * nenhum promete o que o fluxo nao entrega.
 */
export function CartaoLerReceita({ onFotografar, onGaleria }: Props) {
  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[colors.assistantGradientFrom, colors.assistantGradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradiente}
      >
        <View style={styles.cabecalho}>
          <View style={styles.selo}>
            <Feather name="camera" size={20} color={colors.onAccent} />
            <View style={styles.selo_ia}>
              <Text style={styles.selo_iaTexto}>IA</Text>
            </View>
          </View>
          <View style={styles.textos}>
            <Text style={styles.titulo}>Ler receita com IA</Text>
            <Text style={styles.subtitulo}>
              Tire uma foto e preencha os dados automaticamente
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onFotografar}
          accessibilityRole="button"
          accessibilityLabel="Fotografar receita"
          accessibilityHint="Abre a câmera e a IA preenche o cadastro"
          style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
        >
          <Feather name="camera" size={18} color={colors.accentGreen} />
          <Text style={styles.botaoTexto}>Fotografar receita</Text>
        </Pressable>

        <Pressable
          onPress={onGaleria}
          accessibilityRole="button"
          accessibilityLabel="Escolher da galeria"
          hitSlop={8}
          style={({ pressed }) => [styles.galeria, pressed && styles.pressionado]}
        >
          <Feather name="image" size={16} color={colors.onAccent} />
          <Text style={styles.galeriaTexto}>Escolher da galeria</Text>
        </Pressable>

        <View style={styles.chips}>
          {CHIPS.map((rotulo) => (
            <View key={rotulo} style={styles.chip}>
              <Feather name="check" size={12} color={colors.onAccent} />
              <Text style={styles.chipTexto}>{rotulo}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

/** Na ordem do mockup, e cada um e um campo que a leitura extrai de verdade. */
const CHIPS = ['Médico', 'Especialidade', 'Medicamentos', 'Quantidade', 'Data da consulta'];

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
  pressionado: { opacity: 0.9 },
  gradiente: { padding: spacing.xl },
  cabecalho: { flexDirection: 'row', alignItems: 'center' },
  selo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  selo_ia: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 22,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.onAccent,
  },
  selo_iaTexto: { fontFamily: fonts.extrabold, fontSize: 10, color: colors.onAccent },
  textos: { flex: 1 },
  titulo: { fontFamily: fonts.extrabold, fontSize: 19, color: colors.onAccent },
  subtitulo: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.onAccent,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  botaoTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.accentGreen },
  galeria: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  galeriaTexto: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.onAccent,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipTexto: { fontFamily: fonts.semibold, fontSize: 12, color: colors.onAccent },
});
