import { Children, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, spacing } from '@/theme';

type Props = { children: ReactNode; style?: ViewStyle };

/**
 * Agrupa linhas num cartao, com filete entre elas.
 *
 * Existe por uma armadilha concreta, e nao por organizacao: TODA tela que usa
 * isto tem linha condicional. A versao ingenua — intercalar um filete a cada
 * filho — deixa dois filetes seguidos onde uma linha foi omitida, e um filete
 * sobrando no fim do cartao. Por isso o `filter(Boolean)` antes de intercalar.
 *
 * A KEY VEM DO FILHO, e isso deixou de ser detalhe. Enquanto so as telas de
 * Ajustes usavam este componente, as listas eram estaticas e o indice servia.
 * A tela de Notificacoes mudou a premissa: os itens somem quando a dose e
 * registrada e trocam de grupo a meia-noite. Com o indice, o envolucro que
 * carrega o filete fica preso a posicao, e um item que sai do MEIO faz o
 * filete piscar no lugar errado.
 */
export function SettingsGroup({ children, style }: Props) {
  const linhas = Children.toArray(children).filter(Boolean);

  return (
    <SurfaceCard flush style={{ ...styles.cartao, ...style }}>
      {linhas.map((linha, i) => (
        <View key={chaveDe(linha, i)}>
          {i > 0 ? <View style={styles.filete} /> : null}
          {linha}
        </View>
      ))}
    </SurfaceCard>
  );
}

/**
 * A key do proprio filho, com o indice so de reserva.
 *
 * Reserva porque um filho pode legitimamente nao ter key — um `<View>` solto
 * de esqueleto de carga, por exemplo. Nesse caso a lista e estatica de novo e
 * o indice volta a servir.
 */
function chaveDe(filho: ReactNode, i: number): string | number {
  const key = (filho as { key?: string | null } | null)?.key;
  return key ?? i;
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
