import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppointmentCard } from '@/components/AppointmentCard';
import { AssistantCard } from '@/components/AssistantCard';
import { FamilyMemberStrip } from '@/components/FamilyMemberStrip';
import { BotaoDeSino } from '@/components/BotaoDeSino';
import { HomeHeaderCard } from '@/components/HomeHeaderCard';
import { IconTile, LADRILHO_NEUTRO } from '@/components/IconTile';
import { MedicationCard } from '@/components/MedicationCard';
import { SectionHeader } from '@/components/SectionHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { healthApi, type Appointment, type Medication, type Profile } from '@/api/health';
import { hora, vigenteHoje } from '@/lib/posologia';
import { reconciliarLembretes } from '@/lib/reminders';
import { colors, fonts, radii, spacing } from '@/theme';

/** Altura da barra de abas flutuante, para o conteudo nao terminar embaixo dela. */
const ESPACO_BARRA = 96;

export default function InicioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [medicamentos, setMedicamentos] = useState<Medication[]>([]);
  const [consultas, setConsultas] = useState<Appointment[]>([]);
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

          /**
           * So as AGENDADAS.
           *
           * A API filtra apenas por data: consulta CANCELADA no futuro volta
           * na lista. Sem este filtro, a tela mostrava a consulta desmarcada e
           * — pior — o aparelho agendava lembrete para ela.
           */
          const agendadas = consultas.filter((c) => c.status === 'agendada');
          setConsultas(agendadas);

          await reconciliarLembretes(
            agendadas.map((c) => ({
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


  // Tres, como o resto da tela: a lista completa e assunto de outra tela.
  const consultasVisiveis = consultas.slice(0, 3);

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

        {/*
          O sino flutua sobre a faixa ilustrada.

          A Inicio nao usa ScreenHeader — ela tem a ilustracao da mae com o
          bebe, que sangra pela direita. Enfiar um cabecalho aqui so para ter o
          sino custaria a ilustracao; o botao solto, posicionado por cima, sai
          mais barato e nao mexe no desenho.
        */}
        <View style={styles.sino}>
          <BotaoDeSino />
        </View>

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

        {/*
          O card "Sintomas" das acoes rapidas do Assistente NAO virou este
          caminho, e o nome daqui e outro de proposito: la o verbo e conversar
          sobre um sintoma, aqui e anotar um. Sao coisas diferentes, e dois
          botoes com a mesma palavra colidiriam.

          Ladrilho NEUTRO, nunca ambar: nao ter registrado nada hoje nao e
          tarefa pendente, e ambar significa isso em todo o aplicativo.
        */}
        <View style={styles.secao}>
          <Pressable
            onPress={() => router.push('/sintomas')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Diário de sintomas. Anote febre, dor, humor e sono."
            style={({ pressed }) => [pressed && styles.diarioPressionado]}
          >
            <SurfaceCard style={styles.diario}>
              <View style={styles.diarioLinha}>
                <IconTile size={54} icone="activity" {...LADRILHO_NEUTRO} />
                <View style={styles.diarioTextos}>
                  <Text style={styles.diarioTitulo}>Diário de sintomas</Text>
                  <Text style={styles.diarioAjuda}>Anote febre, dor, humor e sono</Text>
                </View>
                <Feather name="chevron-right" size={22} color={colors.accentGreen} />
              </View>
            </SurfaceCard>
          </Pressable>
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
          {consultasVisiveis.length === 0 ? (
            <Text style={styles.semConsultas}>Nenhuma consulta agendada.</Text>
          ) : (
            consultasVisiveis.map((c) => (
              <AppointmentCard
                key={c.id}
                consulta={paraCartao(c)}
                // Nao ha tela de detalhe de consulta. Com medico vinculado, a
                // ficha dele e o destino util; sem ele, o cartao fica inerte —
                // melhor que abrir um aviso de "em construcao".
                onPress={
                  c.professionalId ? () => router.push(`/medico/${c.professionalId}`) : undefined
                }
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Da consulta da API para o formato que o cartao entende.
 *
 * O cartao nasceu no tempo do mock e pede tudo em texto ja formatado. Converter
 * aqui evita mexer num componente que so esta tela usa — se um dia houver uma
 * lista de consultas, o certo e o cartao passar a receber a consulta crua.
 */
function paraCartao(c: Appointment) {
  const quando = new Date(c.scheduledAt);
  const onde = c.location ?? (c.modality === 'teleconsulta' ? 'Teleconsulta' : 'Presencial');

  return {
    id: c.id,
    medico: c.professionalName ?? c.title ?? 'Consulta',
    especialidade: c.professionalSpecialty ?? c.profileName ?? '',
    data: quando.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    hora: hora(quando),
    local: onde,
  };
}

const styles = StyleSheet.create({
  diario: { padding: spacing.lg },
  diarioPressionado: { opacity: 0.85 },
  diarioLinha: { flexDirection: 'row', alignItems: 'center' },
  diarioTextos: { flex: 1, marginLeft: spacing.lg },
  diarioTitulo: { fontFamily: fonts.bold, fontSize: 17, color: colors.sectionTitle },
  diarioAjuda: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  semConsultas: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
  },

  // zIndex para ficar acima do card; alinhado a direita como nas outras telas.
  sino: { alignItems: 'flex-end', marginBottom: -60, zIndex: 1, paddingRight: spacing.sm },

  tela: { flex: 1, backgroundColor: colors.homeBackgroundTop },
  conteudo: {
    paddingHorizontal: spacing.xl,
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
