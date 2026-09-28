import { Feather } from '@expo/vector-icons';
import { isSameDay, isTomorrow } from 'date-fns';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageForError } from '@gestao/shared';

import { ApiRequestError } from '@/api/client';
import { healthApi, type Dose, type Medication } from '@/api/health';
import { Avatar } from '@/components/Avatar';
import { DoseButton } from '@/components/DoseButton';
import { IconTile, LADRILHO_ATENCAO, LADRILHO_NEUTRO, LADRILHO_POR_FORMA } from '@/components/IconTile';
import { PrescriptionCard } from '@/components/PrescriptionCard';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { SurfaceCard } from '@/components/SurfaceCard';
import { FotoDaEmbalagem } from '@/components/FotoDaEmbalagem';
import { escolherFotoDeDocumento } from '@/lib/foto';
import {
  cancelarLembretesDeUmMedicamento,
  sincronizarLembretesDeUmMedicamento,
} from '@/lib/reminders';
import { alternarDose, comDose, semDose } from '@/lib/marcarDose';
import {
  diaCurto,
  estadoHoje,
  formaVisual,
  hora,
  posologia,
  proximaDose,
  tituloDoMedicamento,
  type EstadoHoje,
} from '@/lib/posologia';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/**
 * Espaco da barra de abas flutuante.
 *
 * Ela e absoluta, com 68 de altura e `bottom: insets.bottom + 12`, entao ocupa
 * insets.bottom + 80 a partir do fundo. Os 96 somam 16 de folga para o ultimo
 * elemento nao encostar nela — e aqui o ultimo elemento e justamente "Apagar
 * remedio e historico", que nao pode ficar meio escondido.
 */
const ESPACO_BARRA = 96;

/** Quantas doses aparecem antes de "Ver todas". */
const DOSES_VISIVEIS = 8;

/**
 * Detalhe do medicamento.
 *
 * O historico de doses NAO esta no mockup, e fica assim mesmo: e o que evita a
 * dose dobrada quando mais de um adulto cuida da mesma pessoa, que e o uso
 * esperado deste aplicativo. Tirar seria trocar seguranca clinica por
 * fidelidade de desenho.
 *
 * O botao de marcar dose tambem nao esta no mockup. Sem ele esta tela e um
 * beco: quem entrou para conferir o horario teria que voltar para a lista para
 * marcar — e marcar e a acao mais frequente do aplicativo inteiro.
 */
