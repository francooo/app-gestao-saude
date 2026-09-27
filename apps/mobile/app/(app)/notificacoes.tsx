import { Feather } from '@expo/vector-icons';
import { isSameDay } from 'date-fns';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconTile } from '@/components/IconTile';
import { FilterChips, type Chip } from '@/components/FilterChips';
import { NotificationRow } from '@/components/NotificationRow';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SettingsGroup } from '@/components/SettingsGroup';
import { SurfaceCard } from '@/components/SurfaceCard';
import { useAvisos, type AvisoComLeitura } from '@/lib/avisosContext';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

const CHIPS: Chip[] = [
  { value: null, label: 'Todas' },
  { value: 'medicamentos', label: 'Medicamentos' },
  { value: 'consultas', label: 'Consultas' },
  { value: 'lembretes', label: 'Lembretes' },
];

/** Ladrilho e icone de cada tipo. Ambar so onde ha algo a fazer. */
const VISUAL: Record<string, { icone: keyof typeof Feather.glyphMap; fundo: string; traco: string }> =
  {
    'dose-atrasada': { icone: 'alert-circle', fundo: colors.surfaceWarm, traco: colors.accent },
    'dose-agora': { icone: 'aperture', fundo: colors.surfaceWarm, traco: colors.accent },
    'consulta-hoje': { icone: 'calendar', fundo: colors.surfaceWarm, traco: colors.accent },
    'consulta-amanha': { icone: 'calendar', fundo: colors.pillTablet, traco: colors.pillTabletIcon },
    'tratamento-terminando': { icone: 'flag', fundo: colors.pillTablet, traco: colors.pillTabletIcon },
    'tratamento-terminado': {
      icone: 'check-circle',
      fundo: colors.pillTablet,
      traco: colors.pillTabletIcon,
    },
    'peso-desatualizado': { icone: 'activity', fundo: colors.terracotta, traco: colors.surface },
    'politica-desatualizada': {
      icone: 'shield',
      fundo: colors.pillTablet,
      traco: colors.pillTabletIcon,
    },
  };

/**
 * O que precisa da sua atencao.
 *
 * NAO e caixa de entrada e nao e historico: e ESTADO CORRENTE. Cada item e uma
 * condicao que vale agora, e resolver a condicao — marcar a dose, aceitar a
 * politica — faz o item sumir. "Marcar como lida" apenas apaga o ponto; nunca
 * e o caminho de resolver.
 */
