import { useQuery } from '@tanstack/react-query';
import { healthApi, type AssistantMessage } from '@gestao/shared/api/health';
import { montarContexto } from '@gestao/shared/lib/contextoDeSaude';
import { limparMarkdown } from '@gestao/shared/lib/textoDoAssistente';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router';

import { useAssinaturaExigida, usePerfis, usePlano } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { useDialogos } from '@/ui/Dialogo';
import { Icone } from '@/ui/Icone';
import { Pagina } from '@/ui/Pagina';
import { ProfileSelector } from '@/ui/ProfileSelector';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './Assistente.module.css';

/** Quantas mensagens do historico a tela mostra quando a conta esta sem plano. */
const HISTORICO_SEM_PLANO = 20;

const ACOES = [
  {
    chave: 'remedios',
    rotulo: 'Meus remédios',
    icone: 'mci:pill',
    cor: 'var(--cor-quick-meds)',
    pergunta: 'Quais remédios estão cadastrados e quando é a próxima dose?',
  },
  {
    chave: 'sintomas',
    rotulo: 'Sintomas',
    icone: 'mci:thermometer',
    cor: 'var(--cor-quick-symptoms)',
    // Nao descreve sintoma nenhum: ABRE a conversa. Mandar "tenho febre" sem a
    // pessoa ter dito isso poria palavras na boca dela.
    pergunta: 'Quero falar sobre um sintoma que apareceu. O que você precisa saber para me ajudar?',
  },
  {
    chave: 'consultas',
    rotulo: 'Consultas',
    icone: 'mci:calendar-plus',
    cor: 'var(--cor-quick-appointments)',
    pergunta: 'Quando é a próxima consulta e com quem?',
  },
];

/**
 * Assistente de Saude.
 *
 * As regras do que ele responde vivem no servidor; esta tela nao repete
 * nenhuma. O contexto (remedios, proxima dose, consultas) vai PRONTO daqui,
 * porque so este navegador sabe que horas sao onde a pessoa esta.
 *
 * A TELA ABRE LIMPA, E ISSO NAO APAGA A MEMORIA DO ASSISTENTE: o que aparece e
 * estado desta tela; o que o modelo lembra sao as ultimas mensagens que o
 * servidor injeta no prompt. Trocar de pessoa tambem limpa — cada uma tem a
 * sua conversa.
 */
