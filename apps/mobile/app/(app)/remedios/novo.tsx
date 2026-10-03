import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiRequestError } from '@/api/client';
import { healthApi, type LeituraDeFoto, type MedicamentoLido } from '@/api/health';
import { BlocoDeAviso } from '@/components/BlocoDeAviso';
import { CartaoDeLeitura } from '@/components/CartaoDeLeitura';
import { IconTile, LADRILHO_ATENCAO, LADRILHO_NEUTRO } from '@/components/IconTile';
import { OpcaoDeFoto } from '@/components/OpcaoDeFoto';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SeletorDeRemedios } from '@/components/SeletorDeRemedios';
import { SurfaceCard } from '@/components/SurfaceCard';
import { useAvisos } from '@/lib/avisosContext';
import { pedirFotoDeDocumento } from '@/lib/foto';
import {
  consumirCadastroConcluido,
  consumirFotoParaLeitura,
  guardarRascunho,
  guardarReceita,
  normalizarLeitura,
  temCadastroConcluido,
  temFotoParaLeitura,
} from '@/lib/rascunhoDeMedicamento';
import { API_ERROR, messageForError } from '@gestao/shared';
import { backgrounds, colors, fonts, radii, spacing } from '@/theme';

/** Mesmo nome e mesmo valor das outras telas com barra de abas. */
const ESPACO_BARRA = 96;

type Kind = 'receita' | 'caixa';

type Estado =
  | { fase: 'repouso' }
  | { fase: 'lendo'; kind: Kind }
  | { fase: 'lido'; kind: Kind; leitura: LeituraDeFoto; escolhido: number | null }
  | { fase: 'vazio'; kind: Kind }
  | { fase: 'erro'; kind: Kind; codigo: string };

/**
 * Cadastrar um remedio a partir de uma foto da receita ou da caixinha.
 *
 * MORA NA PILHA DE REMEDIOS, e nao como rota irma das abas, pelo motivo ja
 * documentado no _layout de cima: com `href: null` em foco NENHUMA aba
 * acenderia, e a barra apareceria apagada parecendo defeito. O mockup mostra
 * "Remedios" aceso, e o comentario de remedios/_layout.tsx ja previa esta
 * tela: "esse argumento vale para formulario, nao para uma tela de leitura".
 *
 * A IA NUNCA SALVA SOZINHA. Esta tela le e entrega ao formulario; quem grava e
 * a pessoa, depois de conferir. Isso nao e cortesia: o modelo corrige grafia
 * em silencio, e foi reproduzido contra a API ("Amoxicilna" virando
 * "Amoxicilina"). A instrucao no prompt reduz e nao elimina.
 */
