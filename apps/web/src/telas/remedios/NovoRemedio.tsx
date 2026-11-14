import { API_ERROR, messageForError } from '@gestao/shared';
import {
  healthApi,
  type LeituraDeFoto,
  type MedicamentoLido,
} from '@gestao/shared/api/health';
import { formaVisual } from '@gestao/shared/lib/posologia';
import {
  consumirFotoParaLeitura,
  guardarRascunho,
  guardarReceita,
  normalizarLeitura,
} from '@gestao/shared/lib/rascunhoDeMedicamento';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { ApiRequestError } from '@/api/cliente';
import { useAssinaturaExigida, usePlano } from '@/api/consultas';
import { escolherFotoDeDocumento } from '@/lib/foto';
import { BlocoDeAviso } from '@/ui/BlocoDeAviso';
import botoes from '@/ui/botoes.module.css';
import { useDialogos } from '@/ui/Dialogo';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_ATENCAO, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './NovoRemedio.module.css';
import comuns from './remedios.module.css';
import { useAreaDeRemedios } from './RemediosLayout';

type Kind = 'receita' | 'caixa';

type Estado =
  | { fase: 'repouso' }
  | { fase: 'lendo'; kind: Kind }
  | { fase: 'lido'; kind: Kind; leitura: LeituraDeFoto; escolhido: number | null }
  | { fase: 'vazio'; kind: Kind }
  | { fase: 'erro'; kind: Kind; codigo: string };

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

/**
 * Adicionar medicamento: fotografar a receita ou a caixinha para a IA
 * preencher o cadastro, ou seguir para o formulario em branco.
 *
 * A receita leva a revisao em lote (pode ter varios remedios, o medico e a
 * data da consulta); a caixinha, direto ao formulario de um remedio. Nada e
 * salvo aqui: a foto e a leitura viajam em memoria ate a pessoa conferir.
 */
