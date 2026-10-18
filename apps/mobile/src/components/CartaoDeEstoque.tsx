import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Medication, Stock, StockEntry } from '@/api/health';
import { ICONES, Icone } from '@/components/Icone';
import { IconTile, LADRILHO_POR_FORMA } from '@/components/IconTile';
import { SurfaceCard } from '@/components/SurfaceCard';
import {
  dataDeTermino,
  diaPorExtenso,
  estoqueBaixo,
  nivel,
  quantidadeDoEstoque,
  validadeCurta,
  validadeProxima,
} from '@/lib/estoque';
import { diaCurto, formaVisual, tituloDoMedicamento } from '@/lib/posologia';
import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  medicamento: Medication;
  /** Separado do medicamento para o tipo garantir que nao e nulo aqui. */
  estoque: Stock;
  agora: Date;
  /** Sem perfil escolhido, o nome da pessoa diz de quem e o remedio. */
  mostrarPerfil?: boolean;
  aberto: boolean;
  onAlternar: () => void;
  /**
   * As compras, que so o DETALHE do remedio traz. null = ainda carregando.
   * A tela busca ao abrir: baixar o detalhe de todos de uma vez, para a maioria
   * nunca ser aberta, seria desperdicio.
   */
  compras: StockEntry[] | null;
  erroCompras?: string | null;
  onTentarCompras: () => void;
  /** Id da compra sendo removida, para o indicador. */
  removendo: string | null;
  onRemoverCompra: (entrada: StockEntry) => void;
  onRegistrarCompra: () => void;
};

/**
 * Um remedio na tela de Estoque.
 *
 * A barra mede o que sobrou contra a ULTIMA compra, e nao contra o total ja
 * comprado: depois de um ano de caixas, o total faria toda barra parecer vazia.
 * Comprar mais que uma caixa de uma vez deixa a barra cheia — por isso o teto 1.
 */
