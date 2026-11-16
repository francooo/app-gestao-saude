import type { SerieDoGrafico } from '@gestao/shared/lib/medicoes';
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { colors, fonts, spacing } from '@/theme';

const ALTURA = 170;
/** Espaco para os rotulos do eixo Y, a esquerda da area do grafico. */
const EIXO_Y = 34;
const PONTO = 9;
/** Uma cor por serie: sistolica e diastolica na pressao, uma so nos outros. */
const CORES = [colors.accentGreen, colors.terracotta];

/**
 * O grafico de uma medicao ao longo do periodo, feito de Views.
 *
 * SEM react-native-svg DE PROPOSITO (mesma regra do GraficoDeBarras): um
 * modulo nativo novo pediria versao nova e APK instalado a mao, e esta tela
 * chega pela atualizacao pelo ar sobre o 0.3.0.
 *
 * Sem linha ligando os pontos: uma linha diagonal exigiria girar Views, o que
 * fica fragil entre aparelhos. Na pressao, cada medicao e um traco vertical
 * da diastolica ate a sistolica — e a leitura que o medico faz de uma
 * pressao, os dois numeros juntos.
 *
 * REFERENCIA SEM VEREDITO: a faixa usual e um fundo claro e as referencias
 * sao linhas tracejadas, com a fonte na legenda. Nenhum ponto muda de cor por
 * estar fora da faixa.
 *
 * Para o leitor de tela, e UMA imagem com a serie descrita em palavras.
 */
export function GraficoDeMedicoes({ serie, descricao }: { serie: SerieDoGrafico; descricao: string }) {
  const [largura, setLargura] = useState(0);
  const { tipo, pontos } = serie;

  const area = Math.max(0, largura - EIXO_Y - PONTO / 2);
  const px = (x: number) => EIXO_Y + x * area;
  /** Distancia a partir de baixo da area. */
  const py = (v: number) => serie.y(v) * ALTURA;

  const marcasY = Array.from(
    new Set([serie.min, serie.max, ...tipo.linhas.map((l) => l.valor), ...tipo.faixas.flatMap((f) => [f.de, f.ate])]),
  ).filter((v) => v >= serie.min && v <= serie.max);

  const pressao = serie.series.length > 1;

  return (
    <View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={descricao}
        onLayout={(e: LayoutChangeEvent) => setLargura(Math.floor(e.nativeEvent.layout.width))}
        style={styles.caixa}
      >
        {largura > 0 ? (
          <>
            {tipo.faixas.map((f) => {
              const de = Math.max(f.de, serie.min);
              const ate = Math.min(f.ate, serie.max);
              if (ate <= de) return null;
              return (
                <View
                  key={f.rotulo}
                  style={[styles.faixa, { left: EIXO_Y, right: 0, bottom: py(de), height: py(ate) - py(de) }]}
                />
              );
            })}

            {marcasY.map((v) => (
              <View key={`g${v}`} style={[styles.grade, { left: EIXO_Y, right: 0, bottom: py(v) }]} />
            ))}

            {tipo.linhas.map((l) =>
              l.valor >= serie.min && l.valor <= serie.max ? (
                <View key={l.rotulo} style={[styles.referencia, { left: EIXO_Y, right: 0, bottom: py(l.valor) }]} />
              ) : null,
            )}

            {marcasY.map((v) => (
              <Text key={`r${v}`} style={[styles.rotuloY, { bottom: py(v) - 7 }]}>
                {String(v).replace('.', ',')}
              </Text>
            ))}

            {pressao
              ? pontos.map((p) => {
                  const alto = py(p.valores[0]!);
                  const baixo = py(p.valores[1]!);
                  return (
                    <View
                      key={`t${p.id}`}
                      style={[styles.traco, { left: px(p.x) - 1, bottom: baixo, height: Math.max(0, alto - baixo) }]}
                    />
                  );
                })
              : null}

            {pontos.flatMap((p) =>
              p.valores.map((v, s) => (
                <View
                  key={`${p.id}-${s}`}
                  style={[
                    styles.ponto,
                    { backgroundColor: CORES[s] ?? CORES[0], left: px(p.x) - PONTO / 2, bottom: py(v) - PONTO / 2 },
                  ]}
                />
              )),
            )}
          </>
        ) : null}
      </View>

      <View style={[styles.eixoX, { marginLeft: EIXO_Y }]}>
        {serie.marcas.map((m) => (
          <Text key={m.x} style={styles.rotuloX}>
            {m.rotulo}
          </Text>
        ))}
      </View>

      <View style={styles.legenda}>
        {pressao ? (
          <View style={styles.series}>
            {serie.series.map((nome, s) => (
              <View key={nome} style={styles.serie}>
                <View style={[styles.amostra, { backgroundColor: CORES[s] }]} />
                <Text style={styles.legendaTexto}>{nome}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {tipo.faixas.length ? (
          <View style={styles.serie}>
            <View style={[styles.amostra, styles.amostraFaixa]} />
            <Text style={styles.legendaTexto}>Faixa usual: {tipo.faixas.map((f) => f.rotulo).join('; ')}</Text>
          </View>
        ) : null}
        {tipo.linhas.length ? (
          <View style={styles.serie}>
            <View style={styles.amostraLinha} />
            <Text style={styles.legendaTexto}>
              Linha de referência: {tipo.linhas.map((l) => l.rotulo).join(' e ')}
            </Text>
          </View>
        ) : null}
        {tipo.fonte ? <Text style={styles.fonte}>{tipo.fonte}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { height: ALTURA, marginTop: spacing.sm, marginBottom: spacing.xs },
  faixa: { position: 'absolute', backgroundColor: 'rgba(62, 118, 91, 0.12)' },
  grade: { position: 'absolute', height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
  referencia: {
    position: 'absolute',
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textSecondary,
    opacity: 0.7,
  },
  rotuloY: {
    position: 'absolute',
    left: 0,
    width: EIXO_Y - 6,
    textAlign: 'right',
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  traco: { position: 'absolute', width: 2, borderRadius: 1, backgroundColor: colors.divider },
  ponto: {
    position: 'absolute',
    width: PONTO,
    height: PONTO,
    borderRadius: PONTO / 2,
    borderWidth: 1.5,
    borderColor: colors.onAccent,
  },
  eixoX: { flexDirection: 'row', justifyContent: 'space-between' },
  rotuloX: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textSecondary },
  legenda: { marginTop: spacing.md, gap: spacing.xs },
  series: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  serie: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amostra: { width: 11, height: 11, borderRadius: 6 },
  amostraFaixa: { borderRadius: 3, backgroundColor: 'rgba(62, 118, 91, 0.2)' },
  amostraLinha: {
    width: 16,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.textSecondary,
  },
  legendaTexto: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  fonte: { fontFamily: fonts.regular, fontStyle: 'italic', fontSize: 12, lineHeight: 17, color: colors.textSecondary },
});