export function NovoRemedio() {
  const navigate = useNavigate();
  const { doisPaineis } = useAreaDeRemedios();
  const [params, setParams] = useSearchParams();
  const { avisar } = useDialogos();
  const { premium, politicaVelha } = usePlano();
  const tratarAssinatura = useAssinaturaExigida();

  const [estado, setEstado] = useState<Estado>({ fase: 'repouso' });
  const [segundos, setSegundos] = useState(0);

  /** A foto escolhida. Em ref: nao e desenhada, e nao deve ficar no estado. */
  const foto = useRef<string | null>(null);
  const cancelamento = useRef<AbortController | null>(null);
  /** A pessoa saiu da tela: a resposta que chegar depois nao navega ninguem. */
  const abandonado = useRef(false);

  useEffect(() => {
    abandonado.current = false;
    return () => {
      abandonado.current = true;
      cancelamento.current?.abort();
      foto.current = null;
    };
  }, []);

  // Foto escolhida no Inicio: ela chega em memoria, e a tela ja nasce lendo.
  useEffect(() => {
    if (!params.get('fotoPronta')) return;
    setParams({}, { replace: true });
    const img = consumirFotoParaLeitura();
    if (!img) return;
    foto.current = img;
    void enviar('receita');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O contador so serve para o texto de espera mudar com o tempo.
  useEffect(() => {
    if (estado.fase !== 'lendo') return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [estado.fase]);

  /** Abre o seletor de arquivo e manda ler. Chamado direto do clique. */
  async function pegarFoto(kind: Kind) {
    const escolha = await escolherFotoDeDocumento({ camera: true });
    if (!escolha.ok) {
      if (escolha.motivo === 'falha') {
        void avisar('Não consegui usar a foto', 'Tente de novo, ou escolha outra imagem.');
      }
      return;
    }
    foto.current = escolha.dataUri;
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
      if (kind === 'receita') {
        irParaRevisao(leitura);
        return;
      }
      setEstado({
        fase: 'lido',
        kind,
        leitura,
        escolhido: leitura.items.length === 1 ? leitura.items[0]!.index : null,
      });
    } catch (e) {
      if (abandonado.current) return;
      // Foi a propria pessoa que cancelou: volta ao comeco, sem mensagem de erro.
      if (controller.signal.aborted) {
        setEstado({ fase: 'repouso' });
        return;
      }
      if (tratarAssinatura(e)) {
        setEstado({ fase: 'repouso' });
        return;
      }
      setEstado({ fase: 'erro', kind, codigo: codigoDoErro(e) });
    } finally {
      cancelamento.current = null;
    }
  }

  function irParaRevisao(leitura: LeituraDeFoto) {
    guardarReceita({
      itens: leitura.items.map((item) => {
        const { campos, camposLidos } = normalizarLeitura(item);
        return { campos, camposLidos, readItem: item.index };
      }),
      foto: foto.current ?? '',
      readId: leitura.readId,
      prescritorId: leitura.prescriber?.professionalId ?? null,
      prescriberName: leitura.prescriber?.nameRead ?? null,
      specialtyRead: leitura.prescriber?.specialtyRead ?? null,
      consultationDate: leitura.consultationDate ?? null,
    });
    navigate('/medicamento/receita');
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
    navigate(`/medicamento/form/novo?rascunho=${token}`);
  }

  const lendo = estado.fase === 'lendo';
  // A leitura fica indisponivel sem o aceite da politica atual, e depois do
  // teto diario. O cadastro manual continua aberto nos dois casos.
  const bloqueado =
    politicaVelha ||
    (estado.fase === 'erro' && estado.codigo === API_ERROR.PHOTO_READ_LIMIT_REACHED);
  const itemEscolhido =
    estado.fase === 'lido'
      ? (estado.leitura.items.find((i) => i.index === estado.escolhido) ?? null)
      : null;

  return (
    <Pagina area="medications">
      <ScreenHeader
        title="Adicionar medicamento"
        voltar={doisPaineis ? undefined : '/remedios'}
        mostrarSino
      />

      <div className={estilos.pilha}>
        <SurfaceCard className={`${comuns.cartao} ${estilos.linha}`}>
          <IconTile
            size={54}
            icone="mci:star-four-points"
            {...(politicaVelha
              ? LADRILHO_NEUTRO
              : { fundo: 'var(--cor-accent)', traco: 'var(--cor-on-accent)' })}
          />
          <div className={estilos.textos}>
            <h2 className={estilos.titulo}>Cadastre seu medicamento com ajuda da IA</h2>
            <p className={estilos.corpo}>
              Envie uma foto da receita ou da caixinha e eu preencho o cadastro. Você confere tudo
              antes de salvar.
            </p>
          </div>
        </SurfaceCard>

        {/* Sem plano, a politica nao e o que impede a leitura: o aviso dela so
            confundiria quem ve o cadeado logo abaixo. */}
        {politicaVelha && premium ? (
          <BlocoDeAviso
            tom="atencao"
            icone="shield"
            titulo="Para ler a foto, falta seu aceite na política nova"
            texto="A leitura usa um parceiro fora do Brasil, e isso está descrito na versão atual da política. O cadastro manual continua normal."
            acaoPrincipal={{
              rotulo: 'Ver a política',
              estilo: 'contorno',
              onClick: () => navigate('/conta/privacidade'),
            }}
          />
        ) : null}

        {estado.fase === 'erro' ? (
          <Erro codigo={estado.codigo} aoTentar={() => void enviar(estado.kind)} />
        ) : null}

        {lendo ? (
          <SurfaceCard className={comuns.cartao}>
            <div className={estilos.linha} role="status">
              <span className={`${botoes.girando} ${estilos.girando}`} />
              <div className={estilos.textos}>
                <p className={estilos.titulo}>Lendo a foto</p>
                <p className={estilos.corpo}>{espera(segundos)}</p>
              </div>
            </div>
            <button
              type="button"
              className={`${botoes.contorno} ${botoes.largo} ${estilos.cancelar}`}
              onClick={() => cancelamento.current?.abort()}
            >
              Cancelar
            </button>
          </SurfaceCard>
        ) : (
          <>
            <OpcaoDeFoto
              icone="camera"
              ladrilho={LADRILHO_NEUTRO}
              titulo="Fotografar receita"
              descricao="A IA lê nome, dose e posologia"
              desabilitado={premium && bloqueado}
              cadeado={!premium}
              onClick={() => void pegarFoto('receita')}
            />
            <OpcaoDeFoto
              icone="package"
              ladrilho={LADRILHO_ATENCAO}
              titulo="Fotografar caixinha"
              descricao="Identifique o medicamento automaticamente"
              desabilitado={premium && bloqueado}
              cadeado={!premium}
              onClick={() => void pegarFoto('caixa')}
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
              onClick: () => void pegarFoto(estado.kind),
            }}
            acaoSecundaria={{
              rotulo: 'Preencher manualmente',
              onClick: () => navigate('/medicamento/form/novo'),
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

        {itemEscolhido ? <ResultadoDaLeitura item={itemEscolhido} /> : null}

        {estado.fase === 'lido' ? (
          <button
            type="button"
            className={`${botoes.verde} ${botoes.largo}`}
            disabled={!itemEscolhido}
            onClick={() => {
              if (itemEscolhido) continuar(estado.leitura, itemEscolhido, estado.kind);
            }}
          >
            Continuar e revisar
          </button>
        ) : null}

        {/* O divisor E o caminho manual: um caminho de saida precisa ser
            alcancavel de verdade. */}
        <Link to="/medicamento/form/novo" className={estilos.divisor}>
          <span>ou preencha manualmente</span>
        </Link>

        <div className={estilos.rodape}>
          <Icone nome="lock" size={14} />
          <p>
            A leitura é feita pela Groq, um parceiro com servidores fora do Brasil. A foto não
            treina nenhum modelo e não fica guardada lá. Na sua conta, a foto da caixinha fica
            guardada no cadastro do remédio, e dá para removê-la; a da receita, só se você pedir.{' '}
            <Link to="/conta/privacidade">Ler a política de privacidade</Link>
          </p>
        </div>
      </div>
    </Pagina>
  );
}

function OpcaoDeFoto({
  icone,
  ladrilho,
  titulo,
  descricao,
  desabilitado,
  cadeado,
  onClick,
}: {
  icone: string;
  ladrilho: { fundo: string; traco: string };
  titulo: string;
  descricao: string;
  desabilitado: boolean;
  cadeado: boolean;
  onClick: () => void;
}) {
  const conteudo = (
    <>
      <IconTile size={44} icone={icone} {...ladrilho} />
      <span className={estilos.textos}>
        <span className={estilos.opcaoTitulo}>{titulo}</span>
        <span className={estilos.opcaoDescricao}>
          {desabilitado
            ? 'Disponível depois que você aceitar a política atual'
            : cadeado
              ? 'Faz parte da assinatura'
              : descricao}
        </span>
      </span>
      <span className={estilos.opcaoBotao} data-cadeado={cadeado ? '' : undefined}>
        <Icone nome={cadeado ? 'lock' : 'camera'} size={16} />
        {cadeado ? 'Assinatura' : 'Escolher foto'}
      </span>
    </>
  );

  // Sem plano, o cartao leva a explicacao da assinatura — o seletor nem abre,
  // para ninguem enviar uma foto que o servidor vai recusar.
  return cadeado ? (
    <Link to="/conta/assinatura" className={estilos.opcao}>
      {conteudo}
    </Link>
  ) : (
    <button type="button" className={estilos.opcao} disabled={desabilitado} onClick={onClick}>
      {conteudo}
    </button>
  );
}

function SeletorDeRemedios({
  itens,
  escolhido,
  onEscolher,
}: {
  itens: MedicamentoLido[];
  escolhido: number | null;
  onEscolher: (index: number) => void;
}) {
  return (
    <SurfaceCard className={comuns.cartao}>
      <fieldset className={estilos.seletor}>
        <legend className={estilos.titulo}>Encontrei {itens.length} remédios nesta foto</legend>
        <p className={estilos.corpo}>
          Escolha qual cadastrar agora. Dá para cadastrar os outros depois, um de cada vez.
        </p>
        {itens.map((item) => {
          const ativo = escolhido === item.index;
          return (
            <label key={item.index} className={estilos.item} data-ativo={ativo ? '' : undefined}>
              <input
                type="radio"
                name="remedio-lido"
                className={estilos.radio}
                checked={ativo}
                onChange={() => onEscolher(item.index)}
              />
              <Icone
                nome={ativo ? 'check-circle' : 'circle'}
                size={18}
                color={ativo ? 'var(--cor-accent-green)' : 'var(--cor-text-secondary)'}
              />
              <span className={estilos.textos}>
                <span className={estilos.itemNome}>
                  {[item.name, item.strength].filter(Boolean).join(' ')}
                </span>
                <span className={estilos.opcaoDescricao}>{resumoDoItem(item)}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </SurfaceCard>
  );
}

function ResultadoDaLeitura({ item }: { item: MedicamentoLido }) {
  const completo = Boolean(item.name && item.strength && (item.scheduleType || item.packageAmount));

  return (
    <SurfaceCard className={comuns.cartao}>
      <div className={estilos.linha}>
        <IconTile size={44} icone="clipboard" {...LADRILHO_NEUTRO} />
        <h2 className={estilos.titulo}>O que eu li na foto</h2>
      </div>

      <dl className={estilos.campos}>
        <dt>Nome do medicamento</dt>
        <dd>{[item.name, item.strength].filter(Boolean).join(' ')}</dd>
        {/* Aviso NO NOME, e so nele: e onde a correcao silenciosa do modelo
            faz estrago — "Amoxicilna" virando "Amoxicilina". */}
        <dd className={estilos.confira}>
          <Icone nome="alert-circle" size={14} />
          Confira o nome antes de salvar.
        </dd>
        {item.packageAmount ? (
          <>
            <dt>Quantas vêm na caixa</dt>
            <dd>{`${item.packageAmount} ${item.form ?? ''}`.trim()}</dd>
          </>
        ) : null}
        {item.scheduleType ? (
          <>
            <dt>{formaVisual(item.form) === 'jato' ? 'Como aplicar' : 'Como tomar'}</dt>
            <dd>{comoTomar(item)}</dd>
          </>
        ) : null}
      </dl>

      <p className={estilos.pronto} data-incompleto={completo ? undefined : ''}>
        <Icone nome={completo ? 'check' : 'edit-3'} size={14} />
        {completo ? 'Pronto para revisar' : 'Revise e complete'}
      </p>
      {completo ? null : (
        <p className={estilos.corpo}>O que não aparece aqui você preenche na próxima tela.</p>
      )}
    </SurfaceCard>
  );
}

function Erro({ codigo, aoTentar }: { codigo: string; aoTentar: () => void }) {
  if (codigo === API_ERROR.PHOTO_READ_LIMIT_REACHED) {
    return (
      <BlocoDeAviso
        tom="neutro"
        icone="clock"
        titulo="Você já usou as leituras de hoje"
        texto="São 20 leituras por dia nesta conta. Amanhã libera de novo. Enquanto isso, dá para cadastrar o remédio preenchendo à mão."
      />
    );
  }
  const congestionada = codigo === API_ERROR.PHOTO_READ_BUSY;
  return (
    <BlocoDeAviso
      tom="atencao"
      icone={congestionada ? 'clock' : 'wifi-off'}
      titulo={congestionada ? 'A leitura está congestionada agora' : 'Não consegui ler a foto'}
      texto={messageForError(codigo)}
      acaoPrincipal={{ rotulo: 'Tentar de novo', estilo: 'contorno', onClick: aoTentar }}
    />
  );
}

function codigoDoErro(e: unknown): string {
  if (e instanceof ApiRequestError) {
    // 504 e o corte da plataforma: a leitura estourou o prazo.
    if (e.status === 504) return API_ERROR.PHOTO_READ_TIMEOUT;
    return e.code;
  }
  return API_ERROR.NETWORK_ERROR;
}

function espera(segundos: number): string {
  if (segundos < 6) return 'Isso leva alguns segundos.';
  if (segundos < 20) return 'A conexão está lenta. Ainda estou enviando a foto.';
  return 'Se quiser, cancele e tente de novo onde o sinal for melhor.';
}

function resumoDoItem(item: MedicamentoLido): string {
  if (item.scheduleType === 'interval' && item.intervalHours) {
    return item.intervalHours === 24 ? '1x ao dia' : `a cada ${item.intervalHours} horas`;
  }
  if (item.scheduleType === 'fixed_times' && item.times.length > 0) {
    return `às ${item.times.join(' e ')}`;
  }
  if (item.scheduleType === 'as_needed') return 'se necessário';
  return 'sem horário na foto';
}

function comoTomar(item: MedicamentoLido): string {
  const dose = item.doseAmount
    ? `${item.doseAmount} ${item.doseUnit ?? item.form ?? ''}`.trim()
    : null;
  return [dose, item.scheduleType ? resumoDoItem(item) : null].filter(Boolean).join(' ') || '—';
}