export function CartaoDeEstoque({
  medicamento: m,
  estoque,
  agora,
  mostrarPerfil = false,
  aberto,
  onAlternar,
  compras,
  erroCompras,
  onTentarCompras,
  removendo,
  onRemoverCompra,
  onRegistrarCompra,
}: Props) {
  const forma = LADRILHO_POR_FORMA[formaVisual(m.form)];
  const titulo = tituloDoMedicamento(m);
  const baixo = estoqueBaixo(m, estoque);
  const vencendo = validadeProxima(estoque, agora);
  const termino = dataDeTermino(m, estoque, agora);
  const restante = quantidadeDoEstoque(estoque.remaining, m.form);

  // Ambar = "tem coisa para fazer", como em todo o aplicativo.
  const corDoNivel = baixo ? colors.accent : colors.accentGreen;

  const previsao =
    estoque.remaining <= 0
      ? 'Estoque esgotado'
      : termino
        ? `Acaba por volta de ${diaPorExtenso(termino, agora)}`
        : 'Uso se necessário: sem previsão';

  const quem = mostrarPerfil && m.profileName ? m.profileName.split(' ')[0] : null;

  function confirmarRemocao(e: StockEntry) {
    Alert.alert(
      'Remover esta compra?',
      `${quantidadeDoEstoque(e.units, m.form)} de ${diaCurto(new Date(e.purchasedAt))} saem do estoque de ${titulo}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => onRemoverCompra(e) },
      ],
    );
  }

  return (
    <SurfaceCard style={styles.card}>
      {/* Agrupado: o leitor de tela le o essencial num gesto so. */}
      <View
        style={styles.topo}
        accessible
        accessibilityLabel={[
          titulo,
          quem ? `de ${quem}` : null,
          `${restante} restantes`,
          baixo ? 'estoque baixo' : 'estoque suficiente',
          previsao,
          estoque.expiresOn ? `validade ${validadeCurta(estoque.expiresOn)}` : null,
        ]
          .filter(Boolean)
          .join(', ')}
      >
        <IconTile {...forma} size={54} />

        <View style={styles.textos}>
          <View style={styles.linhaTitulo}>
            <Text style={styles.nome} numberOfLines={2}>
              {titulo}
            </Text>
            <View style={[styles.etiqueta, { borderColor: corDoNivel }]}>
              <Text style={[styles.etiquetaTexto, { color: corDoNivel }]}>
                {baixo ? 'Estoque baixo' : 'Estoque suficiente'}
              </Text>
            </View>
          </View>

          <Text style={styles.restante}>{restante} restantes</Text>
          {quem ? <Text style={styles.detalhe}>{quem}</Text> : null}

          <View style={styles.trilho}>
            <View
              style={[styles.nivel, { width: `${nivel(estoque) * 100}%`, backgroundColor: corDoNivel }]}
            />
          </View>

          <View style={styles.metas}>
            <View style={styles.meta}>
              <Feather name="calendar" size={14} color={colors.textSecondary} />
              <Text style={styles.detalhe}>{previsao}</Text>
            </View>
            {estoque.expiresOn ? (
              <View style={styles.meta}>
                <Icone
                  nome={ICONES.escudoCheck}
                  size={15}
                  color={vencendo ? colors.accent : colors.textSecondary}
                />
                <Text style={[styles.detalhe, vencendo && styles.atencao]}>
                  Validade: {validadeCurta(estoque.expiresOn)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <Pressable
        onPress={onAlternar}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        accessibilityLabel={aberto ? 'Esconder compras' : 'Ver compras registradas'}
        style={({ pressed }) => [styles.faixa, pressed && styles.pressionado]}
      >
        <Feather name="package" size={16} color={colors.textSecondary} />
        <Text style={styles.faixaTexto} numberOfLines={1}>
          {m.packageAmount
            ? `Quantidade por caixa: ${quantidadeDoEstoque(m.packageAmount, m.form)}`
            : 'Compras registradas'}
        </Text>
        <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={20} color={colors.sectionTitle} />
      </Pressable>

      {aberto ? (
        <View style={styles.compras}>
          {compras === null && !erroCompras ? (
            <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
          ) : erroCompras ? (
            <Pressable onPress={onTentarCompras} accessibilityRole="button">
              <Text style={styles.detalhe}>{erroCompras}</Text>
              <Text style={styles.link}>Tentar de novo</Text>
            </Pressable>
          ) : compras && compras.length === 0 ? (
            <Text style={styles.detalhe}>Nenhuma compra registrada.</Text>
          ) : (
            compras?.map((e, i) => (
              <View key={e.id} style={[styles.compra, i > 0 && styles.compraDivisor]}>
                <View
                  style={styles.compraTextos}
                  accessible
                  accessibilityLabel={[
                    `Compra de ${diaCurto(new Date(e.purchasedAt))}`,
                    quantidadeDoEstoque(e.units, m.form),
                    e.place,
                    e.expiresOn ? `validade ${validadeCurta(e.expiresOn)}` : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                >
                  <Text style={styles.compraTitulo}>
                    {diaCurto(new Date(e.purchasedAt))} · {quantidadeDoEstoque(e.units, m.form)}
                  </Text>
                  {e.place || e.expiresOn ? (
                    <Text style={styles.detalhe} numberOfLines={2}>
                      {[e.place, e.expiresOn ? `validade ${validadeCurta(e.expiresOn)}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                </View>
                {removendo === e.id ? (
                  <ActivityIndicator color={colors.textError} />
                ) : (
                  <Pressable
                    onPress={() => confirmarRemocao(e)}
                    disabled={removendo !== null}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover compra de ${diaCurto(new Date(e.purchasedAt))}`}
                  >
                    <Feather name="trash-2" size={18} color={colors.textError} />
                  </Pressable>
                )}
              </View>
            ))
          )}

          <Pressable
            onPress={onRegistrarCompra}
            accessibilityRole="button"
            style={({ pressed }) => [styles.registrar, pressed && styles.pressionado]}
          >
            <Feather name="plus" size={16} color={colors.accentGreen} />
            <Text style={styles.link}>Registrar compra</Text>
          </Pressable>
        </View>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, marginTop: spacing.md },
  topo: { flexDirection: 'row', alignItems: 'flex-start' },
  textos: { flex: 1, marginLeft: spacing.md },
  linhaTitulo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  nome: { flex: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  etiqueta: {
    borderWidth: 1.5,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  etiquetaTexto: { fontFamily: fonts.bold, fontSize: 12 },
  restante: { fontFamily: fonts.bold, fontSize: 16, color: colors.sectionTitle, marginTop: 2 },
  trilho: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.pillTablet,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  nivel: { height: 8, borderRadius: radii.pill },
  metas: { marginTop: spacing.sm, gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  detalhe: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  atencao: { color: colors.accent, fontFamily: fonts.semibold },
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.chipMore,
    borderRadius: radii.card - 14,
    paddingHorizontal: spacing.md,
    // 44 de alvo minimo de toque.
    minHeight: 44,
    marginTop: spacing.md,
  },
  faixaTexto: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.textPrimary },
  compras: { marginTop: spacing.sm },
  carregando: { marginVertical: spacing.md },
  compra: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  compraDivisor: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  compraTextos: { flex: 1 },
  compraTitulo: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textPrimary },
  registrar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentGreen },
  pressionado: { opacity: 0.85 },
});
