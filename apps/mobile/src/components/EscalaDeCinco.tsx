import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/theme';

type Props = {
  value: number | null;
  onChange: (v: number) => void;
  /** Os cinco degraus, do 1 ao 5. Mudam por tipo de sintoma. */
  rotulos: readonly [string, string, string, string, string];
  /** Rotulo do grupo: "Intensidade", "Como está o humor", "Como foi o sono". */
  nomeDoGrupo: string;
};

const DEGRAUS = [1, 2, 3, 4, 5] as const;

/**
 * Escala ordinal de cinco degraus.
 *
 * UM USO HOJE, e a justificativa e complexidade, nao repeticao: papel de grupo
 * de radio, rotulo por degrau que muda conforme o tipo, alvo de toque de 44 pt
 * e altura que nao pula quando o texto troca. Inline, seriam as linhas mais
 * dificeis de achar numa tela longa. O diario de medicoes herda.
 *
 * PREENCHIMENTO CUMULATIVO, como o StarRating: 1 ate o valor ficam cheios. Uma
 * bolinha sozinha na posicao 3 seria ambigua — e "3" ou "a terceira opcao"?
 */
export function EscalaDeCinco({ value, onChange, rotulos, nomeDoGrupo }: Props) {
  return (
    <View style={styles.bloco}>
      <Text style={styles.rotulo}>{nomeDoGrupo}</Text>

      <View style={styles.fila} accessibilityRole="radiogroup" accessibilityLabel={nomeDoGrupo}>
        {DEGRAUS.map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            // 22 de bolinha + 11 de hitSlop de cada lado = 44, o piso de alvo
            // de toque. O StarRating usa 6 e entrega 30, abaixo do minimo —
            // nao copiar aquele numero.
            hitSlop={11}
            accessibilityRole="radio"
            accessibilityLabel={`${n} de 5, ${rotulos[n - 1]}`}
            accessibilityState={{ checked: n === value }}
          >
            <View style={[styles.bolinha, value != null && n <= value && styles.cheia]} />
          </Pressable>
        ))}
      </View>

      {/* Sempre renderizado: sem isto a altura do bloco pula quando a pessoa
          escolhe o primeiro degrau, e o resto do formulario salta junto. */}
      <Text style={[styles.grau, value == null && styles.grauVazio]}>
        {value == null ? 'Toque para escolher' : rotulos[value - 1]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: { marginBottom: spacing.lg },
  // Mesmas medidas do `label` do FormField: os dois aparecem no mesmo cartao.
  rotulo: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.sectionTitle,
    marginBottom: spacing.sm,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bolinha: {
    width: 22,
    height: 22,
    borderRadius: 11,
    // `starEmpty` ja significa "degrau nao atingido" neste aplicativo.
    backgroundColor: colors.starEmpty,
  },
  // Verde, e nao o ambar do StarRating: la e uma estrela literal de avaliacao;
  // aqui ambar significaria "tem coisa para fazer", que nao e o caso.
  cheia: { backgroundColor: colors.accentGreen },
  grau: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.sectionTitle,
    marginTop: spacing.sm,
  },
  grauVazio: { fontFamily: fonts.regular, color: colors.textPlaceholder },
});