export default function MedicamentoDetalheScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [m, setM] = useState<Medication | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [anexando, setAnexando] = useState(false);
  /**
   * Separado do `anexando`, que e da receita: compartilhar faria o veu
   * aparecer nas duas fotos ao mexer numa so.
   */
  const [fotoCaixa, setFotoCaixa] = useState<'enviando' | 'removendo' | null>(null);
  const [todasAsDoses, setTodasAsDoses] = useState(false);

  /**
   * Fixado a cada carga, e nao lido a cada renderizacao.
   *
   * O chip do topo, a linha "Proxima dose" e o botao de dose precisam
   * concordar sobre que horas sao. Lendo o relogio tres vezes, eles podem
   * discordar no segundo em que a hora vira.
   */
  const [agora, setAgora] = useState(() => new Date());

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setAgora(new Date());
      setM(await healthApi.getMedication(id!));
    } catch (e) {
      setErro(messageForError(e instanceof ApiRequestError ? e.code : undefined));
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  async function marcar() {
    if (!m || enviando) return;
    setEnviando(true);
    try {
      const r = await alternarDose(m, agora);
      if (r.tipo === 'registrada') setM((x) => (x ? comDose(x, r.dose) : x));
      else if (r.tipo === 'desfeita') setM((x) => (x ? semDose(x, r.doseId) : x));
    } catch (e) {
      Alert.alert(
        'Não consegui registrar',
        messageForError(e instanceof ApiRequestError ? e.code : undefined),
      );
    } finally {
      setEnviando(false);
    }
  }

  /**
   * Camera ou galeria, e depois o envio.
   *
   * O `alvo` decide o campo do PATCH e os textos. As duas fotos usam a mesma
   * `escolherFotoDeDocumento` — o preparo e identico; o que difere entre elas
   * e a sensibilidade, nao a resolucao.
   */
  function anexar(alvo: 'receita' | 'caixa', trocando: boolean) {
    if (!m) return;
    const titulo =
      alvo === 'receita'
        ? trocando
          ? 'Trocar a receita'
          : 'Adicionar prescrição'
        : trocando
          ? 'Trocar a foto da caixinha'
          : 'Foto da caixinha';

    Alert.alert(titulo, 'De onde vem a foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto', onPress: () => void enviarFoto(alvo, 'camera') },
      { text: 'Escolher da galeria', onPress: () => void enviarFoto(alvo, 'galeria') },
    ]);
  }

  async function enviarFoto(alvo: 'receita' | 'caixa', origem: 'camera' | 'galeria') {
    if (!m) return;

    const escolha = await escolherFotoDeDocumento(origem);
    if (!escolha.ok) {
      if (escolha.motivo === 'cancelado') return;
      if (escolha.motivo === 'permissao') {
        /**
         * Antes isto era um alerta de um botao so, dizendo "autorize nos
         * ajustes" sem nenhum caminho que levasse la — um beco. A tela de
         * leitura por foto ja oferecia as duas saidas; agora as duas telas
         * oferecem.
         */
        Alert.alert(
          'Sem acesso à câmera',
          'Autorize a câmera nos ajustes do aparelho, ou escolha uma foto que já está na galeria.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Escolher da galeria', onPress: () => void enviarFoto(alvo, 'galeria') },
            { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
          ],
        );
        return;
      }
      Alert.alert('Não consegui usar a foto', 'Tente de novo, ou escolha outra imagem.');
      return;
    }

    if (alvo === 'caixa') setFotoCaixa('enviando');
    else setAnexando(true);
    try {
      setM(
        await healthApi.updateMedication(
          m.id,
          alvo === 'caixa'
            ? { packagePhoto: escolha.dataUri }
            : { prescriptionPhoto: escolha.dataUri },
        ),
      );
    } catch (e) {
      Alert.alert(
        alvo === 'caixa' ? 'Não consegui guardar a foto' : 'Não consegui guardar a receita',
        messageForError(e instanceof ApiRequestError ? e.code : undefined),
      );
    } finally {
      if (alvo === 'caixa') setFotoCaixa(null);
      else setAnexando(false);
    }
  }

  /** O menu do "..." da faixa da foto da caixinha. */
  function opcoesDaCaixa() {
    Alert.alert('Foto da caixinha', 'O que você quer fazer com esta foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Trocar foto', onPress: () => anexar('caixa', true) },
      { text: 'Remover foto', style: 'destructive', onPress: removerFotoDaCaixa },
    ]);
  }

  /**
   * Remover NAO E OPCIONAL neste recurso.
   *
   * A foto da caixinha e guardada sem perguntar porque uma embalagem e um
   * produto de farmacia. So que e comum a farmacia colar nela a etiqueta com
   * o nome do paciente — sem uma saida, "guardar sem perguntar" viraria uma
   * armadilha.
   */
  function removerFotoDaCaixa() {
    if (!m) return;
    Alert.alert('Remover a foto da caixinha?', 'A foto sai da sua conta e não dá para recuperar.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setFotoCaixa('removendo');
          try {
            setM(await healthApi.updateMedication(m.id, { packagePhoto: null }));
          } catch (e) {
            Alert.alert(
              'Não consegui remover',
              messageForError(e instanceof ApiRequestError ? e.code : undefined),
            );
          } finally {
            setFotoCaixa(null);
          }
        },
      },
    ]);
  }

  function removerReceita() {
    if (!m) return;
    Alert.alert('Remover a receita?', 'A foto sai da sua conta e não dá para recuperar.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setAnexando(true);
          try {
            setM(await healthApi.updateMedication(m.id, { prescriptionPhoto: null }));
          } catch (e) {
            Alert.alert(
              'Não consegui remover',
              messageForError(e instanceof ApiRequestError ? e.code : undefined),
            );
          } finally {
            setAnexando(false);
          }
        },
      },
    ]);
  }

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
              const salvo = await healthApi.updateMedication(m.id, { isActive: !m.isActive });
              setM(salvo);
              // Encerrar tem que CALAR os avisos na hora, e retomar tem que
              // traze-los de volta. Sem isto, o efeito so apareceria quando a
              // lista de remedios fosse aberta.
              await sincronizarLembretesDeUmMedicamento(salvo);
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
              // O remedio deixou de existir; o alarme dele nao pode sobreviver.
              await cancelarLembretesDeUmMedicamento(m.id);
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
          title="Detalhes do medicamento"
          titleLines={2}
          onBack={() => router.back()}
          mostrarSino
        />

        {carregando ? (
          <ActivityIndicator color={colors.accentGreen} style={styles.carregando} />
        ) : erro || !m ? (
          <SurfaceCard style={styles.aviso}>
            <Feather name="alert-circle" size={26} color={colors.textError} />
            <Text style={styles.avisoTexto}>{erro ?? 'Remédio não encontrado.'}</Text>
            <Pressable onPress={() => void carregar()} accessibilityRole="button">
              <Text style={styles.tentarDeNovo}>Tentar de novo</Text>
            </Pressable>
          </SurfaceCard>
        ) : (
          <Conteudo
            m={m}
            agora={agora}
            enviando={enviando}
            anexando={anexando}
            todasAsDoses={todasAsDoses}
            onVerTodasAsDoses={() => setTodasAsDoses((v) => !v)}
            onMarcar={() => void marcar()}
            onAdicionarReceita={() => anexar('receita', false)}
            onTrocarReceita={() => anexar('receita', true)}
            onRemoverReceita={removerReceita}
            fotoCaixa={fotoCaixa}
            onAdicionarCaixa={() => anexar('caixa', false)}
            onOpcoesDaCaixa={opcoesDaCaixa}
            onEditar={() => router.push(`/medicamento/form/${m.id}`)}
            onEncerrar={encerrar}
            onApagar={apagar}
          />
        )}
      </ScrollView>
    </View>
  );
}

