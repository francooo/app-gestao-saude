import { Feather } from '@expo/vector-icons';
import {
  dadosParaResumo,
  montarRelatorio,
  periodoDosUltimos,
  relatorioEmHtml,
  SECOES_PADRAO,
  type Relatorio,
  type SecoesDoRelatorio,
} from '@gestao/shared/lib/relatorio';
import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { healthApi, type Profile } from '@/api/health';
import { FilterChips } from '@/components/FilterChips';
import { Icone, ICONES } from '@/components/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/components/IconTile';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProfileSelector } from '@/components/ProfileSelector';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SettingsGroup } from '@/components/SettingsGroup';
import { SettingsRow } from '@/components/SettingsRow';
import { SurfaceCard } from '@/components/SurfaceCard';
import { useAssinaturaExigida, usePlano } from '@/lib/avisosContext';
import { carregarDadosDoRelatorio, type DadosDoRelatorio } from '@/lib/relatorio';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

const PERIODOS = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
];

const SECOES: { chave: keyof SecoesDoRelatorio; rotulo: string; icone: string }[] = [
  { chave: 'encerrados', rotulo: 'Tratamentos encerrados', icone: 'flag' },
  { chave: 'sintomas', rotulo: 'Sintomas', icone: 'activity' },
  { chave: 'consultas', rotulo: 'Consultas', icone: 'calendar' },
  { chave: 'historicoDeDoses', rotulo: 'Histórico dose a dose', icone: 'list' },
];

/**
 * Relatorio para o medico.
 *
 * As contas e o documento sao os mesmos da web (@gestao/shared/lib/relatorio):
 * o HTML vira PDF pelo expo-print e sai pelo compartilhamento do sistema
 * (WhatsApp, e-mail, Drive). A previa aqui e um resumo em cartoes — o PDF
 * inteiro so faz sentido aberto como PDF.
 *
 * Gratis. A assinatura so acrescenta o resumo escrito pela IA no topo.
 */
