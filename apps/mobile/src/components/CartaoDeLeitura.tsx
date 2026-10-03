import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MedicamentoLido } from '@/api/health';
import { formaVisual } from '@/lib/posologia';
import { IconTile, LADRILHO_NEUTRO } from '@/components/IconTile';
import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';

type Props =
  | { modo: 'lendo'; segundos: number; onCancelar: () => void }
  | { modo: 'resultado'; item: MedicamentoLido };

/**
 * O que esta acontecendo com a foto, e depois o que foi lido dela.
 *
 * No modo `lendo` ele OCUPA O LUGAR dos dois cartoes de foto, e nao aparece
 * abaixo deles: assim nao da para disparar uma segunda leitura enquanto a
 * primeira roda — e o teto e de tres por minuto.
 */
export function CartaoDeLeitura(props: Props) {
  if (props.modo === 'lendo') {
    return (
      <SurfaceCard style={styles.cartao}>
        <View style={styles.linha} accessible accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.accentGreen} />
          <View style={styles.textos}>
            <Text style={styles.titulo}>Lendo a foto</Text>
            <Text style={styles.subtitulo}>{espera(props.segundos)}</Text>
          </View>
        </View>

        <Pressable
          onPress={props.onCancelar}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cancelar, pressed && styles.pressionado]}
        >
          <Text style={styles.cancelarTexto}>Cancelar</Text>
        </Pressable>
      </SurfaceCard>
    );
  }

  const { item } = props;
  /**
   * "Pronto para revisar" so quando a leitura veio inteira.
   *
   * Um chip verde dizendo "pronto" sobre meia leitura e a mesma mentira do
   * exemplo ficticio que ficou de fora do repouso, em escala menor.
   */
  const completo = Boolean(item.name && item.strength && (item.scheduleType || item.packageAmount));

  return (
    <SurfaceCard style={styles.cartao}>
      <View style={styles.linha}>
        <IconTile size={44} icone="clipboard" {...LADRILHO_NEUTRO} />
        <View style={styles.textos}>
          <Text style={styles.titulo}>O que eu li na foto</Text>
        </View>
      </View>

      <Campo rotulo="Nome do medicamento" valor={[item.name, item.strength].filter(Boolean).join(' ')} />

      {/* Aviso NO NOME, e so nele: e o campo em que a correcao silenciosa do
          modelo faz estrago — "Amoxicilna" virando "Amoxicilina". Reproduzido
          contra a API; o prompt reduz e nao elimina. */}
      <View style={styles.aviso}>
        <Feather name="alert-circle" size={14} color={colors.accent} />
        <Text style={styles.avisoTexto}>Confira o nome antes de salvar.</Text>
      </View>

      {item.packageAmount ? (
        <Campo rotulo="Quantas vêm na caixa" valor={`${item.packageAmount} ${item.form ?? ''}`.trim()} />
      ) : null}

      {item.scheduleType ? (
        <Campo
          rotulo={formaVisual(item.form) === 'jato' ? 'Como aplicar' : 'Como tomar'}
          valor={comoTomar(item)}
        />
      ) : null}

      <View style={[styles.chip, !completo && styles.chipIncompleto]}>
        <Feather name={completo ? 'check' : 'edit-3'} size={14} color={colors.onAccent} />
        <Text style={styles.chipTexto}>{completo ? 'Pronto para revisar' : 'Revise e complete'}</Text>
      </View>

      {!completo ? (
        <Text style={styles.faltou}>O que não aparece aqui você preenche na próxima tela.</Text>
      ) : null}
    </SurfaceCard>
  );
}

/**
 * Rotulo em cima, valor embaixo — nunca em duas colunas.
 *
 * "Dipirona Monoidratada 500 mg/mL solução oral" nao cabe ao lado de um
 * rotulo, e com fonte grande a coluna do rotulo fica ilegivel. Empilhado
 * sobrevive a qualquer comprimento. Sem numberOfLines de proposito: o cartao
 * cresce em vez de esconder o nome do remedio.
 */
function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.campo} accessible accessibilityLabel={`${rotulo}: ${valor}`}>
      <Text style={styles.campoRotulo}>{rotulo}</Text>
      <Text style={styles.campoValor}>{valor}</Text>
    </View>
  );
}

function comoTomar(item: MedicamentoLido): string {
  const dose = item.doseAmount ? `${item.doseAmount} ${item.doseUnit ?? item.form ?? ''}`.trim() : null;
  let quando = '';
  if (item.scheduleType === 'interval' && item.intervalHours) {
    quando = item.intervalHours === 24 ? '1x ao dia' : `a cada ${item.intervalHours} horas`;
  } else if (item.scheduleType === 'fixed_times' && item.times.length > 0) {
    quando = `às ${item.times.join(' e ')}`;
  } else if (item.scheduleType === 'as_needed') {
    quando = 'se necessário';
  }
  return [dose, quando].filter(Boolean).join(' ') || '—';
}

/**
 * O texto muda com o tempo decorrido, no mesmo espirito do `demorando` do
 * assistente: tres pontinhos parados por quarenta segundos parecem travamento.
 * Aqui a espera pode ser maior ainda, porque sobe uma foto antes de pensar.
 */
function espera(segundos: number): string {
  if (segundos < 6) return 'Isso leva alguns segundos.';
  if (segundos < 20) return 'A conexão está lenta. Ainda estou enviando a foto.';
  return 'Se quiser, cancele e tente de novo onde o sinal for melhor.';
}

const styles = StyleSheet.create({
  cartao: { padding: spacing.lg, marginTop: spacing.md, minHeight: 132 },
  linha: { flexDirection: 'row', alignItems: 'center' },
  textos: { flex: 1, marginLeft: spacing.md },
  titulo: { fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  subtitulo: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 2,
  },

  cancelar: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  cancelarTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen },
  pressionado: { opacity: 0.85 },

  campo: { marginTop: spacing.md },
  campoRotulo: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary },
  campoValor: { fontFamily: fonts.bold, fontSize: 16, color: colors.textPrimary, marginTop: 2 },

  aviso: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  avisoTexto: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.accent },

  chip: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.chipActive,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
  },
  chipIncompleto: { backgroundColor: colors.accent },
  chipTexto: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onAccent },
  faltou: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
