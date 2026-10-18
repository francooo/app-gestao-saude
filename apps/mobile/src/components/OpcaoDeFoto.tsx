import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { IconTile } from '@/components/IconTile';
import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';
import type { NomeIcone } from '@/components/Icone';

type Props = {
  icone: NomeIcone;
  ladrilho: { fundo: string; traco: string };
  titulo: string;
  descricao: string;
  desabilitado?: boolean;
  /** Entra no rotulo do leitor de tela. Sem ele, "desabilitado" nao explica nada. */
  motivoDesabilitado?: string;
  /**
   * Recurso fora do plano da conta.
   *
   * Diferente de `desabilitado`: o cartao CONTINUA tocavel, porque o toque
   * tem destino (a tela de assinatura, decidido por quem chama em `onPress`).
   * Um cartao morto nao explicaria nada; este troca a descricao pelo motivo e
   * o "Tirar foto" por um cadeado.
   */
  cadeado?: boolean;
  /** Texto do cadeado, no lugar da descricao. */
  motivoCadeado?: string;
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
  cadeado = false,
  motivoCadeado = 'Faz parte da assinatura',
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
        desabilitado
          ? motivoDesabilitado
          : cadeado
            ? `${motivoCadeado}. Abre a tela de assinatura.`
            : `${descricao}. Abre a escolha entre câmera e galeria.`
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
            <Text style={styles.descricao}>{cadeado ? motivoCadeado : descricao}</Text>
          </View>

          <View
            pointerEvents="none"
            style={[styles.botao, empilhado && styles.botaoLargo, cadeado && styles.botaoCadeado]}
          >
            <Feather
              name={cadeado ? 'lock' : 'camera'}
              size={16}
              color={cadeado ? colors.accentGreen : colors.onAccent}
            />
            <Text style={[styles.botaoTexto, cadeado && styles.botaoCadeadoTexto]}>
              {cadeado ? 'Assinatura' : 'Tirar foto'}
            </Text>
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

  // Centrado como no mockup: o botao fica no meio da altura do cartao, nao
  // grudado no topo quando a descricao quebra em duas linhas.
  linha: { flexDirection: 'row', alignItems: 'center' },
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
  // Contornado verde, e nao ambar: ambar e "tem coisa para fazer agora", e um
  // recurso fora do plano nao e pendencia.
  botaoCadeado: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
  },
  botaoCadeadoTexto: { color: colors.accentGreen },
});
