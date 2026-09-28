import { StyleSheet, Text, View } from 'react-native';

import type { Barra } from '@/lib/diarioDeSintomas';
import { colors, fonts, spacing } from '@/theme';

type Props = {
  barras: Barra[];
  /** O topo da escala. Cinco, hoje. */
  maximo: number;
  titulo: string;
  legenda: string;
  /** A serie inteira em palavras, para o leitor de tela. */
  descricaoAcessivel: string;
};

/**
 * Gráfico de barras desenhado com `View` puro.
 *
 * SEM BIBLIOTECA, e a razao nao e preferencia: nao ha nada de desenho vetorial
 * neste projeto, e `react-native-svg` e modulo nativo — entrar com ele
 * obrigaria a subir a versao e gerar um APK novo, instalado a mao. O
 * precedente esta escrito no DateTimePickerCard, que escolheu um calendario em
 * JavaScript puro pelo mesmo motivo: assim a tela chega por OTA.
 */
const ALTURA = 96;

export function GraficoDeBarras({ barras, maximo, titulo, legenda, descricaoAcessivel }: Props) {
  return (
    <View
      // UM no de acessibilidade, nao sete Views vazias para o leitor caminhar.
      accessible
      accessibilityRole="image"
      accessibilityLabel={descricaoAcessivel}
    >
      <Text style={styles.titulo}>{titulo}</Text>

      <View style={styles.colunas} importantForAccessibility="no-hide-descendants">
        {barras.map((b) => (
          <View key={b.chave} style={styles.coluna}>
            <View style={[styles.trilho, b.valor == null && styles.trilhoVazio]}>
              {b.valor != null ? (
                <View
                  style={[
                    styles.barra,
                    b.hoje && styles.barraDeHoje,
                    // Proporcao pura, sem piso artificial: numa escala de 1 a 5
                    // o menor valor ja da 19 pt num trilho de 96, visivel de
                    // sobra. O Math.max so protege outra escala futura.
                    { height: Math.max(4, Math.round((b.valor / maximo) * ALTURA)) },
                  ]}
                />
              ) : null}
            </View>
            <Text
              style={[styles.dia, b.hoje && styles.diaDeHoje]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {b.rotulo}
            </Text>
          </View>
        ))}
      </View>

      {/* A legenda nao e enfeite: sem ela, ninguem sabe o que a barra resume
          quando houve mais de um registro no dia, nem para que lado a escala
          aponta — e a direcao se inverte entre os tipos. */}
      <Text style={styles.legenda}>{legenda}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: { fontFamily: fonts.bold, fontSize: 15, color: colors.sectionTitle },
  colunas: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  coluna: { flex: 1, alignItems: 'center' },
  trilho: {
    width: '100%',
    maxWidth: 26,
    height: ALTURA,
    justifyContent: 'flex-end',
    borderRadius: 6,
    overflow: 'hidden',
  },
  // Dia sem registro nao some: o trilho vazio diz "nao anotei nesse dia", que
  // e informacao, e nao um buraco na sequencia.
  trilhoVazio: { backgroundColor: colors.divider },
  barra: { width: '100%', backgroundColor: colors.pillTabletIcon, borderRadius: 6 },
  // O mesmo verde com que o calendario ja marca o dia de hoje.
  barraDeHoje: { backgroundColor: colors.accentGreen },
  dia: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  diaDeHoje: { fontFamily: fonts.bold, color: colors.sectionTitle },
  legenda: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});