export function Assistente() {
  const { avisar, confirmar } = useDialogos();
  /**
   * Sem plano a tela CONTINUA AQUI: perguntar e recurso de IA (o servidor
   * recusa com 403), mas reler o que ja foi respondido nao e.
   */
  const { premium } = usePlano();
  const tratarAssinatura = useAssinaturaExigida();

  const perfis = usePerfis();
  const lista = perfis.data ?? [];
  const [escolhido, setEscolhido] = useState<string | null>(null);
  // Sem pessoa escolhida o assistente nao tem agenda para consultar; o titular
  // e quem mais pergunta sobre a propria familia.
  const perfilId =
    escolhido ?? lista.find((p) => p.isAccountHolder)?.id ?? lista[0]?.id ?? null;
  const perfil = lista.find((p) => p.id === perfilId) ?? null;
  const primeiroNome = perfil?.fullName.split(' ')[0] ?? '';

  const remedios = useQuery({
    queryKey: ['remedios', 'assistente', { perfilId }],
    queryFn: () => {
      const agora = new Date();
      return healthApi.listMedications({
        from: startOfDay(agora),
        to: endOfDay(addDays(agora, 1)),
        profileId: perfilId,
      });
    },
    enabled: Boolean(perfilId),
  });
  const consultas = useQuery({
    queryKey: ['consultas', 'assistente', { perfilId }],
    queryFn: () => healthApi.listAppointments({ profileId: perfilId, upcoming: true }),
    enabled: Boolean(perfilId),
  });
  /** Sem plano, a unica coisa util aqui e reler as respostas que ja vieram. */
  const historico = useQuery({
    queryKey: ['assistente', 'historico', { perfilId }],
    queryFn: async () => (await healthApi.historicoDoAssistente(perfilId)).slice(-HISTORICO_SEM_PLANO),
    enabled: !premium && Boolean(perfilId),
  });

  const [novas, setNovas] = useState<AssistantMessage[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState('');
  /**
   * Passou do tempo de uma resposta normal. Tres pontinhos parados por quinze
   * segundos parecem travamento; o aviso e "provavelmente" porque, sem
   * streaming, nao da para ter certeza de que ele esta buscando.
   */
  const [demorando, setDemorando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  // Deixar na tela a conversa da pessoa anterior seria mentira.
  useEffect(() => setNovas([]), [perfilId]);

  const mensagens = premium ? novas : [...(historico.data ?? []), ...novas];

  useEffect(() => {
    if (novas.length > 0 || enviando) fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [novas.length, enviando]);

  async function enviar(pergunta: string) {
    const limpa = pergunta.trim();
    if (limpa.length < 2 || enviando) return;

    setEnviando(true);
    const anterior = texto;
    setTexto('');
    const avisarDemora = window.setTimeout(() => setDemorando(true), 5000);

    try {
      const resposta = await healthApi.perguntarAoAssistente({
        question: limpa,
        profileId: perfilId,
        context: montarContexto(
          perfil,
          remedios.data ?? [],
          consultas.data ?? [],
          new Date(),
          lista,
        ),
      });
      setNovas((atual) => [...atual, ...resposta]);
    } catch (e) {
      // O plano venceu com a tela aberta. O servidor recusa ANTES de gravar: a
      // pergunta volta para o campo e a pessoa vai para a assinatura.
      if (tratarAssinatura(e)) {
        setTexto(anterior || limpa);
        return;
      }

      /**
       * Antes de dizer que falhou, CONFERIR SE NAO FUNCIONOU. O servidor grava
       * pergunta e resposta juntas; um erro aqui (a rede caiu na volta) nao
       * significa que nada aconteceu la. Sem isto a pessoa reenviaria, e a
       * busca seria paga duas vezes.
       */
      const recuperado = await recuperarDoHistorico(limpa);
      if (recuperado) {
        setNovas((atual) => [...atual, ...recuperado]);
        return;
      }

      // O que foi digitado VOLTA para o campo.
      setTexto(anterior || limpa);
      void avisar('Não consegui responder', mensagemDoErro(e));
    } finally {
      window.clearTimeout(avisarDemora);
      setDemorando(false);
      setEnviando(false);
    }
  }

  /** Devolve SO O PAR — a pergunta e o que veio depois — se o servidor concluiu. */
  async function recuperarDoHistorico(pergunta: string): Promise<AssistantMessage[] | null> {
    try {
      const tudo = await healthApi.historicoDoAssistente(perfilId);
      const ultima = tudo.map((m) => m.role).lastIndexOf('user');
      if (ultima === -1 || tudo[ultima]?.content !== pergunta) return null;
      return tudo.slice(ultima);
    } catch {
      return null;
    }
  }

  /**
   * EMERGENCIA NAO E PERGUNTA: nao manda nada para o modelo. Abre o aviso do
   * 192 na hora, sem rede e sem espera.
   */
  async function emergencia() {
    const ligar = await confirmar(
      'Emergência',
      'Em caso de risco — falta de ar, convulsão, desmaio, sangramento intenso ou bebê que não acorda — ligue para o SAMU agora, no 192.',
      'Ligar 192',
    );
    if (ligar) window.location.href = 'tel:192';
  }

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    void enviar(texto);
  }

  // Enter envia; Shift+Enter quebra a linha.
  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar(texto);
    }
  }

  const semTexto = texto.trim().length < 2;

  return (
    <Pagina area="assistant" largura="larga">
      <ScreenHeader title="Assistente de Saúde" mostrarSino />

      <div className={estilos.grade}>
        <div className={estilos.seletor}>
          <ProfileSelector
            profiles={lista}
            selectedId={perfilId}
            onSelect={setEscolhido}
            tituloDoPainel="Começar por"
            permitirTodos={false}
          />
        </div>

        {/* Saudacao e mensagens no MESMO cartao: a faixa colorida e o topo do painel. */}
        <SurfaceCard flush className={estilos.painel}>
          <div className={estilos.saudacao}>
            <p className={estilos.ola}>{primeiroNome ? `Olá, ${primeiroNome}` : 'Olá'}</p>
            <p className={estilos.subtitulo}>Como posso ajudar você hoje?</p>
          </div>

          <div className={estilos.conversa} aria-live="polite">
            {perfis.isPending || (!premium && historico.isPending && Boolean(perfilId)) ? (
              <Carregando />
            ) : mensagens.length === 0 && !premium ? (
              <Bolha
                autor="assistant"
                texto="Quando houver conversas anteriores, elas aparecem aqui para você reler."
              />
            ) : mensagens.length === 0 ? (
              <>
                <Bolha
                  autor="assistant"
                  texto="Posso ver os remédios, doses e consultas que a sua família cadastrou aqui, e também procurar na internet o que você precisar saber."
                />
                <Bolha
                  autor="assistant"
                  texto="Sou uma inteligência artificial e posso errar — confira comigo a fonte e, no que for sério, fale com o médico. Em emergência, ligue 192."
                />
                {/* A tela abre limpa, mas o assistente LEMBRA; dizer isso evita o
                    susto de ele saber o que nao esta escrito em lugar nenhum. */}
                <Bolha
                  autor="assistant"
                  texto="Esta tela sempre começa vazia, mas eu lembro do que conversamos por último — dá para continuar de onde paramos."
                />
              </>
            ) : (
              mensagens.map((m) => <Bolha key={m.id} autor={m.role} texto={m.content} />)
            )}

            {enviando ? <Bolha autor="assistant" texto="" pensando /> : null}
            {demorando ? (
              <p className={estilos.demorando}>
                Provavelmente estou procurando na internet. Isso leva alguns segundos.
              </p>
            ) : null}
            <div ref={fim} />
          </div>
        </SurfaceCard>

        {/* As acoes rapidas SAO perguntas: sem plano, sairiam todas em 403.
            A emergencia fica sempre — ela nao depende do assistente. */}
        <section className={estilos.acoes} aria-label="Ações rápidas">
          <h2 className={estilos.acoesTitulo}>Ações rápidas</h2>
          <div className={estilos.acoesGrade}>
            {premium
              ? ACOES.map((a) => (
                  <button
                    key={a.chave}
                    type="button"
                    className={estilos.acao}
                    disabled={enviando}
                    onClick={() => void enviar(a.pergunta)}
                  >
                    <span className={estilos.acaoCirculo} style={{ background: a.cor }}>
                      <Icone nome={a.icone} size={22} />
                    </span>
                    {a.rotulo}
                  </button>
                ))
              : null}
            <button
              type="button"
              className={estilos.acao}
              onClick={() => void emergencia()}
              aria-label="Emergência. Mostra o número do SAMU."
            >
              <span className={estilos.acaoCirculo} style={{ background: 'var(--cor-terracotta)' }}>
                <Icone nome="mci:medical-bag" size={22} />
              </span>
              Emergência
            </button>
          </div>
        </section>

        <div className={estilos.rodape}>
          {premium ? (
            <>
              <form className={estilos.campo} onSubmit={aoEnviar}>
                <textarea
                  className={estilos.entrada}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={aoTeclar}
                  placeholder="Digite sua dúvida..."
                  rows={1}
                  maxLength={1000}
                  readOnly={enviando}
                  aria-label="Sua dúvida"
                />
                <button
                  type="submit"
                  className={estilos.enviar}
                  disabled={enviando || semTexto}
                  aria-label="Enviar pergunta"
                >
                  {enviando ? <span className={botoes.girando} /> : <Icone nome="send" size={18} />}
                </button>
              </form>
              <p className={estilos.cuidado}>
                <Icone nome="lock" size={12} />
                Suas informações são tratadas com cuidado.
              </p>
            </>
          ) : (
            <SurfaceCard solido className={estilos.trancado}>
              <div className={estilos.trancadoLinha}>
                <span className={estilos.trancadoSelo}>
                  <Icone nome="mci:star-four-points" size={20} />
                </span>
                <div>
                  <p className={estilos.trancadoTitulo}>O assistente faz parte da assinatura</p>
                  <p className={estilos.trancadoTexto}>
                    As conversas anteriores continuam aqui para você reler.
                  </p>
                </div>
              </div>
              <Link to="/conta/assinatura" className={`${botoes.ambar} ${botoes.largo}`}>
                Ver assinatura
              </Link>
            </SurfaceCard>
          )}
        </div>
      </div>
    </Pagina>
  );
}

function Bolha({
  autor,
  texto,
  pensando = false,
}: {
  autor: 'user' | 'assistant';
  texto: string;
  pensando?: boolean;
}) {
  const doAssistente = autor === 'assistant';
  // So o texto do assistente passa pela limpeza: se a pessoa usou asterisco,
  // era asterisco mesmo.
  const limpo = doAssistente ? limparMarkdown(texto) : texto;

  return (
    <div className={estilos.linha} data-autor={autor}>
      {doAssistente ? (
        <span className={estilos.faisca} aria-hidden="true">
          <Icone nome="mci:star-four-points" size={18} />
        </span>
      ) : null}
      <p className={estilos.bolha}>
        {/* Sem isto o leitor de tela le a bolha sem dizer de quem e. */}
        <span className="so-leitor-de-tela">{doAssistente ? 'Assistente: ' : 'Você: '}</span>
        {pensando ? (
          <>
            <span aria-hidden="true" className={estilos.pensando}>
              • • •
            </span>
            <span className="so-leitor-de-tela">pensando</span>
          </>
        ) : (
          limpo
        )}
      </p>
    </div>
  );
}