type ConteudoProps = {
  m: Medication;
  agora: Date;
  enviando: boolean;
  anexando: boolean;
  todasAsDoses: boolean;
  onVerTodasAsDoses: () => void;
  onMarcar: () => void;
  onAdicionarReceita: () => void;
  onTrocarReceita: () => void;
  onRemoverReceita: () => void;
  fotoCaixa: 'enviando' | 'removendo' | null;
  onAdicionarCaixa: () => void;
  onOpcoesDaCaixa: () => void;
  onEditar: () => void;
  onEncerrar: () => void;
  onApagar: () => void;
};

function Conteudo({
  m,
  agora,
  enviando,
  anexando,
  todasAsDoses,
  onVerTodasAsDoses,
  onMarcar,
  onAdicionarReceita,
  onTrocarReceita,
  onRemoverReceita,
  fotoCaixa,
  onAdicionarCaixa,
  onOpcoesDaCaixa,
  onEditar,
  onEncerrar,
  onApagar,
}: ConteudoProps) {
  const estado = estadoHoje(m, agora);
  const titulo = tituloDoMedicamento(m);
  // Mesmo limiar e mesma fonte de verdade que o OpcaoDeFoto ja usa.
  const { fontScale } = useWindowDimensions();
  const fonteGrande = fontScale >= 1.3;

  /**
   * O botao aparece em UM de dois lugares, nunca nos dois. Definido uma vez
   * porque duplicar as sete props garantiria que um dia elas divergissem.
   */
  const BotaoDeDose = () => (
    <DoseButton
      checked={marcado}
      repetivel={repetivel}
      disabled={semAcao}
      enviando={enviando}
      label={rotuloDaDose(titulo, estado, repetivel)}
      onPress={onMarcar}
      size={44}
    />
  );
  const forma = LADRILHO_POR_FORMA[formaVisual(m.form)];
  const chip = chipDeStatus(estado, agora);
  const dose = linhaDaProximaDose(m, estado, agora);

  const repetivel = m.scheduleType === 'as_needed';
  const marcado = estado.tipo === 'tomado' && !repetivel;
  const semAcao =
    estado.tipo === 'inativo' || estado.tipo === 'encerrado' || estado.tipo === 'nao_comecou';

  // Mais recente primeiro: a dose que a pessoa acabou de marcar tem que
  // aparecer no topo, senao marcar no cartao de cima nao produz resposta
  // visivel nenhuma.
  const doses = [...m.doses].sort((a, b) => quando(b) - quando(a));
  const visiveis = todasAsDoses ? doses : doses.slice(0, DOSES_VISIVEIS);

  return (
    <>
      <SurfaceCard style={styles.heroi}>
        <View style={styles.heroiLinha}>
          <IconTile {...forma} size={54} />

          {/*
            AGRUPADO, e isto conserta um defeito que ja existia: o Avatar fixa
            `accessibilityLabel={nome}` sem saida, entao sem o agrupamento o
            leitor de tela parava duas vezes e lia "Ana Clara" e depois
            "Vinculado a Ana". Um pai `accessible` funde os filhos num no so.

            Em `heroiTextos` e nao em `heroiLinha`: agrupar a linha inteira
            engoliria o DoseButton, que precisa de foco proprio e de estado.
          */}
          <View
            style={styles.heroiTextos}
            accessible
            accessibilityLabel={
              m.profileName
                ? `${titulo}. Vinculado a ${m.profileName.split(' ')[0]}.`
                : titulo
            }
          >
            <Text style={styles.heroiNome} numberOfLines={2}>
              {titulo}
            </Text>
            {m.profileName ? (
              <View style={styles.vinculo}>
                <Avatar
                  nome={m.profileName}
                  color={m.profileColor ?? undefined}
                  recyclingKey={m.profileId}
                  size={20}
                />
                <Text style={styles.vinculoTexto} numberOfLines={1}>
                  Vinculado a {m.profileName.split(' ')[0]}
                </Text>
              </View>
            ) : null}
          </View>

          {/*
            Com fonte grande o botao desce para a linha do chip, e a coluna do
            nome sobe de 150 para 194 pt num aparelho de 360. Hoje, a 1,3x,
            "Monoidratada" trunca — ou seja, a tela fica MELHOR com fonte
            grande do que estava.
          */}
          {!fonteGrande ? <BotaoDeDose /> : null}
        </View>

        <View style={styles.heroiSituacao}>
          <View
            style={[
              styles.chip,
              { backgroundColor: chip.ativo ? colors.pillTablet : colors.chipMore },
            ]}
            accessibilityRole="text"
            accessibilityLabel={`Situação: ${chip.texto}`}
          >
            <Feather
              name={chip.icone}
              size={15}
              color={chip.ativo ? colors.accentGreen : colors.textSecondary}
            />
            <Text
              style={[
                styles.chipTexto,
                { color: chip.ativo ? colors.accentGreen : colors.textSecondary },
              ]}
            >
              {chip.texto}
            </Text>
          </View>

          {fonteGrande ? <BotaoDeDose /> : null}
        </View>

        {/* Separa BLOCOS, nao itens de uma coluna de icones — por isso sem a
            margem a esquerda que o filete das linhas de Info usa. */}
        <View style={styles.divisorLargo} />

        <FotoDaEmbalagem
          foto={m.packagePhoto ?? null}
          doQue={titulo}
          ocupada={fotoCaixa}
          onAdicionar={onAdicionarCaixa}
          onOpcoes={onOpcoesDaCaixa}
        />
      </SurfaceCard>

      <View style={styles.secao}>
        <SectionHeader title="Informações da medicação" />
        <SurfaceCard style={styles.cartao}>
          <Info tile={{ ...forma, icone: forma.icone }} rotulo="Posologia" valor={posologia(m)} />
          <Divisor />
          <Info
            tile={{ ...(dose.atencao ? LADRILHO_ATENCAO : LADRILHO_NEUTRO), icone: 'clock' }}
            rotulo={dose.rotulo}
            valor={dose.valor}
          />
          <Divisor />
          <Info
            tile={{ ...LADRILHO_NEUTRO, icone: 'calendar' }}
            rotulo="Tratamento"
            valor={periodoDoTratamento(m)}
          />
        </SurfaceCard>
      </View>

      {/*
        A secao inteira some quando nao ha orientacoes, em vez de mostrar um
        estado vazio: a unica forma de preencher e o botao Editar, que fica
        logo abaixo. Um cartao dizendo "sem orientacoes" gastaria rolagem para
        comunicar um nada sem saida.
      */}
      {m.instructions ? (
        <View style={styles.secao}>
          <SectionHeader title="Instruções" />
          <SurfaceCard style={styles.cartao}>
            <View style={styles.instrucoes}>
              <IconTile {...LADRILHO_ATENCAO} icone="info" />
              <Text style={styles.instrucoesTexto}>{m.instructions}</Text>
            </View>
          </SurfaceCard>
        </View>
      ) : null}

      <View style={styles.secao}>
        <SectionHeader title="Prescrição médica" />
        <PrescriptionCard
          foto={m.prescriptionPhoto ?? null}
          doQue={titulo}
          prescritor={m.prescriberName}
          ocupado={anexando}
          onAdicionar={onAdicionarReceita}
          onTrocar={onTrocarReceita}
          onRemover={onRemoverReceita}
        />
      </View>

      <View style={styles.secao}>
        <SectionHeader
          title="Histórico de doses"
          onVerTodos={doses.length > DOSES_VISIVEIS ? onVerTodasAsDoses : undefined}
          verTodosLabel={todasAsDoses ? 'Ver menos' : 'Ver todas'}
        />
        <SurfaceCard style={styles.cartao}>
          {visiveis.length === 0 ? (
            <Text style={styles.ajuda}>Nenhuma dose registrada ainda.</Text>
          ) : (
            visiveis.map((d, i) => (
              <View key={d.id}>
                {i > 0 ? <Divisor /> : null}
                <LinhaDeDose dose={d} agora={agora} />
              </View>
            ))
          )}
        </SurfaceCard>
      </View>

      <View style={styles.acoes}>
        <Pressable
          onPress={onEditar}
          accessibilityRole="button"
          accessibilityHint="Abre o formulário do remédio"
          style={({ pressed }) => [styles.primario, pressed && styles.pressionado]}
        >
          <Feather name="edit-2" size={18} color={colors.onAccent} />
          <Text style={styles.primarioTexto}>Editar</Text>
        </Pressable>

        <Pressable
          onPress={onEncerrar}
          accessibilityRole="button"
          accessibilityHint="O remédio sai da lista de hoje e o histórico é mantido"
          style={({ pressed }) => [styles.contorno, pressed && styles.pressionado]}
        >
          <Text style={styles.contornoTexto}>
            {m.isActive ? 'Encerrar tratamento' : 'Retomar tratamento'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onApagar}
          accessibilityRole="button"
          accessibilityHint="Apaga também o registro de todas as doses. Não dá para desfazer"
          style={styles.apagar}
        >
          <Text style={styles.apagarTexto}>Apagar remédio e histórico</Text>
        </Pressable>
      </View>
    </>
  );
}