export default function RelatorioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pessoa } = useLocalSearchParams<{ pessoa?: string }>();
  const { premium } = usePlano();
  const tratarAssinatura = useAssinaturaExigida();

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [perfilId, setPerfilId] = useState<string | null>(pessoa ?? null);
  const [dias, setDias] = useState(30);
  const [secoes, setSecoes] = useState<SecoesDoRelatorio>(SECOES_PADRAO);

  const [dados, setDados] = useState<DadosDoRelatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [gerandoResumo, setGerandoResumo] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  /** O instante da busca: o relatorio inteiro concorda sobre o "agora". */
  const agora = useRef(new Date());
  /** Descarta a resposta de uma busca que ja foi substituida. */
  const geracao = useRef(0);

  useEffect(() => {
    let cancelado = false;
    healthApi
      .listProfiles()
      .then((lista) => {
        if (cancelado) return;
        setPerfis(lista);
        setPerfilId(
          (atual) =>
            (atual && lista.some((p) => p.id === atual) ? atual : null) ??
            lista.find((p) => p.isAccountHolder)?.id ??
            lista[0]?.id ??
            null,
        );
      })
      .catch((e) => {
        if (!cancelado) {
          setErro(messageForError(e instanceof ApiRequestError ? e.code : undefined));
          setCarregando(false);
        }
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const periodo = useMemo(() => periodoDosUltimos(dias, agora.current), [dias]);

  const carregar = useCallback(async () => {
    if (!perfilId) return;
    const minha = ++geracao.current;
    setCarregando(true);
    setErro(null);
    // Trocar de pessoa ou de periodo descarta o resumo: ele falava de outros numeros.
    setResumo(null);
    try {
      const r = await carregarDadosDoRelatorio(perfilId, periodo.inicio, periodo.fim);
      if (geracao.current === minha) setDados(r);
    } catch (e) {
      if (geracao.current === minha) {
        setErro(messageForError(e instanceof ApiRequestError ? e.code : undefined));
      }
    } finally {
      if (geracao.current === minha) setCarregando(false);
    }
  }, [perfilId, periodo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const relatorio: Relatorio | null = useMemo(
    () =>
      dados
        ? montarRelatorio({ ...dados, ...periodo, secoes, agora: agora.current, resumoIA: resumo })
        : null,
    [dados, periodo, secoes, resumo],
  );

  async function gerarResumo() {
    if (!relatorio) return;
    setGerandoResumo(true);
    try {
      setResumo(await healthApi.resumoDoRelatorio(dadosParaResumo({ ...relatorio, resumoIA: null })));
    } catch (e) {
      if (!tratarAssinatura(e)) {
        Alert.alert(
          'Não consegui escrever o resumo',
          messageForError(e instanceof ApiRequestError ? e.code : undefined),
        );
      }
    } finally {
      setGerandoResumo(false);
    }
  }

  async function compartilhar() {
    if (!relatorio) return;
    setGerandoPdf(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: relatorioEmHtml(relatorio) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: `Relatório de ${relatorio.pessoa.nome.split(' ')[0]}`,
        });
      } else {
        Alert.alert('Não dá para compartilhar', 'Este aparelho não oferece o compartilhamento de arquivos.');
      }
    } catch {
      Alert.alert('Não consegui gerar o PDF', 'Tente de novo em instantes.');
    } finally {
      setGerandoPdf(false);
    }
  }

  const contagem = relatorio ? numerosDaPrevia(relatorio) : null;

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.settings} />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Relatório para o médico" titleLines={2} onBack={() => router.back()} />

        <View style={styles.secao}>
          <ProfileSelector
            profiles={perfis}
            selectedId={perfilId}
            onSelect={setPerfilId}
            tituloDoPainel="Relatório de"
            permitirTodos={false}
          />
        </View>

        <View style={styles.secao}>
          <SectionHeader title="Período" />
          <FilterChips
            chips={PERIODOS}
            selected={String(dias)}
            onSelect={(v) => setDias(Number(v ?? 30))}
          />
        </View>

        <View style={styles.secao}>
          <SectionHeader title="O que incluir" />
          <SettingsGroup>
            {SECOES.map((s) => (
              <SettingsRow
                key={s.chave}
                marcador={<IconTile icone={s.icone as never} {...LADRILHO_NEUTRO} />}
                rotulo={s.rotulo}
                acessorio="interruptor"
                ligado={secoes[s.chave]}
                onChange={(v) => setSecoes((atual) => ({ ...atual, [s.chave]: v }))}
              />
            ))}
          </SettingsGroup>
        </View>

        <View style={styles.secao}>
          <SectionHeader title="Prévia" />
          {carregando ? (
            <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
          ) : erro || !relatorio || !contagem ? (
            <SurfaceCard style={styles.aviso}>
              <Feather name="alert-circle" size={24} color={colors.textError} />
              <Text style={styles.avisoTexto}>{erro ?? 'Não consegui montar o relatório.'}</Text>
              <Pressable onPress={() => void carregar()} accessibilityRole="button" hitSlop={12}>
                <Text style={styles.link}>Tentar de novo</Text>
              </Pressable>
            </SurfaceCard>
          ) : (
            <SurfaceCard style={styles.previa}>
              <Text style={styles.previaNome}>{relatorio.pessoa.nome}</Text>
              <Text style={styles.previaPeriodo}>{relatorio.periodo.texto}</Text>
              {relatorio.vazio ? (
                <Text style={styles.previaVazio}>Nada registrado neste período.</Text>
              ) : (
                <View style={styles.numeros}>
                  <Numero valor={String(contagem.emUso)} rotulo="remédios em uso" />
                  <Numero valor={contagem.adesao} rotulo="das doses previstas tomadas" />
                  {secoes.sintomas ? <Numero valor={String(contagem.sintomas)} rotulo="registros de sintomas" /> : null}
                  {secoes.consultas ? <Numero valor={String(contagem.consultas)} rotulo="consultas no período" /> : null}
                </View>
              )}
              {resumo ? (
                <View style={styles.resumo}>
                  <Text style={styles.resumoTitulo}>Resumo por IA</Text>
                  <Text style={styles.resumoTexto}>{resumo}</Text>
                </View>
              ) : null}
            </SurfaceCard>
          )}
        </View>

        {/* Resumo por IA: o que a assinatura acrescenta. */}
        <SurfaceCard style={styles.ia}>
          <View style={styles.iaTopo}>
            <View style={styles.iaSelo}>
              <Icone nome={ICONES.brilho} size={20} color={colors.accent} />
            </View>
            <View style={styles.iaTextos}>
              <Text style={styles.iaTitulo}>Resumo por IA</Text>
              <Text style={styles.iaAjuda}>
                Um parágrafo no topo do relatório com o que aconteceu no período. Não faz diagnóstico.
              </Text>
            </View>
          </View>
          {premium ? (
            <Pressable
              onPress={() => void gerarResumo()}
              disabled={gerandoResumo || !relatorio}
              accessibilityRole="button"
              style={({ pressed }) => [styles.iaBotao, pressed && styles.pressionado]}
            >
              {gerandoResumo ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.iaBotaoTexto}>{resumo ? 'Escrever de novo' : 'Gerar resumo'}</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/conta/assinatura')}
              accessibilityRole="button"
              style={styles.iaConvite}
            >
              <Feather name="lock" size={14} color={colors.accentGreen} />
              <Text style={styles.iaConviteTexto}>Faz parte da assinatura</Text>
            </Pressable>
          )}
        </SurfaceCard>

        <PrimaryButton
          title="Gerar e compartilhar PDF"
          onPress={() => void compartilhar()}
          loading={gerandoPdf}
          disabled={!relatorio || carregando}
          style={styles.gerar}
        />
        <Text style={styles.rodape}>
          O PDF sai pelo compartilhamento do celular: WhatsApp, e-mail ou onde preferir.
        </Text>
      </ScrollView>
    </View>
  );
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <View style={styles.numero}>
      <Text style={styles.numeroValor}>{valor}</Text>
      <Text style={styles.numeroRotulo}>{rotulo}</Text>
    </View>
  );
}

