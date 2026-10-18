import { Feather } from '@expo/vector-icons';
import { isSameDay, isYesterday } from 'date-fns';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { healthApi, type DoseDoHistorico, type HistoricoDeDoses as Historico } from '@/api/health';
import { FilterChips } from '@/components/FilterChips';
import { SectionHeader } from '@/components/SectionHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { hora } from '@/lib/posologia';
import { colors, fonts, radii, spacing } from '@/theme';

/**
 * Historico de doses de um remedio: "Tomou N vezes", filtro de periodo e as
 * doses mais recentes.
 *
 * A contagem vem do SERVIDOR (`?recurso=historico`), e nao das doses do
 * detalhe: aquelas sao so as 30 ultimas, e "quantas vezes ja tomou" e sobre a
 * vida inteira — somando os tratamentos anteriores da mesma pessoa com o mesmo
 * remedio.
 */

export type Periodo = 'tudo' | '30' | '7';

export const CHIPS_DE_PERIODO = [
  { value: null, label: 'Tudo' },
  { value: '30', label: '30 dias' },
  { value: '7', label: '7 dias' },
];

/**
 * Inicio do periodo no relogio do APARELHO: "7 dias" e hoje e os 6 dias
 * anteriores inteiros, a partir da meia-noite local — nao "agora menos 168h",
 * que cortaria a manha de uma semana atras pela metade.
 */
