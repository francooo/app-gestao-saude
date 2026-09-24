import { Feather } from '@expo/vector-icons';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
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

/**
 * Espaco que a barra de abas flutuante ocupa a partir do fundo da tela.
 *
 * Ela e `position: absolute` com `bottom: insets.bottom + 12` e `height: 68`
 * (ver app/(app)/_layout.tsx), entao o que ela cobre e insets.bottom + 80.
 */
const ESPACO_BARRA = 80;

/**
 * Assistente de Saude.
 *
 * O escopo DEIXOU DE SER ESTREITO, por decisao registrada do dono do produto:
 * o assistente consulta o cadastro da familia, busca na internet e responde
 * tambem sobre conduta e dose. As regras vivem no servidor, em
 * lib/assistente-prompt.ts — esta tela nao repete nenhuma delas, justamente
 * para nao ficar dizendo na conversa algo diferente do que o assistente faz.
 *
 * O contexto continua indo PRONTO daqui (ver lib/contextoDeSaude.ts): so este
 * aparelho sabe que horas sao, e "proxima dose" depende disso. As ferramentas
 * do servidor cobrem o que o bloco nao traz — as outras pessoas da casa, os
 * medicos, o historico de doses.
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

  /**
   * Com o teclado aberto a barra de abas fica escondida atras dele, e
   * reservar o espaco dela so empurraria o campo para longe do teclado.
   */
  const [tecladoAberto, setTecladoAberto] = useState(false);

  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState('');

  /**
   * Passou do tempo de uma resposta normal.
   *
   * Tres pontinhos parados por quinze segundos parecem travamento, e a pessoa
   * fecha a tela achando que quebrou. O corte em 5 s nao e chute: nas medicoes
   * contra a API, resposta sem busca voltou entre 0,4 e 2,4 s, e toda resposta
   * que passou de 4 s tinha buscado na internet. Por isso o aviso e provavel,
   * e nao afirmativo — nao da para ter certeza sem streaming.
   */
  const [demorando, setDemorando] = useState(false);

  useEffect(() => {
    // didShow/didHide existem nas duas plataformas; os "will" sao so do iOS e
    // deixariam o Android sem reacao nenhuma.
    const abriu = Keyboard.addListener('keyboardDidShow', () => {
      setTecladoAberto(true);
      // Sem isto a ultima mensagem fica escondida atras do teclado.
      setTimeout(() => rolagem.current?.scrollToEnd({ animated: true }), 60);
    });
    const fechou = Keyboard.addListener('keyboardDidHide', () => setTecladoAberto(false));

    // Sem remover, os ouvintes sobrevivem a saida da tela e mexem no estado de
    // um componente que nao existe mais.
    return () => {
      abriu.remove();
      fechou.remove();
    };
  }, []);

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

    const avisar = setTimeout(() => setDemorando(true), 5000);

    try {
      const novas = await healthApi.perguntarAoAssistente({
        question: limpa,
        profileId: perfilId,
        context: montarContexto(perfil, medicamentos, consultas, new Date()),
      });
      setMensagens((atual) => [...atual, ...novas]);
      setTimeout(() => rolagem.current?.scrollToEnd({ animated: true }), 80);
    } catch (e) {
      /**
       * Antes de dizer que falhou, CONFERIR SE NAO FUNCIONOU.
       *
       * O servidor grava pergunta e resposta juntas, e so quando conseguiu
       * responder. Entao um erro aqui — rede que caiu na volta, prazo do
       * aparelho — nao significa que nada aconteceu do outro lado. Sem esta
       * conferencia a pessoa via "nao consegui responder" para algo que ja
       * estava gravado, reenviava, e a busca era paga duas vezes.
       */
      const recuperado = await recuperarDoHistorico(limpa);
      if (recuperado) {
        setMensagens(recuperado);
        setTimeout(() => rolagem.current?.scrollToEnd({ animated: true }), 80);
        return;
      }

      // O que foi digitado VOLTA para o campo: perder a pergunta por causa da
      // rede faria a pessoa digitar tudo de novo.
      setTexto(anterior || limpa);
      Alert.alert(
        'Não consegui responder',
        messageForError(e instanceof ApiRequestError ? e.code : undefined),
      );
    } finally {
      clearTimeout(avisar);
      setDemorando(false);
      setEnviando(false);
    }
  }

  /**
   * Busca no historico a pergunta que acabou de falhar.
   *
   * Devolve a conversa inteira quando a ultima pergunta gravada e esta — o que
   * so acontece se o servidor concluiu. Qualquer outra coisa devolve nulo, e
   * ai o erro e real.
   */
  async function recuperarDoHistorico(pergunta: string): Promise<AssistantMessage[] | null> {
    try {
      const historico = await healthApi.historicoDoAssistente(perfilId);
      const ultimaPergunta = [...historico].reverse().find((m) => m.role === 'user');
      return ultimaPergunta?.content === pergunta ? historico : null;
    } catch {
      // Sem rede tambem para conferir. Segue para o erro normal.
      return null;
    }
  }

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.assistant} />

      {/*
        behavior nas DUAS plataformas. Eu tinha copiado das telas de formulario
        o `Platform.OS === 'ios' ? 'padding' : undefined`, que no Android
        desliga o componente por completo. La aquilo funciona porque o campo
        fica DENTRO do ScrollView e o React Native rola ate o campo focado;
        aqui o rodape e irmao da lista e nao rola — nada resgatava o campo de
        baixo do teclado.

        O comentario do login diz que o adjustResize do Android ja cuidaria
        disso, mas a premissa envelheceu: desde o React Native 0.81 o Android
        desenha em edge-to-edge obrigatorio, e nesse modo o resize nao encolhe
        mais a view raiz. Por isso nao ha deslocamento em dobro.

        keyboardVerticalOffset saiu: ele mede a distancia do TOPO da tela ate a
        view, e eu passava a margem inferior — nao queria dizer nada.
      */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
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
                      texto="Posso ver os remédios, doses e consultas que a sua família cadastrou aqui, e também procurar na internet o que você precisar saber."
                    />
                    <ChatBubble
                      autor="assistant"
                      texto="Sou uma inteligência artificial e posso errar — confira comigo a fonte e, no que for sério, fale com o médico. Em emergência, ligue 192."
                    />
                  </>
                ) : (
                  mensagens.map((m) => (
                    <ChatBubble key={m.id} autor={m.role} texto={m.content} />
                  ))
                )}

                {enviando ? <ChatBubble autor="assistant" texto="" pensando /> : null}
                {demorando ? (
                  <Text style={styles.demorando}>
                    Provavelmente estou procurando na internet. Isso leva alguns segundos.
                  </Text>
                ) : null}

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
        <View
          style={[
            styles.rodape,
            { paddingBottom: tecladoAberto ? spacing.sm : ESPACO_BARRA + insets.bottom },
          ]}
        >
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
  demorando: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginLeft: spacing.md,
  },
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
