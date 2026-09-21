import { Feather } from '@expo/vector-icons';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { healthApi, type Medication, type Profile } from '@/api/health';
import { MedicationCard } from '@/components/MedicationCard';
import { ProfileSelector } from '@/components/ProfileSelector';
import { ReminderCard } from '@/components/ReminderCard';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SummaryTile } from '@/components/SummaryTile';
import { SurfaceCard } from '@/components/SurfaceCard';
import { definirLembretesDeDose, lembretesDeDoseLigados } from '@/lib/prefs';
import {
  hora,
  resumoDoDia,
  slotAlvo,
  tituloDoMedicamento,
  vigenteHoje,
  estadoHoje,
} from '@/lib/posologia';
import { reconciliarLembretesDeDose } from '@/lib/reminders';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/** Altura da barra de abas flutuante. */
const ESPACO_BARRA = 96;

export default function RemediosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [medicamentos, setMedicamentos] = useState<Medication[]>([]);
  const [verTodos, setVerTodos] = useState(false);

  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [lembretes, setLembretes] = useState(true);

  /**
   * Fixado a cada carga, e nao lido a cada renderizacao: se cada componente
   * chamasse `new Date()` por conta propria, o resumo e os cards poderiam
   * discordar sobre que horas sao no meio de um quadro.
   */
  const [agora, setAgora] = useState(() => new Date());

  /** Doses cujo POST esta no ar. Ver a nota sobre a corrida em `marcar`. */
  const [emVoo, setEmVoo] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    setErro(null);
    const referencia = new Date();

    try {
      const [listaPerfis, lista] = await Promise.all([
        healthApi.listProfiles(),
        // Ate o fim de amanha: um remedio de 12 em 12 horas tomado a noite tem
        // a proxima dose depois da meia-noite, e ela precisa vir na resposta.
        healthApi.listMedications({
          from: startOfDay(referencia),
          to: endOfDay(addDays(referencia, 1)),
          profileId: perfilId,
          includeInactive: true,
        }),
      ]);

      setPerfis(listaPerfis);
      setMedicamentos(lista);
      setAgora(referencia);
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
      void lembretesDeDoseLigados().then(setLembretes);
    }, [carregar]),
  );

  // Reconcilia os avisos sempre que a lista ou a preferencia mudam. Falhar
  // aqui e conveniencia perdida, nao erro de tela.
  useFocusEffect(
    useCallback(() => {
      void reconciliarLembretesDeDose(lembretes ? medicamentos : []);
    }, [medicamentos, lembretes]),
  );

  const visiveis = useMemo(
    () => (verTodos ? medicamentos : medicamentos.filter((m) => vigenteHoje(m, agora))),
    [medicamentos, verTodos, agora],
  );

  const resumo = useMemo(() => resumoDoDia(medicamentos, agora), [medicamentos, agora]);

  async function alternarLembretes(valor: boolean) {
    setLembretes(valor);
    await definirLembretesDeDose(valor);
    await reconciliarLembretesDeDose(valor ? medicamentos : []);
  }

  /**
   * Marca ou desfaz a dose.
   *
   * O estado vira na hora e volta se a requisicao falhar. Nunca o contrario:
   * num aplicativo de remedio, um "tomado" falso e o pior resultado possivel
   * — por isso tambem nao existe fila para uso offline. Se falhou, tem que
   * parecer que falhou.
   */
  async function marcar(m: Medication) {
    if (emVoo.has(m.id)) return;

    const estado = estadoHoje(m, agora);
    const repetivel = m.scheduleType === 'as_needed';

    if (estado.tipo === 'tomado' && !repetivel) {
      // Desfazer pede confirmacao: e registro clinico, e um toque no bolso nao
      // pode apaga-lo.
      Alert.alert(
        'Desfazer registro?',
        `A dose de ${tituloDoMedicamento(m)} das ${hora(estado.quando)} deixa de constar como tomada.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Desfazer', style: 'destructive', onPress: () => void desfazer(m, estado.dose.id) },
        ],
      );
      return;
    }

    const slot = repetivel ? null : slotAlvo(m, agora);
    if (!repetivel && !slot) return;

    await comBloqueio(m.id, async () => {
      const dose = await healthApi.registerDose(m.id, {
        scheduledFor: slot ? slot.toISOString() : null,
        takenAt: new Date().toISOString(),
        status: 'tomada',
      });
      aplicarDose(m.id, dose);
    });
  }

  async function desfazer(m: Medication, doseId: string) {
    await comBloqueio(m.id, async () => {
      await healthApi.deleteDose(m.id, doseId);
      setMedicamentos((atual) =>
        atual.map((x) =>
          x.id === m.id ? { ...x, doses: x.doses.filter((d) => d.id !== doseId) } : x,
        ),
      );
    });
  }

  /**
   * Segura o id enquanto a requisicao esta no ar.
   *
   * Serve a duas coisas: impede o toque duplo de disparar duas vezes, e marca
   * o card como "enviando". A idempotencia do servidor ja cobriria a duplicata
   * — isto aqui e pela resposta visual.
   */
  async function comBloqueio(id: string, acao: () => Promise<void>) {
    setEmVoo((s) => new Set(s).add(id));
    try {
      await acao();
    } catch (e) {
      Alert.alert(
        'Não consegui registrar',
        messageForError(e instanceof ApiRequestError ? e.code : undefined),
      );
    } finally {
      setEmVoo((s) => {
        const novo = new Set(s);
        novo.delete(id);
        return novo;
      });
    }
  }

  /** Substitui a dose do mesmo horario, em vez de somar: o POST e idempotente. */
  function aplicarDose(medicationId: string, dose: Medication['doses'][number]) {
    setMedicamentos((atual) =>
      atual.map((m) =>
        m.id === medicationId
          ? {
              ...m,
              doses: [...m.doses.filter((d) => d.id !== dose.id), dose],
              lastDoseAt: dose.takenAt ?? m.lastDoseAt,
            }
          : m,
      ),
    );
  }

  const proxima = resumo.proxima;
  const detalheDaProxima = proxima
    ? [
        tituloDoMedicamento(proxima.medicamento),
        // Sem perfil escolhido, "14:00 Amoxicilina" nao diz de quem e.
        perfilId === null ? proxima.medicamento.profileName?.split(' ')[0] : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Nada agendado';

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.medications} />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          {
            paddingTop: insets.top + spacing.md,
            paddingBottom: ESPACO_BARRA + insets.bottom,
          },
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
          title="Medicamentos"
          // Aba nao tem historico para voltar; a seta leva para o Inicio.
          onBack={() => router.replace('/inicio')}
          onNotifications={() => Alert.alert('Notificações', 'Esta parte ainda está sendo construída.')}
          hasNotifications
        />

        <View style={styles.seletor}>
          <ProfileSelector
            profiles={perfis}
            selectedId={perfilId}
            onSelect={setPerfilId}
            tituloDoPainel="Ver remédios de"
          />
        </View>

        {carregando ? (
          <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
        ) : erro ? (
          <SurfaceCard style={styles.aviso}>
            <Feather name="alert-circle" size={26} color={colors.textError} />
            <Text style={styles.avisoTexto}>{erro}</Text>
            <Pressable onPress={() => void carregar()} style={styles.tentarDeNovo}>
              <Text style={styles.tentarDeNovoTexto}>Tentar de novo</Text>
            </Pressable>
          </SurfaceCard>
        ) : (
          <>
            <View style={styles.resumo}>
              <SummaryTile
                icone="sun"
                corDoLadrilho={colors.tileSun}
                rotulo="Hoje"
                valor={`${resumo.dosesTomadas} ${resumo.dosesTomadas === 1 ? 'dose' : 'doses'}`}
                detalhe={`de ${resumo.totalMedicamentos} ${resumo.totalMedicamentos === 1 ? 'remédio' : 'remédios'}`}
              />
              <SummaryTile
                icone="clock"
                corDoLadrilho={colors.tileClock}
                rotulo="Próxima dose"
                valor={proxima ? hora(proxima.quando) : '—'}
                detalhe={detalheDaProxima}
              />
            </View>

            <View style={styles.secao}>
              <SectionHeader
                title={verTodos ? 'Todos os medicamentos' : 'Medicamentos de hoje'}
                icon="leaf"
                onVerTodos={medicamentos.length > 0 ? () => setVerTodos((v) => !v) : undefined}
                verTodosLabel={verTodos ? 'Só hoje' : 'Ver todos'}
              />

              {visiveis.length === 0 ? (
                <SurfaceCard style={styles.aviso}>
                  <Feather name="plus-circle" size={26} color={colors.accentGreen} />
                  <Text style={styles.avisoTexto}>
                    {medicamentos.length === 0
                      ? 'Você ainda não cadastrou nenhum remédio.'
                      : 'Nenhum remédio previsto para hoje. Toque em Ver todos.'}
                  </Text>
                </SurfaceCard>
              ) : (
                visiveis.map((m) => (
                  <MedicationCard
                    key={m.id}
                    medicamento={m}
                    agora={agora}
                    mostrarPerfil={perfilId === null}
                    enviando={emVoo.has(m.id)}
                    onPress={() => router.push(`/medicamento/${m.id}`)}
                    onMarcar={() => void marcar(m)}
                  />
                ))
              )}
            </View>

            <Pressable
              onPress={() => router.push('/medicamento/form/novo')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.adicionar, pressed && styles.adicionarPressionado]}
            >
              <Feather name="plus" size={20} color={colors.onAccent} />
              <Text style={styles.adicionarTexto}>Adicionar medicamento</Text>
            </Pressable>

            <View style={styles.secao}>
              <ReminderCard ligado={lembretes} onChange={(v) => void alternarLembretes(v)} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  conteudo: { paddingHorizontal: spacing.xl },
  seletor: { marginTop: spacing.lg },
  carregando: { marginTop: spacing.xxl },
  resumo: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  secao: { marginTop: spacing.xl },
  aviso: { alignItems: 'center', padding: spacing.xl },
  avisoTexto: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  tentarDeNovo: { marginTop: spacing.lg },
  tentarDeNovoTexto: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.accentGreen,
  },
  adicionar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
  },
  adicionarPressionado: { opacity: 0.85 },
  adicionarTexto: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.onAccent,
  },
});