export function desdeDoPeriodo(p: Periodo): string | undefined {
  if (p === 'tudo') return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (Number(p) - 1));
  return d.toISOString();
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "12 mar 2025" — montado a mao: o Intl do Hermes varia entre aparelhos. */
export function dataPorExtenso(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Quanto a linha mostra do dia: "Hoje", "Ontem", "26/09" ou "26/09/2025". */
function diaDaDose(d: Date, agora: Date): string {
  if (isSameDay(d, agora)) return 'Hoje';
  if (isYesterday(d)) return 'Ontem';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() === agora.getFullYear() ? `${dd}/${mm}` : `${dd}/${mm}/${d.getFullYear()}`;
}

function vezes(n: number): string {
  if (n === 0) return 'Nenhuma dose tomada';
  return n === 1 ? 'Tomou 1 vez' : `Tomou ${n} vezes`;
}

export function ResumoDoHistorico({
  resumo,
  periodo,
}: {
  resumo: Historico['resumo'];
  periodo: Periodo;
}) {
  const detalhes: string[] = [];
  if (resumo.puladas > 0) detalhes.push(resumo.puladas === 1 ? '1 pulada' : `${resumo.puladas} puladas`);
  if (resumo.primeira && periodo === 'tudo') detalhes.push(`desde ${dataPorExtenso(new Date(resumo.primeira))}`);
  if (periodo !== 'tudo') detalhes.push(`nos últimos ${periodo} dias`);
  if (resumo.tratamentos > 1) detalhes.push(`somando ${resumo.tratamentos} tratamentos`);

  const titulo = vezes(resumo.tomadas);
  return (
    <View style={styles.resumo} accessible accessibilityLabel={[titulo, ...detalhes].join(', ')}>
      <View style={styles.resumoIcone}>
        <Feather name="check-circle" size={22} color={colors.onAccent} />
      </View>
      <View style={styles.textos}>
        <Text style={styles.resumoTitulo}>{titulo}</Text>
        {detalhes.length ? <Text style={styles.ajuda}>{detalhes.join(' · ')}</Text> : null}
      </View>
    </View>
  );
}

export function LinhaDoHistorico({
  dose,
  agora,
  idAtual,
}: {
  dose: DoseDoHistorico;
  agora: Date;
  idAtual: string;
}) {
  const pulada = dose.status === 'pulada';
  const instante = dose.takenAt ?? dose.scheduledFor;
  const data = instante ? new Date(instante) : null;
  const texto = data ? `${diaDaDose(data, agora)} às ${hora(data)}` : 'Sem data';
  // Dose de OUTRO cadastro com o mesmo nome: o tratamento anterior.
  const anterior = dose.medicationId !== idAtual;

  const extra = [pulada ? 'pulada' : null, anterior ? 'tratamento anterior' : null].filter(Boolean);

  return (
    <View
      style={styles.dose}
      accessible
      accessibilityLabel={`${texto}, ${pulada ? 'pulada' : 'tomada'}${anterior ? ', tratamento anterior' : ''}`}
    >
      <View style={[styles.doseMarca, { backgroundColor: pulada ? colors.pillTablet : colors.doseTaken }]}>
        <Feather
          name={pulada ? 'slash' : 'check'}
          size={14}
          color={pulada ? colors.pillTabletIcon : colors.onAccent}
        />
      </View>
      <View style={styles.textos}>
        <Text style={styles.doseTexto}>{texto}</Text>
        {extra.length ? <Text style={styles.ajuda}>{extra.join(' · ')}</Text> : null}
      </View>
    </View>
  );
}

/** Quantas doses a secao do detalhe mostra antes do "Ver histórico completo". */
const NA_SECAO = 8;

/**
 * A secao "Histórico de doses" da tela do remedio.
 *
 * `chave` muda quando uma dose e marcada ou desfeita no detalhe — e o sinal
 * para recarregar a contagem, que mora no servidor.
 */
export function HistoricoDeDoses({
  medicationId,
  chave,
  onVerTudo,
}: {
  medicationId: string;
  chave: string;
  onVerTudo: (periodo: Periodo) => void;
}) {
  const [periodo, setPeriodo] = useState<Periodo>('tudo');
  const [dados, setDados] = useState<Historico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    healthApi
      .historicoDoRemedio(medicationId, { desde: desdeDoPeriodo(periodo), limite: NA_SECAO })
      .then((h) => vivo && setDados(h))
      .catch((e) => vivo && setErro(messageForError(e instanceof ApiRequestError ? e.code : undefined)));
    // Resposta atrasada de um filtro antigo nao pode sobrescrever a do novo.
    return () => {
      vivo = false;
    };
  }, [medicationId, periodo, chave, tentativa]);

  const agora = new Date();

  return (
    <View style={styles.secao}>
      <SectionHeader
        title="Histórico de doses"
        onVerTodos={dados?.proximo ? () => onVerTudo(periodo) : undefined}
        verTodosLabel="Ver tudo"
      />
      <View style={styles.chips}>
        <FilterChips
          chips={CHIPS_DE_PERIODO}
          selected={periodo === 'tudo' ? null : periodo}
          onSelect={(v) => setPeriodo((v ?? 'tudo') as Periodo)}
        />
      </View>
      <SurfaceCard style={styles.cartao}>
        {erro ? (
          <Pressable onPress={() => setTentativa((n) => n + 1)} accessibilityRole="button">
            <Text style={styles.ajuda}>{erro} Toque para tentar de novo.</Text>
          </Pressable>
        ) : !dados ? (
          <ActivityIndicator color={colors.accentGreen} />
        ) : (
          <>
            <ResumoDoHistorico resumo={dados.resumo} periodo={periodo} />
            {dados.doses.length === 0 ? (
              <Text style={[styles.ajuda, styles.vazio]}>
                {periodo === 'tudo' ? 'Nenhuma dose registrada ainda.' : 'Nenhuma dose neste período.'}
              </Text>
            ) : (
              dados.doses.map((d) => (
                <View key={d.id}>
                  <View style={styles.divisor} />
                  <LinhaDoHistorico dose={d} agora={agora} idAtual={medicationId} />
                </View>
              ))
            )}
            {dados.proximo ? (
              <Pressable
                onPress={() => onVerTudo(periodo)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.verTudo, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.verTudoTexto}>Ver histórico completo</Text>
                <Feather name="chevron-right" size={16} color={colors.accentGreen} />
              </Pressable>
            ) : null}
          </>
        )}
      </SurfaceCard>
    </View>
  );
}

const styles = StyleSheet.create({
  secao: { marginTop: spacing.xl },
  chips: { marginBottom: spacing.md },
  cartao: { padding: spacing.lg },
  resumo: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.md },
  resumoIcone: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumoTitulo: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.sectionTitle },
  textos: { flex: 1, marginLeft: spacing.md },
  dose: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  doseMarca: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  doseTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  ajuda: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  vazio: { paddingTop: spacing.md },
  divisor: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
  verTudo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
  },
  verTudoTexto: { fontFamily: fonts.bold, fontSize: 15, color: colors.accentGreen },
});
