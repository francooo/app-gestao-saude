import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import {
  healthApi,
  type Medication,
  type Professional,
  type Profile,
  type ScheduleType,
} from '@/api/health';
import { FormField } from '@/components/FormField';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/** As formas que o servidor aceita. Precisa bater com medicationFormValues. */
const FORMAS = ['cápsula', 'comprimido', 'ml', 'gotas', 'outro'] as const;

/** Intervalos oferecidos. Cobrem a receita comum sem virar campo livre. */
const INTERVALOS = [4, 6, 8, 12, 24] as const;

const TIPOS: { valor: ScheduleType; rotulo: string; ajuda: string }[] = [
  { valor: 'interval', rotulo: 'A cada X horas', ajuda: 'Ex.: de 8 em 8 horas' },
  { valor: 'fixed_times', rotulo: 'Horários fixos', ajuda: 'Ex.: 08:00 e 20:00' },
  { valor: 'as_needed', rotulo: 'Se necessário', ajuda: 'Sem horário, só quando precisar' },
];

export default function MedicamentoFormScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const novo = id === 'novo';

  const [carregando, setCarregando] = useState(!novo);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [medicos, setMedicos] = useState<Professional[]>([]);

  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [concentracao, setConcentracao] = useState('');
  const [forma, setForma] = useState<(typeof FORMAS)[number]>('cápsula');
  const [quantidade, setQuantidade] = useState('1');
  const [tipo, setTipo] = useState<ScheduleType>('interval');
  const [intervalo, setIntervalo] = useState<number>(8);
  const [horarios, setHorarios] = useState<string[]>(['08:00']);
  const [instrucoes, setInstrucoes] = useState('');
  const [prescritorId, setPrescritorId] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [listaPerfis, listaMedicos] = await Promise.all([
          healthApi.listProfiles(),
          healthApi.listProfessionals(),
        ]);
        if (cancelado) return;
        setPerfis(listaPerfis);
        setMedicos(listaMedicos);
        // Titular como padrao: e quem mais cadastra remedio para si.
        if (novo) setPerfilId(listaPerfis.find((p) => p.isAccountHolder)?.id ?? listaPerfis[0]?.id ?? null);

        if (!novo) {
          const m = await healthApi.getMedication(id!);
          if (cancelado) return;
          preencher(m);
        }
      } catch (e) {
        if (!cancelado) setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [id, novo]);

  function preencher(m: Medication) {
    setPerfilId(m.profileId);
    setNome(m.name);
    setConcentracao(m.strength ?? '');
    setForma((FORMAS as readonly string[]).includes(m.form ?? '') ? (m.form as (typeof FORMAS)[number]) : 'outro');
    setQuantidade(m.doseAmount != null ? String(m.doseAmount) : '');
    setTipo(m.scheduleType);
    setIntervalo(m.intervalHours ?? 8);
    setHorarios(m.times.length > 0 ? m.times : ['08:00']);
    setInstrucoes(m.instructions ?? '');
    setPrescritorId(m.prescriberId ?? null);
  }

  function mudarHorario(indice: number, valor: string) {
    // Aceita "8", "830", "08:30" e normaliza enquanto se digita.
    const digitos = valor.replace(/\D/g, '').slice(0, 4);
    const texto = digitos.length <= 2 ? digitos : `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
    setHorarios((atual) => atual.map((h, i) => (i === indice ? texto : h)));
  }

  function validar(): boolean {
    const novos: Record<string, string> = {};
    if (nome.trim().length < 2) novos.nome = 'Informe o nome do remédio';
    if (!perfilId) novos.perfil = 'Escolha para quem é';

    if (tipo === 'fixed_times') {
      const validos = horarios.filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h));
      if (validos.length === 0) novos.horarios = 'Informe ao menos um horário, como 08:00';
      else if (new Set(validos).size !== validos.length) novos.horarios = 'Há horários repetidos';
    }

    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function salvar() {
    setErroGeral(null);
    if (!validar()) return;

    const quantidadeNumero = Number(quantidade.replace(',', '.'));

    const dados = {
      name: nome.trim(),
      strength: concentracao.trim() || null,
      form: forma,
      doseAmount: Number.isFinite(quantidadeNumero) && quantidadeNumero > 0 ? quantidadeNumero : null,
      doseUnit: forma === 'outro' ? null : forma,
      scheduleType: tipo,
      // Campos de um tipo precisam ser LIMPOS ao trocar de tipo, senao o
      // servidor recusa com "horários fixos só valem para esse tipo".
      intervalHours: tipo === 'interval' ? intervalo : null,
      times: tipo === 'fixed_times' ? horarios.filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h)) : [],
      instructions: instrucoes.trim() || null,
      prescriberId: prescritorId,
    };

    setSalvando(true);
    try {
      if (novo) await healthApi.createMedication({ ...dados, profileId: perfilId! });
      else await healthApi.updateMedication(id!, dados);
      router.back();
    } catch (e) {
      if (e instanceof ApiRequestError && e.fields) setErros(e.fields);
      setErroGeral(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.medications} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.conteudo,
            { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl * 2 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader
            title={novo ? 'Novo remédio' : 'Editar remédio'}
            onBack={() => router.back()}
          />

          {carregando ? (
            <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
          ) : (
            <>
              <SurfaceCard style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Para quem</Text>
                <View style={styles.chips}>
                  {perfis.map((p) => (
                    <Chip
                      key={p.id}
                      rotulo={p.fullName.split(' ')[0]!}
                      ativo={p.id === perfilId}
                      // Mudar de perfil orfanaria o historico de doses, entao
                      // o servidor ignora o campo no PATCH — a tela nem oferece.
                      desabilitado={!novo || salvando}
                      onPress={() => setPerfilId(p.id)}
                    />
                  ))}
                </View>
                {erros.perfil ? <Text style={styles.erroCampo}>{erros.perfil}</Text> : null}
                {!novo ? (
                  <Text style={styles.blocoAjuda}>
                    Não dá para mudar de pessoa depois: o histórico de doses ficaria da pessoa
                    errada. Cadastre um remédio novo.
                  </Text>
                ) : null}
              </SurfaceCard>

              <SurfaceCard style={styles.bloco}>
                <FormField
                  label="Nome"
                  value={nome}
                  onChangeText={setNome}
                  placeholder="Amoxicilina"
                  error={erros.nome ?? erros.name}
                  autoCapitalize="words"
                  editable={!salvando}
                />
                <FormField
                  label="Concentração"
                  value={concentracao}
                  onChangeText={setConcentracao}
                  placeholder="500mg"
                  hint="Como está escrito na caixa"
                  error={erros.strength}
                  editable={!salvando}
                />

                <Text style={styles.rotulo}>Forma</Text>
                <View style={styles.chips}>
                  {FORMAS.map((f) => (
                    <Chip key={f} rotulo={f} ativo={f === forma} desabilitado={salvando} onPress={() => setForma(f)} />
                  ))}
                </View>

                <FormField
                  label="Quantidade por dose"
                  value={quantidade}
                  onChangeText={setQuantidade}
                  placeholder="1"
                  keyboardType="decimal-pad"
                  hint={forma === 'outro' ? undefined : `Em ${forma}`}
                  error={erros.doseAmount}
                  editable={!salvando}
                />
              </SurfaceCard>

              <SurfaceCard style={styles.bloco}>
                <Text style={styles.blocoTitulo}>Quando tomar</Text>
                <View style={styles.tipos}>
                  {TIPOS.map((t) => (
                    <Pressable
                      key={t.valor}
                      onPress={() => setTipo(t.valor)}
                      disabled={salvando}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: t.valor === tipo }}
                      style={[styles.tipo, t.valor === tipo && styles.tipoAtivo]}
                    >
                      <Feather
                        name={t.valor === tipo ? 'check-circle' : 'circle'}
                        size={18}
                        color={t.valor === tipo ? colors.accentGreen : colors.textSecondary}
                      />
                      <View style={styles.flex}>
                        <Text style={[styles.tipoNome, t.valor === tipo && styles.tipoNomeAtivo]}>
                          {t.rotulo}
                        </Text>
                        <Text style={styles.tipoAjuda}>{t.ajuda}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>

                {tipo === 'interval' ? (
                  <>
                    <Text style={styles.rotulo}>De quantas em quantas horas</Text>
                    <View style={styles.chips}>
                      {INTERVALOS.map((h) => (
                        <Chip
                          key={h}
                          rotulo={h === 24 ? '1x ao dia' : `${h}h`}
                          ativo={h === intervalo}
                          desabilitado={salvando}
                          onPress={() => setIntervalo(h)}
                        />
                      ))}
                    </View>
                    {erros.intervalHours ? (
                      <Text style={styles.erroCampo}>{erros.intervalHours}</Text>
                    ) : null}
                  </>
                ) : null}

                {tipo === 'fixed_times' ? (
                  <>
                    <Text style={styles.rotulo}>Horários</Text>
                    {horarios.map((h, i) => (
                      <View key={i} style={styles.horarioLinha}>
                        <View style={styles.flex}>
                          <FormField
                            label=""
                            value={h}
                            onChangeText={(v) => mudarHorario(i, v)}
                            placeholder="08:00"
                            keyboardType="number-pad"
                            maxLength={5}
                            editable={!salvando}
                          />
                        </View>
                        {horarios.length > 1 ? (
                          <Pressable
                            onPress={() => setHorarios((a) => a.filter((_, j) => j !== i))}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={`Remover o horário ${h}`}
                          >
                            <Feather name="x-circle" size={22} color={colors.textError} />
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                    {erros.horarios || erros.times ? (
                      <Text style={styles.erroCampo}>{erros.horarios ?? erros.times}</Text>
                    ) : null}
                    {horarios.length < 8 ? (
                      <Pressable
                        onPress={() => setHorarios((a) => [...a, ''])}
                        disabled={salvando}
                        accessibilityRole="button"
                        style={styles.maisHorario}
                      >
                        <Feather name="plus" size={18} color={colors.accentGreen} />
                        <Text style={styles.maisHorarioTexto}>Adicionar horário</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}
              </SurfaceCard>

              <SurfaceCard style={styles.bloco}>
                <FormField
                  label="Orientações"
                  value={instrucoes}
                  onChangeText={setInstrucoes}
                  placeholder="Tomar com um copo de água, após as refeições."
                  multiline
                  editable={!salvando}
                />

                {medicos.length > 0 ? (
                  <>
                    <Text style={styles.rotulo}>Quem receitou</Text>
                    <View style={styles.chips}>
                      {medicos.map((md) => (
                        <Chip
                          key={md.id}
                          rotulo={md.name}
                          ativo={md.id === prescritorId}
                          desabilitado={salvando}
                          onPress={() => setPrescritorId(prescritorId === md.id ? null : md.id)}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
              </SurfaceCard>

              {erroGeral ? <Text style={styles.erroGeral}>{erroGeral}</Text> : null}

              <Pressable
                onPress={() => void salvar()}
                disabled={salvando}
                accessibilityRole="button"
                style={({ pressed }) => [styles.salvar, pressed && styles.pressionado]}
              >
                {salvando ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.salvarTexto}>{novo ? 'Cadastrar remédio' : 'Salvar'}</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Chip({
  rotulo,
  ativo,
  desabilitado,
  onPress,
}: {
  rotulo: string;
  ativo: boolean;
  desabilitado?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo, disabled: desabilitado }}
      style={[styles.chip, ativo && styles.chipAtivo, desabilitado && !ativo && styles.chipApagado]}
    >
      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]} numberOfLines={1}>
        {rotulo}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  flex: { flex: 1 },
  conteudo: { paddingHorizontal: spacing.xl },
  carregando: { marginTop: spacing.xxl },
  bloco: { marginTop: spacing.xl },
  blocoTitulo: { fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  blocoAjuda: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  rotulo: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    backgroundColor: colors.chipMore,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  chipAtivo: { backgroundColor: colors.chipActive },
  chipApagado: { opacity: 0.5 },
  chipTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.sectionTitle },
  chipTextoAtivo: { color: colors.onAccent },
  tipos: { marginTop: spacing.md, gap: spacing.sm },
  tipo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card - 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tipoAtivo: { borderColor: colors.accentGreen, backgroundColor: colors.chipMore },
  tipoNome: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  tipoNomeAtivo: { color: colors.sectionTitle },
  tipoAjuda: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  horarioLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  maisHorario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  maisHorarioTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen },
  erroCampo: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textError, marginTop: spacing.sm },
  erroGeral: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.textError,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  salvar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
    minHeight: 56,
  },
  pressionado: { opacity: 0.85 },
  salvarTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },
});
