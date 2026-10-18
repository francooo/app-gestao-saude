import { Feather } from '@expo/vector-icons';
import { endOfDay, startOfDay } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { healthApi, type Medication, type Profile, type StockEntry } from '@/api/health';
import { CartaoDeEstoque } from '@/components/CartaoDeEstoque';
import { FilterChips, type Chip } from '@/components/FilterChips';
import { ICONES } from '@/components/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/components/IconTile';
import { ProfileSelector } from '@/components/ProfileSelector';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SummaryTile } from '@/components/SummaryTile';
import { SurfaceCard } from '@/components/SurfaceCard';
import { estoqueBaixo, validadeProxima } from '@/lib/estoque';
import {
  definirLembreteDeCompra,
  lembreteDeCompraEscolhido,
  notificacoesLigadas,
} from '@/lib/prefs';
import { reconciliarLembreteDeCompra } from '@/lib/reminders';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/** Mesmo nome e mesmo valor das outras telas com barra de abas. */
const ESPACO_BARRA = 96;

type Filtro = 'baixo' | 'validade';

const CHIPS: Chip[] = [
  { value: null, label: 'Todos' },
  { value: 'baixo', label: 'Estoque baixo' },
  { value: 'validade', label: 'Validade próxima' },
];

/** Remedio que tem estoque — o tipo garante `stock` nao nulo dali em diante. */
type ComEstoque = Medication & { stock: NonNullable<Medication['stock']> };

/**
 * Estoque de medicamentos.
 *
 * So aparecem aqui os remedios com ao menos UMA compra registrada. Os outros
 * nao controlam estoque — e "sem controle" e diferente de "acabou". Eles
 * entram pelo seletor da tela de compra, que e onde se comeca a controlar.
 * Uma secao "Sem controle de estoque" aqui duplicaria aquele seletor e
 * empurraria o estoque de verdade para baixo da dobra.
 *
 * Remedios ENCERRADOS ficam de fora: o estoque deles nao acaba mais, e um
 * "Estoque baixo" de um tratamento parado seria alarme falso.
 */
