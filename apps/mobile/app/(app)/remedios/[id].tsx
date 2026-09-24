import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { healthApi, type Dose, type Medication } from '@/api/health';
import { Avatar } from '@/components/Avatar';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { descricaoDoHorario, hora, posologia, tituloDoMedicamento } from '@/lib/posologia';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/**
 * Detalhe do medicamento, com o historico de doses.
 *
 * O historico e a razao de esta tela existir em vez de a seta abrir direto a
 * edicao: num aplicativo de cuidado, ver QUANDO cada dose foi tomada, e por
 * quem, e o que evita a dose dobrada quando mais de um adulto cuida da mesma
 * pessoa.
 */
export default function MedicamentoDetalheScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [m, setM] = useState<Medication | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setM(await healthApi.getMedication(id!));
    } catch (e) {
      setErro(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  function encerrar() {
    if (!m) return;
    Alert.alert(
      m.isActive ? 'Encerrar tratamento?' : 'Retomar tratamento?',
      m.isActive
        ? 'O remédio sai da lista de hoje, mas o histórico de doses continua guardado.'
        : 'O remédio volta a aparecer na lista de hoje.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: m.isActive ? 'Encerrar' : 'Retomar',
          onPress: async () => {
            try {
              setM(await healthApi.updateMedication(m.id, { isActive: !m.isActive }));
            } catch (e) {
              Alert.alert(
                'Não consegui salvar',
                messageForError(e instanceof ApiRequestError ? e.code : undefined),
              );
            }
          },
        },
      ],
    );
  }

  function apagar() {
    if (!m) return;
    // Segunda confirmacao, e o texto diz a consequencia: a cascata do banco
    // leva TODO o registro de doses junto, e isso e dado clinico. Por isso
    // "Encerrar tratamento" e a acao primaria, e nao esta.
    Alert.alert(
      'Apagar o remédio?',
      `Apaga ${tituloDoMedicamento(m)} e também o registro de todas as doses já tomadas. Não dá para desfazer.\n\nSe a intenção é só parar de tomar, use "Encerrar tratamento".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar tudo',
          style: 'destructive',
          onPress: async () => {
            try {
              await healthApi.deleteMedication(m.id);
              router.back();
            } catch (e) {
              Alert.alert(
                'Não consegui apagar',
                messageForError(e instanceof ApiRequestError ? e.code : undefined),
              );
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.medications} />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Medicamento" onBack={() => router.back()} />

        {carregando ? (
          <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
        ) : erro || !m ? (
          <SurfaceCard style={styles.aviso}>
            <Feather name="alert-circle" size={26} color={colors.textError} />
            <Text style={styles.avisoTexto}>{erro ?? 'Remédio não encontrado.'}</Text>
          </SurfaceCard>
        ) : (
          <>
            <SurfaceCard style={styles.bloco}>
              <View style={styles.cabecalho}>
                <Avatar
                  nome={m.profileName ?? '?'}
                  color={m.profileColor ?? undefined}
                  recyclingKey={m.profileId}
                  size={44}
                />
                <View style={styles.cabecalhoTextos}>
                  <Text style={styles.nome}>{tituloDoMedicamento(m)}</Text>
                  <Text style={styles.subtitulo}>
                    {m.profileName ? `${m.profileName} · ` : ''}
                    {posologia(m)}
                  </Text>
                </View>
              </View>

              {!m.isActive ? (
                <View style={styles.selo}>
                  <Feather name="pause-circle" size={14} color={colors.textSecondary} />
                  <Text style={styles.seloTexto}>Tratamento encerrado</Text>
                </View>
              ) : null}

              <Linha rotulo="Como tomar" valor={descricaoDoHorario(m)} />
              {m.times.length > 0 ? <Linha rotulo="Horários" valor={m.times.join(' · ')} /> : null}
              {m.instructions ? <Linha rotulo="Orientações" valor={m.instructions} /> : null}
              {m.prescriberName ? <Linha rotulo="Receitado por" valor={m.prescriberName} /> : null}
              {m.startsAt ? <Linha rotulo="Início" valor={dataLonga(m.startsAt)} /> : null}
              {m.endsAt ? <Linha rotulo="Fim previsto" valor={dataLonga(m.endsAt)} /> : null}
            </SurfaceCard>

            <SurfaceCard style={styles.bloco}>
              <Text style={styles.blocoTitulo}>Histórico de doses</Text>
              {m.doses.length === 0 ? (
                <Text style={styles.blocoAjuda}>Nenhuma dose registrada ainda.</Text>
              ) : (
                m.doses.map((d) => <LinhaDeDose key={d.id} dose={d} />)
              )}
            </SurfaceCard>

            <Pressable
              onPress={() => router.push(`/medicamento/form/${m.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.editar, pressed && styles.pressionado]}
            >
              <Feather name="edit-2" size={18} color={colors.onAccent} />
              <Text style={styles.editarTexto}>Editar</Text>
            </Pressable>

            <Pressable onPress={encerrar} accessibilityRole="button" style={styles.secundario}>
              <Text style={styles.secundarioTexto}>
                {m.isActive ? 'Encerrar tratamento' : 'Retomar tratamento'}
              </Text>
            </Pressable>

            <Pressable onPress={apagar} accessibilityRole="button" style={styles.secundario}>
              <Text style={styles.apagarTexto}>Apagar remédio e histórico</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text style={styles.linhaValor}>{valor}</Text>
    </View>
  );
}

function LinhaDeDose({ dose }: { dose: Dose }) {
  const quando = dose.takenAt ?? dose.scheduledFor;
  const pulada = dose.status === 'pulada';

  return (
    <View style={styles.dose}>
      <Feather
        name={pulada ? 'slash' : 'check-circle'}
        size={16}
        color={pulada ? colors.textSecondary : colors.doseTaken}
      />
      <Text style={styles.doseTexto}>
        {quando ? `${dataLonga(quando)} às ${hora(new Date(quando))}` : 'Sem data'}
        {pulada ? ' · pulada' : ''}
      </Text>
    </View>
  );
}

function dataLonga(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  conteudo: { paddingHorizontal: spacing.xl },
  carregando: { marginTop: spacing.xxl },
  bloco: { marginTop: spacing.xl },
  blocoTitulo: { fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  blocoAjuda: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  cabecalhoTextos: { flex: 1 },
  nome: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.sectionTitle },
  subtitulo: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 1,
  },
  selo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  seloTexto: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary },
  linha: { marginTop: spacing.lg },
  linhaRotulo: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary },
  linhaValor: { fontFamily: fonts.regular, fontSize: 15, color: colors.textPrimary, marginTop: 2 },
  dose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  doseTexto: { fontFamily: fonts.regular, fontSize: 14, color: colors.textPrimary },
  editar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
  },
  pressionado: { opacity: 0.85 },
  editarTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },
  secundario: { alignItems: 'center', paddingVertical: spacing.lg },
  secundarioTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen },
  apagarTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textError },
  aviso: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.xl },
  avisoTexto: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
