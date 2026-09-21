import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppointmentCard } from '@/components/AppointmentCard';
import { AssistantCard } from '@/components/AssistantCard';
import { FamilyMemberStrip } from '@/components/FamilyMemberStrip';
import { HomeHeaderCard } from '@/components/HomeHeaderCard';
import { MedicationCard } from '@/components/MedicationCard';
import { SectionHeader } from '@/components/SectionHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import {
  CONSULTAS_EXEMPLO,
  MEDICAMENTOS_EXEMPLO,
  MEMBROS_EXEMPLO,
  USANDO_DADOS_DE_EXEMPLO,
} from '@/mocks/home';
import { healthApi } from '@/api/health';
import { reconciliarLembretes } from '@/lib/reminders';
import { colors, fonts, radii, spacing } from '@/theme';

/** Altura da barra de abas flutuante, para o conteudo nao terminar embaixo dela. */
const ESPACO_BARRA = 96;

export default function InicioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
          const consultas = await healthApi.listAppointments({ upcoming: true });
          if (cancelado) return;
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

  // A selecao ainda nao filtra nada: sem dominio de dados, nao ha o que
  // filtrar. O estado existe para o strip ter comportamento real ao toque.
  const [selecionadoId, setSelecionadoId] = useState(MEMBROS_EXEMPLO[0]?.id);

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
          <FamilyMemberStrip
            membros={MEMBROS_EXEMPLO}
            selecionadoId={selecionadoId}
            onSelecionar={setSelecionadoId}
            onAdicionar={() => emBreve('Adicionar membro')}
          />
        </SurfaceCard>

        <View style={styles.secao}>
          <AssistantCard onPress={() => emBreve('Assistente de Saúde')} />
        </View>

        <View style={styles.secao}>
          <SectionHeader
            title="Medicamentos de hoje"
            onVerTodos={() => emBreve('Medicamentos')}
          />
          {MEDICAMENTOS_EXEMPLO.map((m) => (
            <MedicationCard
              key={m.id}
              medicamento={m}
              onPress={() => emBreve('Detalhe do medicamento')}
            />
          ))}
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
  secao: {
    marginTop: spacing.xxl,
  },
});