function Info({
  tile,
  rotulo,
  valor,
}: {
  tile: { fundo: string; traco: string; icone: keyof typeof Feather.glyphMap };
  rotulo: string;
  valor: string;
}) {
  return (
    // Agrupado: sem isto o leitor de tela gasta seis gestos nas tres linhas.
    // A virgula troca o ponto medio, que os motores leem como "ponto".
    <View accessible accessibilityLabel={`${rotulo}: ${valor.replace(' · ', ', ')}`} style={styles.info}>
      <IconTile {...tile} />
      <View style={styles.infoTextos}>
        <Text style={styles.infoRotulo}>{rotulo}</Text>
        <Text style={styles.infoValor}>{valor}</Text>
      </View>
    </View>
  );
}

function Divisor() {
  return <View style={styles.divisor} />;
}

function LinhaDeDose({ dose, agora }: { dose: Dose; agora: Date }) {
  const pulada = dose.status === 'pulada';
  const instante = dose.takenAt ?? dose.scheduledFor;
  const data = instante ? new Date(instante) : null;

  const texto = data ? `${diaRelativo(data, agora)} às ${hora(data)}` : 'Sem data';

  return (
    <View
      style={styles.dose}
      accessible
      accessibilityLabel={`${texto}, ${pulada ? 'pulada' : 'tomada'}`}
    >
      <View
        style={[
          styles.doseMarca,
          { backgroundColor: pulada ? colors.pillTablet : colors.doseTaken },
        ]}
      >
        <Feather
          name={pulada ? 'slash' : 'check'}
          size={14}
          color={pulada ? colors.pillTabletIcon : colors.onAccent}
        />
      </View>
      <View style={styles.infoTextos}>
        <Text style={styles.doseTexto}>{texto}</Text>
        {pulada ? <Text style={styles.ajuda}>pulada</Text> : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Textos derivados do estado. Nada aqui inventa regra: tudo sai de estadoHoje,
// que e a mesma fonte que a lista de remedios usa.
// ---------------------------------------------------------------------------

type Chip = { icone: keyof typeof Feather.glyphMap; texto: string; ativo: boolean };

/**
 * O chip NUNCA some — muda icone, texto e tom.
 *
 * Se sumisse, o cartao de um remedio pausado ficaria igual ao de um ativo, e a
 * altura do cartao dancaria entre estados. Um chip presente e neutro e a unica
 * coisa acima da dobra que diz "este tratamento esta parado".
 */
function chipDeStatus(estado: EstadoHoje, agora: Date): Chip {
  switch (estado.tipo) {
    case 'tomado':
      return {
        icone: 'check-circle',
        ativo: true,
        texto:
          estado.quantas > 1
            ? `${estado.quantas} doses hoje · última às ${hora(estado.quando)}`
            : `Tomado hoje às ${hora(estado.quando)}`,
      };
    case 'pendente':
      return {
        icone: 'clock',
        ativo: true,
        texto: `Próxima dose ${diaRelativo(estado.quando, agora).toLowerCase()} às ${hora(estado.quando)}`,
      };
    case 'se_necessario':
      return { icone: 'info', ativo: true, texto: 'Somente se necessário' };
    case 'nao_comecou':
      return { icone: 'calendar', ativo: false, texto: `Começa em ${diaCurto(estado.em)}` };
    case 'encerrado':
      return { icone: 'flag', ativo: false, texto: `Encerrado em ${diaCurto(estado.em)}` };
    case 'inativo':
      return { icone: 'pause-circle', ativo: false, texto: 'Tratamento pausado' };
    default:
      return { icone: 'clock', ativo: false, texto: 'Sem dose prevista hoje' };
  }
}

/**
 * A segunda linha do cartao de informacoes.
 *
 * O ladrilho ambar so acende quando ha algo a fazer. Ambar significa "tem
 * coisa para fazer" em todo o aplicativo; deixa-lo aceso num tratamento
 * encerrado seria mentira visual.
 */
function linhaDaProximaDose(
  m: Medication,
  estado: EstadoHoje,
  agora: Date,
): { rotulo: string; valor: string; atencao: boolean } {
  if (estado.tipo === 'se_necessario') {
    return { rotulo: 'Uso', valor: 'Somente quando for preciso', atencao: false };
  }
  if (estado.tipo === 'inativo') {
    return { rotulo: 'Próxima dose', valor: 'Tratamento pausado', atencao: false };
  }
  if (estado.tipo === 'encerrado') {
    return { rotulo: 'Próxima dose', valor: 'Tratamento encerrado', atencao: false };
  }
  if (estado.tipo === 'nao_comecou') {
    return { rotulo: 'Próxima dose', valor: `Começa em ${diaCurto(estado.em)}`, atencao: false };
  }

  const proxima = proximaDose(m, agora);
  if (!proxima) return { rotulo: 'Próxima dose', valor: 'Sem dose prevista', atencao: false };

  return {
    rotulo: 'Próxima dose',
    valor: `${diaRelativo(proxima, agora)} às ${hora(proxima)}`,
    atencao: true,
  };
}

/**
 * O periodo do tratamento.
 *
 * O caso "nenhuma das duas datas" e o MAIS COMUM, e nao um descuido: o
 * formulario de cadastro nao tem campos de inicio e fim, entao so o seed e a
 * API os preenchem. "Conforme orientação médica" e o texto do mockup e e
 * honesto — nao afirma que existe prazo, diz que o prazo esta com quem
 * receitou. Nao troque por um placeholder achando que e provisorio.
 */
function periodoDoTratamento(m: Medication): string {
  const inicio = m.startsAt ? diaCurto(new Date(m.startsAt)) : null;
  const fim = m.endsAt ? diaCurto(new Date(m.endsAt)) : null;

  if (inicio && fim) return `De ${inicio} até ${fim}`;
  if (inicio) return `Desde ${inicio}`;
  if (fim) return `Até ${fim}`;
  return 'Conforme orientação médica';
}

function diaRelativo(d: Date, agora: Date): string {
  if (isSameDay(d, agora)) return 'Hoje';
  if (isTomorrow(d)) return 'Amanhã';
  return diaCurto(d);
}

function quando(d: Dose): number {
  const iso = d.takenAt ?? d.scheduledFor;
  return iso ? new Date(iso).getTime() : 0;
}

function rotuloDaDose(titulo: string, estado: EstadoHoje, repetivel: boolean): string {
  if (repetivel) return `Registrar uma dose de ${titulo} agora`;
  if (estado.tipo === 'tomado') return `Dose de ${titulo}, tomada às ${hora(estado.quando)}`;
  if (estado.tipo === 'pendente') return `Dose de ${titulo} das ${hora(estado.quando)}`;
  return `Dose de ${titulo}`;
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  conteudo: { paddingHorizontal: spacing.xl },
  carregando: { marginTop: spacing.xxl },

  heroi: { marginTop: spacing.xl, padding: spacing.lg },
  heroiLinha: { flexDirection: 'row', alignItems: 'center' },
  heroiTextos: { flex: 1, marginHorizontal: spacing.lg },
  heroiNome: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.sectionTitle },
  vinculo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  vinculoTexto: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  // `flexShrink` no lugar de `alignSelf: flex-start`: dentro de uma linha ele
  // ja nao estica, e precisa encolher para caber ao lado do botao de dose
  // quando a fonte do sistema e grande.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexShrink: 1,
  },
  chipTexto: { fontFamily: fonts.semibold, fontSize: 14, flexShrink: 1 },
  heroiSituacao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  divisorLargo: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginTop: spacing.md,
  },

  secao: { marginTop: spacing.xl },
  cartao: { padding: spacing.lg },

  info: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  infoTextos: { flex: 1, marginLeft: spacing.md },
  infoRotulo: { fontFamily: fonts.bold, fontSize: 15, color: colors.sectionTitle },
  infoValor: { fontFamily: fonts.regular, fontSize: 15, color: colors.textPrimary, marginTop: 1 },
  // Comeca alinhado ao texto, nao ao ladrilho: o filete separa informacao, e a
  // coluna de icones continua sendo uma coluna.
  divisor: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 44 + spacing.md,
  },

  instrucoes: { flexDirection: 'row', alignItems: 'flex-start' },
  instrucoesTexto: {
    flex: 1,
    marginLeft: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },

  dose: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  doseMarca: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doseTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  ajuda: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },

  acoes: { marginTop: spacing.xxl },
  primario: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
  },
  primarioTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },
  contorno: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
    borderRadius: radii.pill,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  contornoTexto: { fontFamily: fonts.semibold, fontSize: 16, color: colors.accentGreen },
  // Afastado de proposito: destrutivo alcancavel, nunca convidativo.
  apagar: { alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.lg },
  apagarTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textError },
  pressionado: { opacity: 0.85 },

  aviso: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.xl },
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
});
