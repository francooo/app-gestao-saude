import { Children, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, spacing } from '@/theme';

type Props = { children: ReactNode; style?: ViewStyle };

/**
 * Agrupa linhas de ajuste num cartao, com filete entre elas.
 *
 * Existe por uma armadilha concreta, e nao por organizacao: TODA tela de
 * ajustes tem linha condicional. A versao ingenua — intercalar um filete a
 * cada filho — deixa dois filetes seguidos onde uma linha foi omitida, e um
 * filete sobrando no fim do cartao. Por isso o `filter(Boolean)` antes de
 * intercalar.
 */
export function SettingsGroup({ children, style }: Props) {
  const linhas = Children.toArray(children).filter(Boolean);

  return (
    <SurfaceCard flush style={{ ...styles.cartao, ...style }}>
      {linhas.map((linha, i) => (
        // O indice serve porque a lista e estatica dentro de cada tela: as
        // linhas nao sao reordenadas nem removidas em tempo de execucao.
        <View key={i}>
          {i > 0 ? <View style={styles.filete} /> : null}
          {linha}
        </View>
      ))}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  cartao: { paddingVertical: spacing.xs, overflow: 'hidden' },
  filete: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    // Comeca alinhado ao TEXTO, nao a borda: o filete separa informacao, e a
    // coluna de marcadores continua sendo uma coluna.
    marginLeft: spacing.lg + 44 + spacing.md,
    marginRight: spacing.lg,
  },
});