export default function EstoqueScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [medicamentos, setMedicamentos] = useState<Medication[]>([]);
  const [filtro, setFiltro] = useState<Filtro | null>(null);

  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  const [lembrete, setLembrete] = useState(true);
  /** A chave geral dos Ajustes. Desligada, o interruptor daqui nao faz nada. */
  const [mestra, setMestra] = useState(true);

  /** Cartao aberto, e as compras dele (que so o detalhe traz). */
  const [aberto, setAberto] = useState<string | null>(null);
  const [compras, setCompras] = useState<Record<string, StockEntry[]>>({});
  const [erroCompras, setErroCompras] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    const referencia = new Date();

    // Preferencias lidas fora do try, pelo motivo de remedios/index.tsx: uma
    // busca que falhasse deixaria o interruptor mentindo.
    const [escolhido, geral] = await Promise.all([lembreteDeCompraEscolhido(), notificacoesLigadas()]);
    setLembrete(escolhido);
    setMestra(geral);

    try {
      const [listaPerfis, lista] = await Promise.all([
        healthApi.listProfiles(),
        // A janela de doses e obrigatoria na listagem, mas esta tela nao usa
        // dose nenhuma: o restante ja vem calculado. Hoje basta.
        healthApi.listMedications({
          from: startOfDay(referencia),
          to: endOfDay(referencia),
          profileId: perfilId,
        }),
      ]);
      setPerfis(listaPerfis);
      setMedicamentos(lista);
      setAgora(referencia);
      // Compras em cache ficam velhas depois de uma volta da tela de compra.
      setCompras({});

      /**
       * Reconcilia COM A LISTA QUE CHEGOU, como a de doses. So com o filtro de
       * pessoa vazio: com uma pessoa escolhida, a lista e parcial, e o aviso
       * passaria a ignorar os remedios dos outros. Quem filtra reconcilia na
       * proxima visita sem filtro, ou na lista de Remedios.
       */
      if (perfilId === null) void reconciliar(lista, escolhido && geral);
    } catch (e) {
      setErro(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [perfilId]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  const comEstoque = useMemo(
    () => medicamentos.filter((m): m is ComEstoque => m.isActive && !!m.stock),
    [medicamentos],
  );
  const baixos = useMemo(() => comEstoque.filter((m) => estoqueBaixo(m, m.stock)), [comEstoque]);
  const vencendo = useMemo(
    () => comEstoque.filter((m) => validadeProxima(m.stock, agora)),
    [comEstoque, agora],
  );

  const visiveis = filtro === 'baixo' ? baixos : filtro === 'validade' ? vencendo : comEstoque;

  /** O local da compra mais recente entre todos — o card "Onde foi adquirido?". */
  const ultimoLocal = useMemo(() => {
    const comLocal = comEstoque
      .filter((m) => m.stock.place && m.stock.lastPurchaseAt)
      .sort((a, b) => (b.stock.lastPurchaseAt! > a.stock.lastPurchaseAt! ? 1 : -1));
    return comLocal[0] ? { local: comLocal[0].stock.place!, remedio: comLocal[0] } : null;
  }, [comEstoque]);

  async function alternarLembrete(valor: boolean) {
    setLembrete(valor);
    await definirLembreteDeCompra(valor);
    // Com filtro de pessoa a lista e parcial; ver o comentario em carregar.
    if (perfilId === null) await reconciliar(medicamentos, valor && mestra);
    else if (!valor) await reconciliarLembreteDeCompra([]);
  }

  async function abrirCompras(m: Medication) {
    if (aberto === m.id) {
      setAberto(null);
      return;
    }
    setAberto(m.id);
    setErroCompras(null);
    if (compras[m.id]) return;
    try {
      const detalhe = await healthApi.getMedication(m.id);
      setCompras((c) => ({ ...c, [m.id]: detalhe.stockEntries }));
    } catch (e) {
      setErroCompras(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    }
  }

  async function removerCompra(m: Medication, entrada: StockEntry) {
    setRemovendo(entrada.id);
    try {
      const atualizado = await healthApi.removerCompra(m.id, entrada.id);
      setCompras((c) => ({ ...c, [m.id]: atualizado.stockEntries }));
      // O detalhe traz o estoque recalculado; troca so os campos de estoque
      // para nao perder o resto do item da listagem.
      const lista = medicamentos.map((x) =>
        x.id === m.id ? { ...x, stock: atualizado.stock ?? null } : x,
      );
      setMedicamentos(lista);
      if (perfilId === null) void reconciliar(lista, lembrete && mestra);
    } catch (e) {
      Alert.alert(
        'Não consegui remover',
        messageForError(e instanceof ApiRequestError ? e.code : undefined),
      );
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.medications} />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: ESPACO_BARRA + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              void carregar();
            }}
            tintColor={colors.accentGreen}
          />
        }
      >
        <ScreenHeader
          title="Estoque de medicamentos"
          titleLines={2}
          onBack={() => router.back()}
          mostrarSino
        />

        <View style={styles.seletor}>
          <ProfileSelector
            profiles={perfis}
            selectedId={perfilId}
            onSelect={setPerfilId}
            tituloDoPainel="Ver estoque de"
          />
        </View>

        {carregando ? (
          <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
        ) : erro ? (
          <SurfaceCard style={styles.aviso}>
            <Feather name="alert-circle" size={26} color={colors.textError} />
            <Text style={styles.avisoTexto}>{erro}</Text>
            <Pressable onPress={() => void carregar()} accessibilityRole="button">
              <Text style={styles.tentarDeNovo}>Tentar de novo</Text>
            </Pressable>
          </SurfaceCard>
        ) : comEstoque.length === 0 ? (
          <>
            <SurfaceCard style={styles.aviso}>
              <IconTile {...LADRILHO_NEUTRO} icone={ICONES.farmacia} size={54} />
              <Text style={styles.vazioTitulo}>Nenhum remédio com estoque ainda</Text>
              <Text style={styles.avisoTexto}>
                Registre a compra de uma caixa e o aplicativo conta o que sobra a cada dose marcada.
              </Text>
            </SurfaceCard>
            <BotaoAdicionar onPress={() => router.push('/remedios/compra')} />
          </>
        ) : (
          <>
            <View style={styles.resumo}>
              <SummaryTile
                icone="alert-triangle"
                corDoLadrilho={colors.tileSun}
                rotulo="Estoque baixo"
                valor={`${baixos.length} ${baixos.length === 1 ? 'alerta' : 'alertas'}`}
                detalhe="acaba em até 7 dias"
              />
              <SummaryTile
                icone={ICONES.escudoCheck}
                corDoLadrilho={colors.tileClock}
                rotulo="Validade próxima"
                valor={`${vencendo.length} ${vencendo.length === 1 ? 'remédio' : 'remédios'}`}
                detalhe="vence em até 30 dias"
              />
            </View>

            <View style={styles.chips}>
              <FilterChips
                chips={CHIPS}
                selected={filtro}
                onSelect={(v) => setFiltro(v as Filtro | null)}
              />
            </View>

            <View style={styles.secao}>
              <SectionHeader title="Meu estoque" />
              {visiveis.length === 0 ? (
                <SurfaceCard style={styles.aviso}>
                  <Feather name="check-circle" size={26} color={colors.accentGreen} />
                  <Text style={styles.avisoTexto}>
                    {filtro === 'baixo'
                      ? 'Nenhum remédio acabando. Tudo em dia.'
                      : 'Nenhuma validade vencendo nos próximos 30 dias.'}
                  </Text>
                </SurfaceCard>
              ) : (
                visiveis.map((m) => (
                  <CartaoDeEstoque
                    key={m.id}
                    medicamento={m}
                    estoque={m.stock}
                    agora={agora}
                    mostrarPerfil={perfilId === null}
                    aberto={aberto === m.id}
                    onAlternar={() => void abrirCompras(m)}
                    compras={compras[m.id] ?? null}
                    erroCompras={aberto === m.id ? erroCompras : null}
                    onTentarCompras={() => {
                      setAberto(null);
                      void abrirCompras(m);
                    }}
                    removendo={removendo}
                    onRemoverCompra={(e) => void removerCompra(m, e)}
                    onRegistrarCompra={() => router.push(`/remedios/compra?id=${m.id}`)}
                  />
                ))
              )}
            </View>

            {ultimoLocal ? (
              <SurfaceCard style={styles.local}>
                <IconTile {...LADRILHO_NEUTRO} icone={ICONES.farmacia} size={54} />
                <View style={styles.localTextos}>
                  <Text style={styles.cartaoTitulo}>Onde foi adquirido?</Text>
                  <Text style={styles.cartaoDescricao} numberOfLines={2}>
                    {ultimoLocal.local}
                  </Text>
                </View>
              </SurfaceCard>
            ) : null}

            <BotaoAdicionar onPress={() => router.push('/remedios/compra')} />
          </>
        )}

        {!carregando && !erro ? (
          <SurfaceCard style={styles.local}>
            <IconTile {...LADRILHO_NEUTRO} icone="bell" />
            <View style={styles.localTextos}>
              <Text style={styles.cartaoTitulo}>Lembrete de compra</Text>
              <Text style={styles.cartaoDescricao}>
                {mestra
                  ? 'Avisar neste aparelho quando o estoque estiver baixo'
                  : 'Notificações desligadas nos Ajustes'}
              </Text>
            </View>
            <Switch
              value={lembrete && mestra}
              onValueChange={(v) => void alternarLembrete(v)}
              disabled={!mestra}
              trackColor={{ true: colors.switchOn, false: colors.starEmpty }}
              thumbColor={colors.surface}
              ios_backgroundColor={colors.starEmpty}
              accessibilityLabel="Lembrete de compra neste aparelho"
            />
          </SurfaceCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * Agenda (ou cancela) o lembrete com os baixos da lista.
 *
 * Falhar aqui e conveniencia perdida, nao erro de tela — por isso engole.
 */
async function reconciliar(lista: Medication[], ligado: boolean) {
  try {
    const baixos = ligado
      ? lista.filter((m) => m.isActive && m.stock && estoqueBaixo(m, m.stock))
      : [];
    await reconciliarLembreteDeCompra(baixos);
  } catch {
    // silencio de proposito: ver o comentario acima.
  }
}

function BotaoAdicionar({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.adicionar, pressed && styles.pressionado]}
    >
      <Feather name="plus" size={20} color={colors.onAccent} />
      <Text style={styles.adicionarTexto}>Adicionar medicamento ao estoque</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  conteudo: { paddingHorizontal: spacing.xl },
  seletor: { marginTop: spacing.lg },
  carregando: { marginTop: spacing.xxl },
  resumo: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  chips: { marginTop: spacing.lg },
  secao: { marginTop: spacing.xl },

  aviso: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.xl },
  vazioTitulo: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.sectionTitle,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  avisoTexto: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  tentarDeNovo: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.accentGreen,
    marginTop: spacing.md,
  },

  local: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  localTextos: { flex: 1 },
  cartaoTitulo: { fontFamily: fonts.bold, fontSize: 16, color: colors.sectionTitle },
  cartaoDescricao: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },

  adicionar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    marginTop: spacing.lg,
  },
  adicionarTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },
  pressionado: { opacity: 0.85 },
});
