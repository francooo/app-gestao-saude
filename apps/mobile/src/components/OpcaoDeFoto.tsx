import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { IconTile } from '@/components/IconTile';
import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  icone: keyof typeof Feather.glyphMap;
  ladrilho: { fundo: string; traco: string };
  titulo: string;
  descricao: string;
  desabilitado?: boolean;
  /** Entra no rotulo do leitor de tela. Sem ele, "desabilitado" nao explica nada. */
  motivoDesabilitado?: string;
  onPress: () => void;
};

/**
 * Um dos dois caminhos de foto: receita ou caixinha.
 *
 * Componente proprio para duas instancias porque o que se repetiria nao e o
 * desenho e sim o comportamento: o reflow por fonte grande, o estado
 * desabilitado com motivo, e o agrupamento de acessibilidade.
 *
 * O CARTAO INTEIRO E O ALVO, e o botao ambar leva `pointerEvents="none"` — o
 * mesmo truque ja documentado no SettingsRow para o Switch. Sem isso o leitor
 * de tela para duas vezes na mesma linha, e o dedo erra o botaozinho.
 */
export function OpcaoDeFoto({
  icone,
  ladrilho,
  titulo,
  descricao,
  desabilitado = false,
  motivoDesabilitado,
  onPress,
}: Props) {
  /**
   * Com fonte grande do sistema a linha vira coluna.
   *
   * Em 390 pt de largura, o ladrilho e o botao deixam menos de 100 pt para o
   * texto; a 1,3x, "Fotografar receita" quebraria em tres linhas espremidas.
   * Empilhar e o que o PrescriptionCard ja faz no estado vazio.
   */
  const { fontScale } = useWindowDimensions();
  const empilhado = fontScale >= 1.3;

  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessible
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityHint={
        desabilitado ? motivoDesabilitado : `${descricao}. Abre a escolha entre câmera e galeria.`
      }
      accessibilityState={{ disabled: desabilitado }}
      style={({ pressed }) => [pressed && !desabilitado && styles.pressionado]}
    >
      {/* O SurfaceCard aceita UM objeto de estilo, nao lista. */}
      <SurfaceCard style={StyleSheet.flatten([styles.cartao, desabilitado && styles.desabilitado])}>
        <View style={[styles.linha, empilhado && styles.coluna]}>
          <IconTile size={44} icone={icone} {...ladrilho} />

          <View style={[styles.textos, empilhado && styles.textosEmpilhados]}>
            <Text style={styles.titulo}>{titulo}</Text>
            <Text style={styles.descricao}>{descricao}</Text>
          </View>

          <View
            pointerEvents="none"
            style={[styles.botao, empilhado && styles.botaoLargo]}
          >
            <Feather name="camera" size={16} color={colors.onAccent} />
            <Text style={styles.botaoTexto}>Tirar foto</Text>
          </View>
        </View>
      </SurfaceCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // padding lg e nao o xl padrao do SurfaceCard: com 24 de cada lado sobram
  // 294 pt num aparelho de 390, e ladrilho + texto + botao nao cabem.
  cartao: { padding: spacing.lg, marginTop: spacing.md },
  desabilitado: { opacity: 0.55 },
  pressionado: { opacity: 0.85 },

  linha: { flexDirection: 'row', alignItems: 'flex-start' },
  coluna: { flexDirection: 'column', alignItems: 'stretch' },

  textos: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  textosEmpilhados: { marginLeft: 0, marginRight: 0, marginTop: spacing.md },

  titulo: { fontFamily: fonts.bold, fontSize: 16, color: colors.sectionTitle },
  descricao: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },

  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    // minHeight, nunca height: com fonte grande o rotulo cortaria.
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  botaoLargo: { marginTop: spacing.md },
  botaoTexto: { fontFamily: fonts.bold, fontSize: 14, color: colors.onAccent },
});
