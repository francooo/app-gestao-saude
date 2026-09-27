import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconTile, LADRILHO_ATENCAO, LADRILHO_NEUTRO } from '@/components/IconTile';
import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';

type Acao = { rotulo: string; onPress: () => void };

type Props = {
  /**
   * `atencao` e ambar; `neutro` nao.
   *
   * A REGRA E: ambar so quando existe acao possivel AGORA. Por isso o limite
   * diario e neutro — amanha libera, e nao ha o que fazer hoje. Ambar
   * significa "tem coisa para fazer" em todo o aplicativo, e gasta-lo num
   * aviso sem saida ensina a ignorar o ambar.
   */
  tom: 'atencao' | 'neutro';
  icone: keyof typeof Feather.glyphMap;
  titulo: string;
  texto: string;
  /** Lista com visto verde, no padrao da tela de privacidade. */
  dicas?: string[];
  acaoPrincipal?: Acao & { estilo: 'preenchido' | 'contorno' };
  acaoSecundaria?: Acao;
};

/**
 * O bloco que explica por que a leitura nao aconteceu, e o que fazer.
 *
 * Cinco usos so na tela de leitura — nao achou, limite do dia, IA ocupada,
 * falha de rede e politica desatualizada. E a justificativa mais forte de
 * componente desta entrega.
 */
export function BlocoDeAviso({
  tom,
  icone,
  titulo,
  texto,
  dicas,
  acaoPrincipal,
  acaoSecundaria,
}: Props) {
  return (
    <SurfaceCard style={styles.cartao}>
      {/* live region: sem isto, quem usa leitor de tela dispara a leitura e
          nao fica sabendo que ela terminou nem por que falhou. */}
      <View style={styles.cabecalho} accessible accessibilityLiveRegion="polite">
        <IconTile
          size={44}
          icone={icone}
          {...(tom === 'atencao' ? LADRILHO_ATENCAO : LADRILHO_NEUTRO)}
        />
        <View style={styles.textos}>
          <Text style={styles.titulo}>{titulo}</Text>
          <Text style={styles.texto}>{texto}</Text>
        </View>
      </View>

      {dicas?.length ? (
        <View style={styles.dicas}>
          {dicas.map((d) => (
            <View key={d} style={styles.dica}>
              <Feather name="check" size={16} color={colors.accentGreen} />
              <Text style={styles.dicaTexto}>{d}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {acaoPrincipal ? (
        <Pressable
          onPress={acaoPrincipal.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.acao,
            acaoPrincipal.estilo === 'preenchido' ? styles.preenchido : styles.contorno,
            pressed && styles.pressionado,
          ]}
        >
          <Text
            style={[
              styles.acaoTexto,
              acaoPrincipal.estilo === 'preenchido' ? styles.textoPreenchido : styles.textoContorno,
            ]}
          >
            {acaoPrincipal.rotulo}
          </Text>
        </Pressable>
      ) : null}

      {acaoSecundaria ? (
        <Pressable
          onPress={acaoSecundaria.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secundaria, pressed && styles.pressionado]}
        >
          <Text style={styles.secundariaTexto}>{acaoSecundaria.rotulo}</Text>
        </Pressable>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  cartao: { padding: spacing.lg, marginTop: spacing.md },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start' },
  textos: { flex: 1, marginLeft: spacing.md },
  titulo: { fontFamily: fonts.bold, fontSize: 16, color: colors.sectionTitle },
  texto: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  dicas: { marginTop: spacing.md, gap: spacing.sm },
  dica: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dicaTexto: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },

  acao: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    // minHeight e nao height: com fonte grande do sistema o rotulo cortaria.
    minHeight: 48,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  preenchido: { backgroundColor: colors.accent },
  contorno: { borderWidth: 1.5, borderColor: colors.accentGreen },
  acaoTexto: { fontFamily: fonts.bold, fontSize: 15 },
  textoPreenchido: { color: colors.onAccent },
  textoContorno: { color: colors.accentGreen },

  secundaria: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  secundariaTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen },
  pressionado: { opacity: 0.85 },
});