export default function NovoRemedioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  /**
   * O cartao "Ler receita com IA" da tela inicial ja escolheu a foto e a deixou
   * numa vaga de modulo; `fotoPronta` so sinaliza que ha uma esperando. O seletor
   * NAO e aberto aqui nesse caminho — foi aberto na Home, para cancelar la nao
   * jogar ninguem nesta tela intermediaria.
   */
  const { fotoPronta } = useLocalSearchParams<{ fotoPronta?: string }>();
  const { avisos, parcial, erro: erroDosAvisos, recarregar } = useAvisos();

  /**
   * Ja nasce em "lendo" quando ha foto esperando (espiada, nao consumida):
   * assim o primeiro quadro nao mostra as opcoes de cadastro antes do spinner.
   */
  const [estado, setEstado] = useState<Estado>(() =>
    fotoPronta && temFotoParaLeitura() ? { fase: 'lendo', kind: 'receita' } : { fase: 'repouso' },
  );
  const [segundos, setSegundos] = useState(0);

  /**
   * A foto fica AQUI, e nao e passada direto do seletor para o envio.
   *
   * E o que faz "Tentar de novo" reenviar a mesma imagem em vez de pedir outra
   * foto. Morre na limpeza do blur, ao escolher outra foto, ou ao sair.
   */
  const foto = useRef<string | null>(null);
  const cancelamento = useRef<AbortController | null>(null);
  /** Resposta que chega depois de a pessoa sair nao toca o estado. */
  const abandonado = useRef(false);
  /**
   * A leitura veio do cartao da Home (foto ja escolhida la).
   *
   * Muda o que o cancelamento faz: nesse fluxo esta tela e so a hospedeira da
   * leitura, entao abortar o spinner volta para a Home, nao para as opcoes de
   * cadastro — que a pessoa nunca pediu para ver.
   */
  const autoLeitura = useRef(false);

  /**
   * A tela se dispensa sozinha depois que o cadastro termina.
   *
   * A MARCA E LIDA NA RENDERIZACAO, nao so no efeito: assim o primeiro quadro
   * ja sai em branco e a pessoa nao ve a camera piscar depois de salvar o
   * remedio. O consumo fica no efeito, que e onde pode haver efeito colateral.
   *
   * Existe porque `router.replace` atravessando abas e um no-op silencioso —
   * ver o comentario em rascunhoDeMedicamento.ts.
   */
  const saindo = temCadastroConcluido();

  useFocusEffect(
    useCallback(() => {
      abandonado.current = false;
      if (consumirCadastroConcluido()) {
        // setTimeout(0) protege contra navegar com a arvore ainda montando.
        setTimeout(() => router.back(), 0);
        return;
      }
      return () => {
        /**
         * Limpeza no blur, e ela e OBRIGATORIA, nao higiene.
         *
         * Uma aba, depois de carregada, fica montada: sair daqui nao desmonta
         * a tela. Sem isto, a foto de uma receita ficaria viva por tempo
         * indefinido E a pessoa, ao reentrar, veria a leitura anterior. E o
         * que faz "voltar" significar "descartei".
         */
        abandonado.current = true;
        cancelamento.current?.abort();
        cancelamento.current = null;
        foto.current = null;
        autoLeitura.current = false;
        setEstado({ fase: 'repouso' });
        setSegundos(0);
      };
    }, [router]),
  );

  /**
   * Consome a foto que a Home deixou e comeca a leitura, sem reabrir seletor.
   *
   * O estado inicial (acima) ja espiou a vaga e nasceu em "lendo", sem flash; o
   * efeito faz o trabalho de verdade e cobre tambem o caso raro de a tela ja
   * estar montada. Limpa o parametro para voltar aqui nao reler nada.
   *
   * enviar fica FORA das deps de proposito: e recriada a cada render e entraria
   * em laco. A copia capturada so le refs e chama setState (estaveis), entao a
   * do primeiro render serve.
   */
  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      if (!fotoPronta) return;
      router.setParams({ fotoPronta: undefined });
      const img = consumirFotoParaLeitura();
      if (!img) return;
      foto.current = img;
      autoLeitura.current = true;
      void enviar('receita');
    }, [fotoPronta, router]),
  );

  // O contador que muda o texto de espera. So roda enquanto le.
  useEffect(() => {
    if (estado.fase !== 'lendo') return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [estado.fase]);

  /**
   * A politica so bloqueia quando o provider RESPONDEU de verdade.
   *
   * Em avisosContext o consentimento fica nulo quando a chamada falha, e o
   * aviso e gerado tambem nesse caso. Bloquear o recurso por uma falha de rede
   * seria injusto — a autoridade final e o 403 do servidor, que chega quando a
   * pessoa tenta.
   */
  const politicaVelha =
    !parcial && !erroDosAvisos && avisos.some((a) => a.tipo === 'politica-desatualizada');

  function escolherOrigem(kind: Kind) {
    Alert.alert(
      kind === 'receita' ? 'Fotografar receita' : 'Fotografar caixinha',
      'De onde vem a foto?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Tirar foto', onPress: () => void pegarFoto(kind, 'camera') },
        { text: 'Escolher da galeria', onPress: () => void pegarFoto(kind, 'galeria') },
      ],
    );
  }

  async function pegarFoto(kind: Kind, origem: 'camera' | 'galeria') {
    // O seletor e os avisos de permissao/falha moram no helper, compartilhados
    // com o cartao da Home. Aqui so resta o que esta tela faz com a foto.
    const img = await pedirFotoDeDocumento(origem);
    if (!img) return;
    foto.current = img;
    await enviar(kind);
  }

  async function enviar(kind: Kind) {
    if (!foto.current) return;

    setSegundos(0);
    setEstado({ fase: 'lendo', kind });

    const controller = new AbortController();
    cancelamento.current = controller;

    try {
      const leitura = await healthApi.lerFoto({ photo: foto.current, kind }, controller.signal);
      if (abandonado.current) return;

      if (leitura.items.length === 0) {
        setEstado({ fase: 'vazio', kind });
        return;
      }

      /**
       * A RECEITA diverge aqui: em vez do seletor "um por vez", monta o lote
       * com todos os remedios e vai para a tela de revisao, onde a pessoa
       * confere tudo e salva de uma vez. A CAIXINHA segue o fluxo de um so.
       */
      if (kind === 'receita') {
        irParaRevisao(leitura);
        return;
      }

      setEstado({
        fase: 'lido',
        kind,
        leitura,
        // Um item so ja vem escolhido; com varios, ninguem escolhe por voce.
        escolhido: leitura.items.length === 1 ? leitura.items[0]!.index : null,
      });
    } catch (e) {
      if (abandonado.current) return;
      // Cancelamento pedido pela pessoa nao e erro: volta ao repouso, calado.
      if (controller.signal.aborted && e instanceof Error && e.name === 'AbortError') {
        // No fluxo da Home esta tela so hospeda a leitura — cancelar volta para
        // a Home, nao para as opcoes de cadastro que a pessoa nunca pediu.
        if (autoLeitura.current) {
          autoLeitura.current = false;
          router.back();
          return;
        }
        setEstado({ fase: 'repouso' });
        return;
      }
      setEstado({ fase: 'erro', kind, codigo: codigoDoErro(e) });
    } finally {
      cancelamento.current = null;
    }
  }

  /**
   * Guarda a leitura inteira no rascunho de lote e vai para a revisao.
   *
   * So a receita passa por aqui. O membro, o medico e a data da consulta sao
   * resolvidos la, uma vez para a receita toda; aqui so normalizamos cada item.
   */
  function irParaRevisao(leitura: LeituraDeFoto) {
    const itens = leitura.items.map((item) => {
      const { campos, camposLidos } = normalizarLeitura(item);
      return { campos, camposLidos, readItem: item.index };
    });
    guardarReceita({
      itens,
      foto: foto.current ?? '',
      readId: leitura.readId,
      prescritorId: leitura.prescriber?.professionalId ?? null,
      prescriberName: leitura.prescriber?.nameRead ?? null,
      specialtyRead: leitura.prescriber?.specialtyRead ?? null,
      consultationDate: leitura.consultationDate ?? null,
    });
    router.push('/medicamento/receita');
  }

  function continuar(leitura: LeituraDeFoto, item: MedicamentoLido, kind: Kind) {
    const { campos, camposLidos } = normalizarLeitura(item);
    const token = guardarRascunho({
      campos,
      camposLidos,
      foto: foto.current ?? '',
      kind,
      readId: leitura.readId,
      readItem: item.index,
      prescritorId: leitura.prescriber?.professionalId ?? null,
    });
    router.push(`/medicamento/form/novo?rascunho=${token}`);
  }

  if (saindo) return <View style={styles.tela}><ScreenBackground colors={backgrounds.medications} /></View>;

  const lendo = estado.fase === 'lendo';
  // So a politica e o teto DIARIO desabilitam os cartoes. Rede ruim e IA
  // ocupada NAO: nesses casos tentar de novo e justamente o que resolve, e
  // desabilitar deixaria a pessoa sem saida com a culpa parecendo dela.
  const bloqueado =
    politicaVelha ||
    (estado.fase === 'erro' && estado.codigo === API_ERROR.PHOTO_READ_LIMIT_REACHED);

  return (
    <View style={styles.tela}>
      <ScreenBackground colors={backgrounds.medications} />

      <ScrollView
        contentContainerStyle={[
          styles.conteudo,
          { paddingTop: insets.top + spacing.md, paddingBottom: ESPACO_BARRA + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Adicionar medicamento"
          titleLines={2}
          onBack={() => router.back()}
          mostrarSino
        />

        <SurfaceCard style={styles.apresentacao}>
          <View style={styles.linha}>
            <IconTile
              size={54}
              icone="zap"
              {...(politicaVelha ? LADRILHO_NEUTRO : { fundo: colors.accent, traco: colors.onAccent })}
            />
            <View style={styles.apresentacaoTextos}>
              <Text style={styles.apresentacaoTitulo}>Cadastre seu medicamento com ajuda da IA</Text>
              <Text style={styles.apresentacaoCorpo}>
                Tire uma foto da receita ou da caixinha e eu preencho o cadastro. Você confere tudo
                antes de salvar.
              </Text>
            </View>
          </View>
        </SurfaceCard>

        {politicaVelha ? (
          <BlocoDeAviso
            tom="atencao"
            icone="shield"
            titulo="Para ler a foto, falta seu aceite na política nova"
            texto="A leitura usa um parceiro fora do Brasil, e isso está descrito na versão atual da política. O cadastro manual continua normal."
            acaoPrincipal={{
              rotulo: 'Ver a política',
              estilo: 'contorno',
              onPress: () => router.push('/conta/privacidade'),
            }}
          />
        ) : null}

        {estado.fase === 'erro' ? (
          <Erro codigo={estado.codigo} aoTentar={() => void enviar(estado.kind)} />
        ) : null}

        {lendo ? (
          <CartaoDeLeitura
            modo="lendo"
            segundos={segundos}
            onCancelar={() => cancelamento.current?.abort()}
          />
        ) : (
          <>
            <OpcaoDeFoto
              icone="file-text"
              ladrilho={LADRILHO_NEUTRO}
              titulo="Fotografar receita"
              descricao="A leitura identifica nome, dose e posologia"
              desabilitado={bloqueado}
              motivoDesabilitado="Disponível depois que você aceitar a política atual"
              onPress={() => escolherOrigem('receita')}
            />
            <OpcaoDeFoto
              icone="package"
              ladrilho={LADRILHO_ATENCAO}
              titulo="Fotografar caixinha"
              descricao="Identifica o medicamento pela embalagem"
              desabilitado={bloqueado}
              motivoDesabilitado="Disponível depois que você aceitar a política atual"
              onPress={() => escolherOrigem('caixa')}
            />
          </>
        )}

        {estado.fase === 'vazio' ? (
          <BlocoDeAviso
            tom="atencao"
            icone="image"
            titulo="Não identifiquei nenhum remédio nessa foto"
            texto="Acontece com foto tremida ou com pouca luz."
            dicas={DICAS[estado.kind]}
            acaoPrincipal={{
              rotulo: 'Tentar outra foto',
              estilo: 'preenchido',
              onPress: () => escolherOrigem(estado.kind),
            }}
            acaoSecundaria={{
              rotulo: 'Preencher manualmente',
              onPress: () => router.push('/medicamento/form/novo'),
            }}
          />
        ) : null}

        {estado.fase === 'lido' && estado.leitura.items.length > 1 ? (
          <SeletorDeRemedios
            itens={estado.leitura.items}
            escolhido={estado.escolhido}
            onEscolher={(i) => setEstado({ ...estado, escolhido: i })}
          />
        ) : null}

        {estado.fase === 'lido' && estado.escolhido !== null ? (
          <CartaoDeLeitura
            modo="resultado"
            item={estado.leitura.items.find((i) => i.index === estado.escolhido)!}
          />
        ) : null}

        {estado.fase === 'lido' ? (
          <Pressable
            onPress={() => {
              const item = estado.leitura.items.find((i) => i.index === estado.escolhido);
              if (item) continuar(estado.leitura, item, estado.kind);
            }}
            disabled={estado.escolhido === null}
            accessibilityRole="button"
            accessibilityState={{ disabled: estado.escolhido === null }}
            accessibilityHint={
              estado.escolhido === null ? 'Escolha um remédio da lista acima' : undefined
            }
            style={({ pressed }) => [
              styles.continuar,
              estado.escolhido === null && styles.continuarInativo,
              pressed && styles.pressionado,
            ]}
          >
            <Text style={styles.continuarTexto}>Continuar e revisar</Text>
          </Pressable>
        ) : null}

        {/* O divisor E o caminho manual: no mockup ele nao era alcancavel por
            toque nenhum, e um caminho de saida precisa existir de verdade. */}
        <Pressable
          onPress={() => router.push('/medicamento/form/novo')}
          accessibilityRole="button"
          accessibilityLabel="Preencher manualmente"
          accessibilityHint="Abre o formulário em branco"
          style={({ pressed }) => [styles.divisor, pressed && styles.pressionado]}
        >
          <View style={styles.risco} importantForAccessibility="no-hide-descendants" />
          <Text style={styles.divisorTexto}>ou preencha manualmente</Text>
          <View style={styles.risco} importantForAccessibility="no-hide-descendants" />
        </Pressable>

        <View style={styles.rodape}>
          <Feather name="lock" size={14} color={colors.textSecondary} style={styles.cadeado} />
          <View style={styles.rodapeTextos}>
            <Text style={styles.rodapeTexto}>
              A leitura é feita pela Groq, um parceiro com servidores fora do Brasil. A foto não
              treina nenhum modelo e não fica guardada lá. Na sua conta, a foto da caixinha fica
              guardada no cadastro do remédio, e dá para removê-la; a da receita, só se você pedir.
            </Text>
            <Pressable
              onPress={() => router.push('/conta/privacidade')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.rodapeLink}>Ler a política de privacidade</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** Dicas diferentes por origem: o que estraga a foto de um papel nao e o que estraga a de uma caixa. */
const DICAS: Record<Kind, string[]> = {
  receita: [
    'Enquadre só o papel, sem a mesa em volta.',
    'Apoie o papel numa superfície plana e espere o foco firmar.',
    'Prefira luz natural e evite a sombra da sua mão.',
  ],
  caixa: [
    'Aproxime a face da caixa onde está o nome.',
    'Evite reflexo do plástico e da luz do teto.',
    'Se a caixa estiver amassada, fotografe a bula.',
  ],
};

function Erro({ codigo, aoTentar }: { codigo: string; aoTentar: () => void }) {
  if (codigo === API_ERROR.PHOTO_READ_LIMIT_REACHED) {
    return (
      <BlocoDeAviso
        // NEUTRO, e nao ambar: nao ha o que fazer hoje, e ambar significa
        // "tem coisa para fazer agora" em todo o aplicativo.
        tom="neutro"
        icone="clock"
        titulo="Você já usou as leituras de hoje"
        texto="São 20 leituras por dia nesta conta. Amanhã libera de novo. Enquanto isso, dá para cadastrar o remédio preenchendo à mão."
      />
    );
  }

  return (
    <BlocoDeAviso
      tom="atencao"
      icone={codigo === API_ERROR.PHOTO_READ_BUSY ? 'clock' : 'wifi-off'}
      titulo={
        codigo === API_ERROR.PHOTO_READ_BUSY
          ? 'A leitura está congestionada agora'
          : 'Não consegui ler a foto'
      }
      texto={messageForError(codigo)}
      acaoPrincipal={{ rotulo: 'Tentar de novo', estilo: 'contorno', onPress: aoTentar }}
    />
  );
}

/**
 * O 504 da Vercel chega SEM corpo JSON quando a funcao e cortada, e o
 * parseError do cliente transforma isso em INTERNAL_ERROR. Sem esta traducao a
 * pessoa leria "algo deu errado do nosso lado" quando o problema foi a rede
 * dela — e a acao certa (tentar onde o sinal e melhor) ficaria escondida.
 */
function codigoDoErro(e: unknown): string {
  if (e instanceof ApiRequestError) {
    if (e.status === 504) return API_ERROR.PHOTO_READ_TIMEOUT;
    return e.code;
  }
  return API_ERROR.NETWORK_ERROR;
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: backgrounds.medications[0] },
  conteudo: { paddingHorizontal: spacing.xl },

  apresentacao: { padding: spacing.lg, marginTop: spacing.xl },
  linha: { flexDirection: 'row', alignItems: 'flex-start' },
  apresentacaoTextos: { flex: 1, marginLeft: spacing.md },
  apresentacaoTitulo: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.sectionTitle,
  },
  apresentacaoCorpo: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  continuar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    minHeight: 58,
    paddingVertical: spacing.lg,
    marginTop: spacing.xl,
  },
  continuarInativo: { backgroundColor: colors.accentDisabled },
  continuarTexto: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent },

  divisor: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
  },
  risco: { flex: 1, height: 1.5, backgroundColor: colors.accentGreen, opacity: 0.3 },
  divisorTexto: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.accentGreen,
    paddingHorizontal: spacing.md,
  },

  rodape: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.lg },
  cadeado: { marginTop: 2 },
  rodapeTextos: { flex: 1, marginLeft: spacing.sm },
  rodapeTexto: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  rodapeLink: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.accentGreen,
    paddingVertical: spacing.md,
  },
  pressionado: { opacity: 0.85 },
});
