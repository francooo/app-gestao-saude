import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppointmentCard } from '@/components/AppointmentCard';
import { AssistantCard } from '@/components/AssistantCard';
import { FamilyMemberStrip } from '@/components/FamilyMemberStrip';
import { HomeHeaderCard } from '@/components/HomeHeaderCard';
import { MedicationCard } from '@/components/MedicationCard';
import { SectionHeader } from '@/components/SectionHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { CONSULTAS_EXEMPLO, USANDO_DADOS_DE_EXEMPLO } from '@/mocks/home';
import { healthApi, type Medication, type Profile } from '@/api/health';
import { vigenteHoje } from '@/lib/posologia';
import { reconciliarLembretes } from '@/lib/reminders';
import { colors, fonts, radii, spacing } from '@/theme';

/** Altura da barra de abas flutuante, para o conteudo nao terminar embaixo dela. */
const ESPACO_BARRA = 96;

export default function InicioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [medicamentos, setMedicamentos] = useState<Medication[]>([]);
  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [carregandoPerfis, setCarregandoPerfis] = useState(true);
  const [erroPerfis, setErroPerfis] = useState(false);
  /**
   * Fixado a cada carga, e nao lido a toda renderizacao: sem isso, "proxima
   * dose" poderia mudar no meio de um quadro e a tela discordaria de si mesma.
   */
  const [agora, setAgora] = useState(() => new Date());

  /**
   * Reconcilia os lembretes deste aparelho a cada vez que a tela inicial
   * ganha foco.
   *
   * O banco guarda a intencao (reminderMinutesBefore); o agendamento vive
   * aqui. Sem esta reconciliacao, uma consulta criada em outro aparelho nunca
   * viraria notificacao neste — e uma consulta apagada deixaria o aviso orfao
   * tocando.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelado = false;
      (async () => {
        try {
          const referencia = new Date();
          const [consultas, remedios] = await Promise.all([
            healthApi.listAppointments({ upcoming: true }),
            // Ate amanha: um remedio de 12 em 12 horas tomado a noite tem a
            // proxima dose depois da meia-noite.
            healthApi.listMedications({
              from: startOfDay(referencia),
              to: endOfDay(addDays(referencia, 1)),
            }),
          ]);
          if (cancelado) return;

          setAgora(referencia);
          setMedicamentos(remedios);

          await reconciliarLembretes(
            consultas.map((c) => ({
              id: c.id,
              scheduledAt: c.scheduledAt,
              reminderMinutesBefore: c.reminderMinutesBefore,
              profileName: c.profileName,
              professionalName: c.professionalName,
            })),
          );
        } catch {
          // Lembrete e conveniencia: falhar aqui nao pode atrapalhar a tela.
        }
      })();
      return () => {
        cancelado = true;
      };
    }, []),
  );

  /**
   * Os perfis tem carga e erro PROPRIOS, fora do bloco acima.
   *
   * Aquele engole todo erro de proposito ("lembrete e conveniencia"), e se os
   * perfis entrassem nele uma falha de rede deixaria a faixa so com o botao
   * Adicionar. Quem ve isso conclui que a familia sumiu e recadastra todo
   * mundo. Em falha, a lista anterior e PRESERVADA — nunca setPerfis([]).
   */
  useFocusEffect(
    useCallback(() => {
      let cancelado = false;
      (async () => {
        try {
          const lista = await healthApi.listProfiles();
          if (cancelado) return;
          setPerfis(lista);
          setErroPerfis(false);
        } catch {
          if (!cancelado) setErroPerfis(true);
        } finally {
          if (!cancelado) setCarregandoPerfis(false);
        }
      })();
      return () => {
        cancelado = true;
      };
    }, []),
  );

  // A home e um resumo: mostra no maximo tres. A lista completa e a aba.
  const deHoje = useMemo(
    () => medicamentos.filter((m) => vigenteHoje(m, agora)).slice(0, 3),
    [medicamentos, agora],
  );

  function emBreve(recurso: string) {
    Alert.alert(recurso, 'Esta parte do aplicativo ainda está sendo construída.');
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
          { paddingTop: insets.top + spacing.md, paddingBottom: ESPACO_BARRA + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {USANDO_DADOS_DE_EXEMPLO ? (
          <View style={styles.faixaDemo}>
            <Text style={styles.faixaDemoTexto}>
              Dados de demonstração — nada aqui é real
            </Text>
          </View>
        ) : null}

        {/* Cabecalho e lista de membros formam um card so, como no mockup. */}
        <SurfaceCard flush>
          <HomeHeaderCard titulo="Bem-vinda de volta" subtitulo="Cuidando de quem você ama" />
          {erroPerfis && perfis.length === 0 ? (
            <Text style={styles.erroFamilia}>
              Não consegui carregar sua família. Puxe para baixo ou tente de novo em instantes.
            </Text>
          ) : (
            <FamilyMemberStrip
              membros={perfis.map((p) => ({
                id: p.id,
                nome: p.fullName,
                cor: p.avatarColor,
                foto: p.photo,
              }))}
              carregando={carregandoPerfis && perfis.length === 0}
              onAbrir={(idPerfil) => router.push(`/membro/${idPerfil}`)}
              onAdicionar={() => router.push('/membro/novo')}
            />
          )}
        </SurfaceCard>

        <View style={styles.secao}>
          <AssistantCard onPress={() => router.push('/assistente')} />
        </View>

        <View style={styles.secao}>
          <SectionHeader
            title="Medicamentos de hoje"
            onVerTodos={() => router.push('/remedios')}
          />
          {deHoje.length === 0 ? (
            <SurfaceCard style={styles.vazio}>
              <Text style={styles.vazioTexto}>
                Nenhum remédio para hoje. Toque em Ver todos para cadastrar.
              </Text>
            </SurfaceCard>
          ) : (
            deHoje.map((m) => (
              <MedicationCard
                key={m.id}
                medicamento={m}
                agora={agora}
                mostrarPerfil
                onPress={() => router.push(`/remedios/${m.id}`)}
              />
            ))
          )}
        </View>

        <View style={styles.secao}>
          <SectionHeader
            title="Próximas consultas"
            onVerTodos={() => router.push('/medicos')}
          />
          {CONSULTAS_EXEMPLO.map((c) => (
            <AppointmentCard
              key={c.id}
              consulta={c}
              onPress={() => emBreve('Detalhe da consulta')}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.homeBackgroundTop },
  conteudo: {
    paddingHorizontal: spacing.xl,
  },
  faixaDemo: {
    backgroundColor: 'rgba(44, 53, 32, 0.28)',
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  faixaDemoTexto: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.onAccent,
  },
  vazio: { padding: spacing.xl, alignItems: 'center' },
  vazioTexto: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  erroFamilia: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  secao: {
    marginTop: spacing.xxl,
  },
});
