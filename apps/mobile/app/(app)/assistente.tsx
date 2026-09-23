import { Feather } from '@expo/vector-icons';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import {
  healthApi,
  type Appointment,
  type AssistantMessage,
  type Medication,
  type Profile,
} from '@/api/health';
import { ChatBubble } from '@/components/ChatBubble';
import { ProfileSelector } from '@/components/ProfileSelector';
import { QuickActions } from '@/components/QuickActions';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { montarContexto } from '@/lib/contextoDeSaude';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/** Altura da barra de abas flutuante. */
const ESPACO_BARRA = 96;

/**
 * Assistente de Saude.
 *
 * O escopo e estreito de proposito, e essa decisao estava registrada em tres
 * lugares do codigo antes desta tela existir: ele responde sobre os dados que
 * a familia cadastrou — quais remedios, que horas e a proxima dose, quando e a
 * consulta. Nao indica remedio, nao diz dose, nao interpreta sintoma.
 *
 * O contexto vai PRONTO daqui (ver lib/contextoDeSaude.ts): so este aparelho
 * sabe que horas sao, e "proxima dose" depende disso.
 */
export default function AssistenteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const rolagem = useRef<ScrollView>(null);

  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [medicamentos, setMedicamentos] = useState<Medication[]>([]);
  const [consultas, setConsultas] = useState<Appointment[]>([]);
  const [mensagens, setMensagens] = useState<AssistantMessage[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState('');

  const carregar = useCallback(async () => {
    const agora = new Date();
    try {
      const [listaPerfis, remedios, agenda, historico] = await Promise.all([
        healthApi.listProfiles(),
        healthApi.listMedications({
          from: startOfDay(agora),
          to: endOfDay(addDays(agora, 1)),
          profileId: perfilId,
        }),
        healthApi.listAppointments({ profileId: perfilId, upcoming: true }),
        healthApi.historicoDoAssistente(perfilId),
      ]);

      setPerfis(listaPerfis);
      setMedicamentos(remedios);
      setConsultas(agenda);
      setMensagens(historico);

      // Sem pessoa escolhida o assistente nao tem agenda para consultar, e o
      // titular e quem mais pergunta sobre a propria familia.
      if (!perfilId) {
        setPerfilId(listaPerfis.find((p) => p.isAccountHolder)?.id ?? listaPerfis[0]?.id ?? null);
      }
    } catch {
      // A tela nao morre por isso: o assistente continua respondendo o que
      // der, e a falha aparece quando a pessoa perguntar.
    } finally {
      setCarregando(false);
    }
  }, [perfilId]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  const perfil = useMemo(
    () => perfis.find((p) => p.id === perfilId) ?? null,
    [perfis, perfilId],
  );

  const primeiroNome = perfil?.fullName.split(' ')[0] ?? '';

  async function enviar(pergunta: string) {
    const limpa = pergunta.trim();
    if (limpa.length < 2 || enviando) return;

    setEnviando(true);
    const anterior = texto;
    setTexto('');

    try {
      const novas = await healthApi.perguntarAoAssistente({
        question: limpa,
        profileId: perfilId,
        context: montarContexto(perfil, medicamentos, consultas, new Date()),
      });
      setMensagens((atual) => [...atual, ...novas]);
      setTimeout(() => rolagem.current?.scrollToEnd({ animated: true }), 80);
    } catch (e) {
      // O que foi digitado VOLTA para o campo: perder a pergunta por causa da
      // rede faria a pessoa digitar tudo de novo.
      setTexto(anterior || limpa);
      Alert.alert(
        'Não consegui responder',
        messageForError(e instanceof ApiRequestError ? e.code : undefined),
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.assistant} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.bottom}
      >
        <ScrollView
          ref={rolagem}
          contentContainerStyle={[styles.conteudo, { paddingTop: insets.top + spacing.md }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader
            title="Assistente de Saúde"
            onBack={() => router.replace('/inicio')}
            onNotifications={() =>
              Alert.alert('Notificações', 'Esta parte ainda está sendo construída.')
            }
            hasNotifications
          />

          <View style={styles.seletor}>
            <ProfileSelector
              profiles={perfis}
              selectedId={perfilId}
              onSelect={setPerfilId}
              tituloDoPainel="Tirar dúvida sobre"
            />
          </View>

          <LinearGradient
            colors={[colors.assistantGradientFrom, colors.assistantGradientTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.saudacao}
          >
            <Text style={styles.ola}>
              {primeiroNome ? `Olá, ${primeiroNome}` : 'Olá'}
            </Text>
            <Text style={styles.subtitulo}>Como posso ajudar você hoje?</Text>
          </LinearGradient>

          <SurfaceCard style={styles.painel}>
            {carregando ? (
              <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
            ) : (
              <>
                {mensagens.length === 0 ? (
                  <>
                    <ChatBubble
                      autor="assistant"
                      texto="Posso consultar os remédios, horários de dose e consultas que a sua família cadastrou aqui."
                    />
                    <ChatBubble
                      autor="assistant"
                      texto="Lembre-se: não indico remédio nem dose. Para isso, fale com o médico."
                    />
                  </>
                ) : (
                  mensagens.map((m) => (
                    <ChatBubble key={m.id} autor={m.role} texto={m.content} />
                  ))
                )}

                {enviando ? <ChatBubble autor="assistant" texto="" pensando /> : null}

                <View style={styles.acoes}>
                  <QuickActions onPerguntar={(p) => void enviar(p)} desabilitado={enviando} />
                </View>
              </>
            )}
          </SurfaceCard>
        </ScrollView>

        {/*
          O campo fica IRMAO da lista, nunca dentro do contentContainerStyle:
          dentro, ele rolaria junto e sumiria ao digitar. E e ele que carrega o
          espaco da barra de abas.
        */}
        <View style={[styles.rodape, { paddingBottom: ESPACO_BARRA + insets.bottom }]}>
          <View style={styles.campo}>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Digite sua dúvida..."
              placeholderTextColor={colors.textPlaceholder}
              style={styles.input}
              editable={!enviando}
              multiline
              maxLength={1000}
              onSubmitEditing={() => void enviar(texto)}
              accessibilityLabel="Sua dúvida"
            />
            <Pressable
              onPress={() => void enviar(texto)}
              disabled={enviando || texto.trim().length < 2}
              accessibilityRole="button"
              accessibilityLabel="Enviar pergunta"
              style={({ pressed }) => [
                styles.enviar,
                (enviando || texto.trim().length < 2) && styles.enviarApagado,
                pressed && styles.pressionado,
              ]}
            >
              {enviando ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Feather name="send" size={18} color={colors.onAccent} />
              )}
            </Pressable>
          </View>

          <View style={styles.aviso}>
            <Feather name="lock" size={12} color={colors.textSecondary} />
            <Text style={styles.avisoTexto}>Suas informações são tratadas com cuidado.</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.assistant[0] },
  flex: { flex: 1 },
  conteudo: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  seletor: { marginTop: spacing.lg },
  saudacao: {
    borderRadius: radii.card,
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  ola: { fontFamily: fonts.extrabold, fontSize: 26, color: colors.onAccent },
  subtitulo: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.onAccent,
    marginTop: spacing.xs,
    opacity: 0.92,
  },
  painel: { marginTop: spacing.lg, backgroundColor: colors.assistantPanel },
  carregando: { marginVertical: spacing.xl },
  acoes: { marginTop: spacing.lg },
  rodape: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  campo: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.onAccent,
    borderRadius: radii.card - 6,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
    // Sem teto, uma pergunta longa empurra o campo pela tela toda.
    maxHeight: 120,
  },
  enviar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.assistantSend,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enviarApagado: { opacity: 0.45 },
  pressionado: { opacity: 0.8 },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  avisoTexto: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
});
