import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { healthApi, type DoseDoHistorico, type HistoricoDeDoses } from '@/api/health';
import { FilterChips } from '@/components/FilterChips';
import {
  CHIPS_DE_PERIODO,
  LinhaDoHistorico,
  ResumoDoHistorico,
  desdeDoPeriodo,
  type Periodo,
} from '@/components/HistoricoDeDoses';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { backgrounds, colors, fonts, spacing } from '@/theme';

/** Mesmo nome e mesmo valor das outras telas com barra de abas. */
const ESPACO_BARRA = 96;
const POR_PAGINA = 30;

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

type Item =
  | { tipo: 'mes'; chave: string; texto: string }
  | { tipo: 'dose'; chave: string; dose: DoseDoHistorico };

/**
 * Agrupa por mes so com cabecalho, SEM contagem por mes: as paginas chegam aos
 * poucos, e um "outubro · 12 tomadas" contado do que ja carregou mentiria ate
 * a ultima pagina chegar. O total certo esta no resumo, que vem do servidor.
 */
function comMeses(doses: DoseDoHistorico[]): Item[] {
  const itens: Item[] = [];
  let atual = '';
  for (const d of doses) {
    const iso = d.takenAt ?? d.scheduledFor;
    if (iso) {
      const data = new Date(iso);
      const chave = `${data.getFullYear()}-${data.getMonth()}`;
      if (chave !== atual) {
        atual = chave;
        itens.push({ tipo: 'mes', chave: `mes-${chave}`, texto: `${MESES[data.getMonth()]} de ${data.getFullYear()}` });
      }
    }
    itens.push({ tipo: 'dose', chave: d.id, dose: d });
  }
  return itens;
}

/**
 * Historico completo das doses de um remedio, paginado.
 *
 * Soma os tratamentos anteriores da mesma pessoa com o mesmo remedio (quem
 * decide quais sao e o servidor — lib/historico.ts). Doses de outro cadastro
 * aparecem marcadas como "tratamento anterior".
 */
export default function HistoricoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; periodo?: string; nome?: string }>();
  const id = params.id!;

  const [periodo, setPeriodo] = useState<Periodo>(
    params.periodo === '30' || params.periodo === '7' ? params.periodo : 'tudo',
  );
  const [resumo, setResumo] = useState<HistoricoDeDoses['resumo'] | null>(null);
  const [doses, setDoses] = useState<DoseDoHistorico[]>([]);
  const [proximo, setProximo] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [maisCarregando, setMaisCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * Cada troca de periodo ganha um numero. Pagina que chega de um periodo
   * antigo e descartada — sem isso, trocar rapido de "Tudo" para "7 dias"
   * misturaria as doses dos dois.
   */
  const geracao = useRef(0);

  const primeiraPagina = useCallback(async () => {
    const minha = ++geracao.current;
    setCarregando(true);
    setErro(null);
    try {
      const h = await healthApi.historicoDoRemedio(id, { desde: desdeDoPeriodo(periodo), limite: POR_PAGINA });
      if (minha !== geracao.current) return;
      setResumo(h.resumo);
      setDoses(h.doses);
      setProximo(h.proximo ?? null);
    } catch (e) {
      if (minha === geracao.current) setErro(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      if (minha === geracao.current) setCarregando(false);
    }
  }, [id, periodo]);

  useEffect(() => {
    void primeiraPagina();
  }, [primeiraPagina]);

  async function maisUmaPagina() {
    if (!proximo || maisCarregando || carregando) return;
    const minha = geracao.current;
    setMaisCarregando(true);
    try {
      const h = await healthApi.historicoDoRemedio(id, {
        desde: desdeDoPeriodo(periodo),
        antes: proximo,
        limite: POR_PAGINA,
      });
      if (minha !== geracao.current) return;
      setDoses((atuais) => [...atuais, ...h.doses]);
      setProximo(h.proximo ?? null);
    } catch {
      // Falha no meio da rolagem nao apaga o que ja esta na tela: o rodape
      // oferece tentar de novo.
      if (minha === geracao.current) setErro('Não consegui carregar mais doses.');
    } finally {
      setMaisCarregando(false);
    }
  }

  const agora = new Date();
  const itens = comMeses(doses);

  const cabecalho = (
    <View>
      <ScreenHeader
        title={params.nome ? `Histórico de ${params.nome}` : 'Histórico de doses'}
        titleLines={2}
        onBack={() => router.back()}
      />
      <View style={styles.chips}>
        <FilterChips
          chips={CHIPS_DE_PERIODO}
          selected={periodo === 'tudo' ? null : periodo}
          onSelect={(v) => setPeriodo((v ?? 'tudo') as Periodo)}
        />
      </View>
      {resumo && !carregando ? (
        <SurfaceCard style={styles.cartao}>
          <ResumoDoHistorico resumo={resumo} periodo={periodo} />
        </SurfaceCard>
      ) : null}
    </View>
  );

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.medications} />
      <FlatList
        data={carregando ? [] : itens}
        keyExtractor={(i) => i.chave}
        ListHeaderComponent={cabecalho}
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: ESPACO_BARRA + insets.bottom },
        ]}
        onEndReached={() => void maisUmaPagina()}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) =>
          item.tipo === 'mes' ? (
            <Text style={styles.mes} accessibilityRole="header">
              {item.texto}
            </Text>
          ) : (
            <View style={styles.linha}>
              <LinhaDoHistorico dose={item.dose} agora={agora} idAtual={id} />
            </View>
          )
        }
        ListEmptyComponent={
          carregando ? (
            <ActivityIndicator style={styles.espera} color={colors.accentGreen} />
          ) : erro ? null : (
            <Text style={styles.vazio}>
              {periodo === 'tudo' ? 'Nenhuma dose registrada ainda.' : 'Nenhuma dose registrada neste período.'}
            </Text>
          )
        }
        ListFooterComponent={
          erro ? (
            <Pressable
              onPress={() => (doses.length ? void maisUmaPagina() : void primeiraPagina())}
              accessibilityRole="button"
              style={styles.erro}
            >
              <Text style={styles.erroTexto}>{erro}</Text>
              <Text style={styles.tentar}>Tentar de novo</Text>
            </Pressable>
          ) : maisCarregando ? (
            <ActivityIndicator style={styles.espera} color={colors.accentGreen} />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  conteudo: { paddingHorizontal: spacing.xl },
  chips: { marginTop: spacing.lg, marginBottom: spacing.md },
  cartao: { padding: spacing.lg, marginBottom: spacing.md },
  mes: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.sectionTitle,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'capitalize',
  },
  linha: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  espera: { marginTop: spacing.xl },
  vazio: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  erro: { alignItems: 'center', paddingVertical: spacing.xl },
  erroTexto: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  tentar: { fontFamily: fonts.bold, fontSize: 15, color: colors.accentGreen, marginTop: spacing.sm },
});