function numerosDaPrevia(r: Relatorio) {
  const comGrade = r.emUso.filter((x) => !x.adesao.seNecessario && x.adesao.previstas > 0);
  const previstas = comGrade.reduce((t, x) => t + x.adesao.previstas, 0);
  const tomadas = comGrade.reduce((t, x) => t + x.adesao.tomadas, 0);
  return {
    emUso: r.emUso.length,
    adesao: previstas > 0 ? `${Math.round((tomadas / previstas) * 100)}%` : '—',
    sintomas: r.sintomas?.total ?? 0,
    consultas: r.consultas?.noPeriodo.length ?? 0,
  };
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.settings[0] },
  conteudo: { paddingHorizontal: spacing.xl },
  secao: { marginTop: spacing.xl },
  carregando: { marginVertical: spacing.xxl },

  aviso: { alignItems: 'center', padding: spacing.xl },
  avisoTexto: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  link: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen, marginTop: spacing.md },

  previa: { padding: spacing.lg },
  previaNome: { fontFamily: fonts.bold, fontSize: 18, color: colors.sectionTitle },
  previaPeriodo: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  previaVazio: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, marginTop: spacing.md },
  numeros: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  numero: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.pillSage,
    borderRadius: radii.card - 12,
    padding: spacing.md,
  },
  numeroValor: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.sectionTitle },
  numeroRotulo: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  resumo: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card - 14,
    backgroundColor: colors.surfaceWarm,
  },
  resumoTitulo: { fontFamily: fonts.bold, fontSize: 13, color: colors.accent },
  resumoTexto: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textPrimary, marginTop: 4 },

  ia: { padding: spacing.lg, marginTop: spacing.xl },
  iaTopo: { flexDirection: 'row', alignItems: 'flex-start' },
  iaSelo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iaTextos: { flex: 1, marginLeft: spacing.md },
  iaTitulo: { fontFamily: fonts.bold, fontSize: 16, color: colors.sectionTitle },
  iaAjuda: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 2 },
  iaBotao: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.accentGreen,
  },
  iaBotaoTexto: { fontFamily: fonts.bold, fontSize: 15, color: colors.onAccent },
  iaConvite: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.pillSage,
  },
  iaConviteTexto: { fontFamily: fonts.bold, fontSize: 14, color: colors.accentGreen },
  pressionado: { opacity: 0.85 },

  gerar: { marginTop: spacing.xl },
  rodape: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
