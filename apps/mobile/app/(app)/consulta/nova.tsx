import { Feather } from '@expo/vector-icons';
import { addDays, format, setHours, setMinutes } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { healthApi, type Profile, type Professional } from '@/api/health';
import { Avatar } from '@/components/Avatar';
import { DateTimePickerCard } from '@/components/DateTimePickerCard';
import { FormField } from '@/components/FormField';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';

/** Antecedencias de lembrete oferecidas. null = sem lembrete. */
const LEMBRETES: Array<{ minutos: number | null; rotulo: string }> = [
  { minutos: null, rotulo: 'Sem lembrete' },
  { minutos: 60, rotulo: '1 hora antes' },
  { minutos: 180, rotulo: '3 horas antes' },
  { minutos: 1440, rotulo: '1 dia antes' },
  { minutos: 2880, rotulo: '2 dias antes' },
];

/** Amanha as 9h: aposta razoavel que evita comecar num horario invalido. */
function padraoInicial(): Date {
  return setMinutes(setHours(addDays(new Date(), 1), 9), 0);
}

export default function NovaConsultaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { professionalId } = useLocalSearchParams<{ professionalId?: string }>();

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [medicos, setMedicos] = useState<Professional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erroPerfil, setErroPerfil] = useState<string | undefined>();

  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [medicoId, setMedicoId] = useState<string | null>(professionalId ?? null);
  const [quando, setQuando] = useState<Date>(padraoInicial);
  const [modalidade, setModalidade] = useState<'presencial' | 'teleconsulta'>('presencial');
  const [local, setLocal] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [lembrete, setLembrete] = useState<number | null>(1440);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [p, m] = await Promise.all([
          healthApi.listProfiles(),
          healthApi.listProfessionals(),
        ]);
        if (cancelado) return;
        setPerfis(p);
        setMedicos(m);
        // O titular vem primeiro da API; e o palpite mais provavel.
        setPerfilId((atual) => atual ?? p[0]?.id ?? null);
      } catch (e) {
        if (!cancelado) {
          setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  // Ao escolher o medico, herda a modalidade e o consultorio dele.
  useEffect(() => {
    const m = medicos.find((x) => x.id === medicoId);
    if (!m) return;
    if (m.defaultModality) setModalidade(m.defaultModality);
    if (m.clinicName && !local) setLocal(m.clinicName);
  }, [medicoId, medicos, local]);

  async function salvar() {
    if (salvando) return;
    setErroGeral(null);

    if (!perfilId) {
      setErroPerfil('Escolha para quem é a consulta');
      return;
    }
    setErroPerfil(undefined);

    setSalvando(true);
    try {
      const medico = medicos.find((m) => m.id === medicoId);

      await healthApi.createAppointment({
        profileId: perfilId,
        professionalId: medicoId,
        // toISOString devolve o instante em UTC. O servidor guarda em
        // timestamptz, entao a hora local escolhida e preservada de verdade.
        scheduledAt: quando.toISOString(),
        modality: modalidade,
        location: local.trim() || null,
        address: medico?.address ?? null,
        reminderMinutesBefore: lembrete,
        notes: observacoes.trim() || null,
      });

      router.back();
    } catch (e) {
      setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={styles.tela}>
      <LinearGradient
        colors={[colors.homeBackgroundTop, colors.homeBackgroundBottom]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl * 2 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Nova consulta" onBack={() => router.back()} />

        {carregando ? (
          <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
        ) : (
          <>
            <SurfaceCard style={styles.bloco}>
              <Text style={styles.blocoTitulo}>Para quem</Text>
              <View style={styles.pessoas}>
                {perfis.map((p) => {
                  const ativo = p.id === perfilId;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setPerfilId(p.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: ativo }}
                      style={styles.pessoa}
                    >
                      <Avatar
                        nome={p.fullName}
                        color={p.avatarColor ?? undefined}
                        size={52}
                        selected={ativo}
                      />
                      <Text style={[styles.pessoaNome, ativo && styles.pessoaNomeAtivo]} numberOfLines={1}>
                        {p.fullName.split(' ')[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {erroPerfil ? <Text style={styles.erroCampo}>{erroPerfil}</Text> : null}
            </SurfaceCard>

            <SurfaceCard style={styles.bloco}>
              <Text style={styles.blocoTitulo}>Com qual médico</Text>
              {medicos.length === 0 ? (
                <Text style={styles.blocoAjuda}>
                  Você ainda não cadastrou médicos. A consulta pode ser criada sem um.
                </Text>
              ) : (
                <View style={styles.medicos}>
                  {medicos.map((m) => {
                    const ativo = m.id === medicoId;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => setMedicoId(ativo ? null : m.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: ativo }}
                        style={[styles.medico, ativo && styles.medicoAtivo]}
                      >
                        <Text
                          style={[styles.medicoNome, ativo && styles.medicoNomeAtivo]}
                          numberOfLines={1}
                        >
                          {m.name}
                        </Text>
                        {m.specialty ? (
                          <Text
                            style={[styles.medicoEsp, ativo && styles.medicoEspAtivo]}
                            numberOfLines={1}
                          >
                            {m.specialty}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </SurfaceCard>

            <SurfaceCard style={styles.bloco}>
              <Text style={styles.blocoTitulo}>Quando</Text>
              <Text style={styles.blocoAjuda}>{format(quando, "dd/MM/yyyy 'às' HH:mm")}</Text>
              <DateTimePickerCard value={quando} onChange={setQuando} />
            </SurfaceCard>

            <SurfaceCard style={styles.bloco}>
              <Text style={styles.blocoTitulo}>Lembrete</Text>
              <Text style={styles.blocoAjuda}>
                O aviso é agendado neste aparelho. Se você trocar de celular, precisará abrir o
                app nele para o lembrete existir lá também.
              </Text>
              <View style={styles.lembretes}>
                {LEMBRETES.map((l) => {
                  const ativo = l.minutos === lembrete;
                  return (
                    <Pressable
                      key={l.rotulo}
                      onPress={() => setLembrete(l.minutos)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: ativo }}
                      style={[styles.lembrete, ativo && styles.lembreteAtivo]}
                    >
                      <Text style={[styles.lembreteTexto, ativo && styles.lembreteTextoAtivo]}>
                        {l.rotulo}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </SurfaceCard>

            <SurfaceCard style={styles.bloco}>
              <View style={styles.modalidades}>
                {(['presencial', 'teleconsulta'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setModalidade(m)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: modalidade === m }}
                    style={[styles.modalidade, modalidade === m && styles.modalidadeAtiva]}
                  >
                    <Feather
                      name={m === 'teleconsulta' ? 'video' : 'map-pin'}
                      size={16}
                      color={modalidade === m ? colors.onAccent : colors.sectionTitle}
                    />
                    <Text
                      style={[
                        styles.modalidadeTexto,
                        modalidade === m && styles.modalidadeTextoAtivo,
                      ]}
                    >
                      {m === 'teleconsulta' ? 'Teleconsulta' : 'Presencial'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <FormField
                label="Local"
                value={local}
                onChangeText={setLocal}
                placeholder="Clínica Vida"
                editable={!salvando}
                containerStyle={styles.campoEspacado}
              />
              <FormField
                label="Observações"
                value={observacoes}
                onChangeText={setObservacoes}
                placeholder="Levar exames anteriores…"
                multiline
                editable={!salvando}
                containerStyle={styles.ultimoCampo}
              />
            </SurfaceCard>

            {erroGeral ? <Text style={styles.erroGeral}>{erroGeral}</Text> : null}

            <Pressable
              onPress={salvar}
              disabled={salvando}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.salvar,
                (pressed || salvando) && styles.salvarPressionado,
              ]}
            >
              {salvando ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.salvarTexto}>Marcar consulta</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.homeBackgroundTop },
  conteudo: { paddingHorizontal: spacing.xl },
  carregando: { marginTop: spacing.xxl * 2 },
  bloco: { marginTop: spacing.xl },
  blocoTitulo: { fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  blocoAjuda: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  pessoas: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.lg },
  pessoa: { alignItems: 'center', width: 68 },
  pessoaNome: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  pessoaNomeAtivo: { fontFamily: fonts.bold, color: colors.accentGreen },
  medicos: { gap: spacing.sm, marginTop: spacing.lg },
  medico: {
    borderRadius: radii.card - 10,
    borderWidth: 1,
    borderColor: 'rgba(57, 67, 44, 0.12)',
    backgroundColor: colors.onAccent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  medicoAtivo: { backgroundColor: colors.accentGreen, borderColor: colors.accentGreen },
  medicoNome: { fontFamily: fonts.semibold, fontSize: 15, color: colors.sectionTitle },
  medicoNomeAtivo: { color: colors.onAccent },
  medicoEsp: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  medicoEspAtivo: { color: 'rgba(255,255,255,0.85)' },
  lembretes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  lembrete: {
    borderRadius: radii.pill,
    backgroundColor: colors.onAccent,
    borderWidth: 1,
    borderColor: 'rgba(57, 67, 44, 0.12)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  lembreteAtivo: { backgroundColor: colors.accentGreen, borderColor: colors.accentGreen },
  lembreteTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.sectionTitle },
  lembreteTextoAtivo: { color: colors.onAccent },
  modalidades: { flexDirection: 'row', gap: spacing.md },
  modalidade: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.onAccent,
    borderWidth: 1,
    borderColor: 'rgba(57, 67, 44, 0.12)',
  },
  modalidadeAtiva: { backgroundColor: colors.accentGreen, borderColor: colors.accentGreen },
  modalidadeTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.sectionTitle },
  modalidadeTextoAtivo: { color: colors.onAccent },
  campoEspacado: { marginTop: spacing.xl },
  ultimoCampo: { marginBottom: 0 },
  erroCampo: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textError,
    marginTop: spacing.md,
  },
  erroGeral: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textError,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  salvar: {
    backgroundColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  salvarPressionado: { opacity: 0.85 },
  salvarTexto: { fontFamily: fonts.bold, fontSize: 17, color: colors.onAccent },
});