export default function NotificacoesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { avisos, carregando, erro, parcial, recarregar, marcarTodasComoLidas, marcarComoLido } =
    useAvisos();

  const [filtro, setFiltro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const visiveis = useMemo(
    () => (filtro ? avisos.filter((a) => a.categoria === filtro) : avisos),
    [avisos, filtro],
  );

  /**
   * "Hoje" e sobre QUANDO O AVISO SURGIU, nao sobre quando ele fala.
   *
   * Uma consulta de amanha e um aviso de hoje: o que mudou hoje foi ela ter
   * entrado no horizonte de 48 horas.
   */
  const agora = new Date();
  const hoje = visiveis.filter((a) => a.surgiuEm == null || isSameDay(a.surgiuEm, agora));
  const anteriores = visiveis.filter((a) => a.surgiuEm != null && !isSameDay(a.surgiuEm, agora));

  const temNaoLidoVisivel = visiveis.some((a) => !a.lido);

  function abrir(a: AvisoComLeitura) {
    if (!a.lido) void marcarComoLido(a.id);
    if (a.rota) router.push(a.rota as never);
  }

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.home} />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={async () => {
              setAtualizando(true);
              await recarregar();
              setAtualizando(false);
            }}
            tintColor={colors.accentGreen}
          />
        }
      >
        {/* Sem sino: um sino que abre a tela em que voce ja esta e botao morto. */}
        <ScreenHeader title="Notificações" onBack={() => router.back()} />

        <View style={styles.filtros}>
          <FilterChips chips={CHIPS} selected={filtro} onSelect={setFiltro} />
        </View>

        {carregando && avisos.length === 0 ? (
          <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
        ) : erro && avisos.length === 0 ? (
          <SurfaceCard style={styles.cartaoCentral}>
            <Feather name="wifi-off" size={26} color={colors.textSecondary} />
            <Text style={styles.ajuda}>
              Sem conexão. Os avisos são calculados a partir dos seus dados, e eu preciso buscá-los.
            </Text>
            <Pressable onPress={() => void recarregar()} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.link}>Tentar de novo</Text>
            </Pressable>
          </SurfaceCard>
        ) : (
          <>
            {/*
              Erro parcial: mostra o que veio.

              Se o consentimento falhou mas os remedios vieram, esconder uma
              dose atrasada por causa da politica de privacidade seria o pior
              desfecho possivel.
            */}
            {parcial ? (
              <View style={styles.faixaParcial}>
                <Feather name="alert-circle" size={14} color={colors.textSecondary} />
                <Text style={styles.faixaTexto}>Alguns avisos podem estar faltando.</Text>
              </View>
            ) : null}

            {visiveis.length === 0 ? (
              <Vazio filtro={filtro} onVerTodas={() => setFiltro(null)} />
            ) : null}

            {hoje.length > 0 ? (
              <View style={styles.secao}>
                <SectionHeader title="Hoje" />
                <SettingsGroup>
                  {hoje.map((a) => (
                    <NotificationRow
                      key={a.id}
                      ladrilho={VISUAL[a.tipo]!}
                      titulo={a.titulo}
                      subtitulo={a.subtitulo}
                      quando={quandoTexto(a, agora)}
                      naoLido={!a.lido}
                      onPress={a.rota ? () => abrir(a) : undefined}
                    />
                  ))}
                </SettingsGroup>
              </View>
            ) : null}

            {anteriores.length > 0 ? (
              <View style={styles.secao}>
                <SectionHeader title="Anteriores" />
                <SettingsGroup>
                  {anteriores.map((a) => (
                    <NotificationRow
                      key={a.id}
                      ladrilho={VISUAL[a.tipo]!}
                      titulo={a.titulo}
                      subtitulo={a.subtitulo}
                      quando={quandoTexto(a, agora)}
                      naoLido={!a.lido}
                      onPress={a.rota ? () => abrir(a) : undefined}
                    />
                  ))}
                </SettingsGroup>
              </View>
            ) : null}

            {temNaoLidoVisivel ? (
              <Pressable
                onPress={() => void marcarTodasComoLidas()}
                accessibilityRole="button"
                style={({ pressed }) => [styles.marcarTodas, pressed && styles.pressionado]}
              >
                <Text style={styles.marcarTodasTexto}>Marcar todas como lidas</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * O vazio, que num aplicativo saudavel e o estado NORMAL.
 *
 * Tres coisas de proposito: o titulo afirma um RESULTADO em vez de uma
 * ausencia; o corpo diz O QUE FOI VERIFICADO, que e o que transforma "vazio"
 * em "confiavel" — sem essa frase ninguem sabe se o aplicativo olhou ou
 * quebrou calado; e nao ha botao, porque aqui o vazio e sucesso e oferecer
 * acao convida a estragar.
 */
function Vazio({ filtro, onVerTodas }: { filtro: string | null; onVerTodas: () => void }) {
  if (filtro) {
    return (
      <SurfaceCard style={styles.cartaoCentral}>
        <Text style={styles.ajuda}>Nenhum aviso de {rotuloDoFiltro(filtro)} agora.</Text>
        <Pressable onPress={onVerTodas} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.link}>Ver todas</Text>
        </Pressable>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard style={styles.cartaoCentral}>
      <IconTile icone="check-circle" size={54} fundo={colors.pillTablet} traco={colors.accentGreen} />
      <Text style={styles.vazioTitulo}>Tudo em dia</Text>
      <Text style={styles.ajuda}>
        Nenhuma dose atrasada e nenhuma consulta nas próximas 48 horas. Vamos avisar aqui quando
        algo precisar de você.
      </Text>
    </SurfaceCard>
  );
}

function rotuloDoFiltro(filtro: string): string {
  return CHIPS.find((c) => c.value === filtro)?.label.toLowerCase() ?? filtro;
}

/** "Agora", "Há 2 horas", "Ontem", "26/09". */
function quandoTexto(a: AvisoComLeitura, agora: Date): string {
  if (!a.surgiuEm) return 'Pendente';

  const minutos = Math.floor((agora.getTime() - a.surgiuEm.getTime()) / 60_000);
  if (minutos < 2) return 'Agora';
  if (minutos < 60) return `Há ${minutos} minutos`;

  const horas = Math.floor(minutos / 60);
  if (isSameDay(a.surgiuEm, agora)) {
    return horas === 1 ? 'Há 1 hora' : `Há ${horas} horas`;
  }

  const ontem = new Date(agora.getTime() - 24 * 3_600_000);
  if (isSameDay(a.surgiuEm, ontem)) return 'Ontem';

  return a.surgiuEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.home[0] },
  conteudo: { paddingHorizontal: spacing.xl },
  filtros: { marginTop: spacing.lg },
  secao: { marginTop: spacing.xl },
  carregando: { marginTop: spacing.xxl },

  cartaoCentral: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.xl },
  vazioTitulo: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.sectionTitle,
    marginTop: spacing.md,
  },
  ajuda: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  link: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.accentGreen,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },

  faixaParcial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  faixaTexto: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },

  marcarTodas: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    minHeight: 56,
    marginTop: spacing.xxl,
  },
  marcarTodasTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.accentGreen },
  pressionado: { opacity: 0.85 },
});
