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
import folhaReceita from '@/imagens/repag/folha-receita.webp';
import maoReceita from '@/imagens/repag/mao-receita.webp';
import { escolherArquivoDeDocumento, escolherFotoDeDocumento } from '@/lib/foto';
import { usePessoaAtiva } from '@/lib/pessoaAtiva';
import { Avatar } from '@/ui/Avatar';
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
  const { pessoaOuTitular } = usePessoaAtiva();
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
  /** `arquivo`: o seletor aceita tambem PDF (a primeira pagina vira imagem). */
  async function pegarFoto(kind: Kind, arquivo = false) {
    const escolha = arquivo ? await escolherArquivoDeDocumento() : await escolherFotoDeDocumento({ camera: true });
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
    <Pagina area="medications" largura="larga">
      <ScreenHeader
        title="Leitura de receita com IA"
        subtitle="Tire uma foto ou envie a receita e deixe a IA ler as informações para você."
        voltar={doisPaineis ? undefined : '/remedios'}
        ilustracao={maoReceita}
        contexto={false}
      />

      <div className={estilos.pilha}>
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

        {/* Mock 09: enviar | analisando | o que a IA confere. */}
        <div className={estilos.tres}>
          <SurfaceCard className={estilos.coluna}>
            <div className={estilos.paraQuem}>
              <span className={estilos.paraQuemIcone} aria-hidden="true">
                <Icone nome="user" size={26} />
              </span>
              <div className={estilos.textos}>
                <p className={estilos.rotuloPequeno}>Para quem</p>
                <p className={estilos.paraQuemNome}>
                  {pessoaOuTitular ? (
                    <Avatar
                      nome={pessoaOuTitular.fullName}
                      color={pessoaOuTitular.avatarColor ?? undefined}
                      photo={pessoaOuTitular.photo ?? undefined}
                      size={28}
                    />
                  ) : null}
                  {pessoaOuTitular?.fullName.split(' ')[0] ?? '—'}
                </p>
                <p className={estilos.corpo}>Você confirma ou troca a pessoa na revisão.</p>
              </div>
            </div>

            <div className={estilos.envio}>
              <span className={estilos.envioIcone} aria-hidden="true">
                <Icone nome="camera" size={34} />
              </span>
              <h2 className={estilos.envioTitulo}>Enviar foto da receita</h2>
              <p className={estilos.corpo}>Tire uma foto nítida ou envie um arquivo (jpg, png ou pdf).</p>
              {premium ? (
                <>
                  <button
                    type="button"
                    className={`${botoes.ambar} ${botoes.largo}`}
                    disabled={bloqueado || lendo}
                    onClick={() => void pegarFoto('receita')}
                  >
                    <Icone nome="camera" size={20} />
                    Tirar uma foto
                  </button>
                  <span className={estilos.ou}>ou</span>
                  <button
                    type="button"
                    className={`${botoes.contorno} ${botoes.largo}`}
                    disabled={bloqueado || lendo}
                    onClick={() => void pegarFoto('receita', true)}
                  >
                    <Icone nome="upload-cloud" size={20} />
                    Enviar arquivo
                  </button>
                  <button
                    type="button"
                    className={`${botoes.texto} ${estilos.caixinha}`}
                    disabled={bloqueado || lendo}
                    onClick={() => void pegarFoto('caixa')}
                  >
                    <Icone nome="package" size={18} />
                    É uma caixinha? Fotografar a embalagem
                  </button>
                </>
              ) : (
                <Link to="/conta/assinatura" className={`${botoes.ambar} ${botoes.largo}`}>
                  <Icone nome="lock" size={18} />
                  Faz parte da assinatura
                </Link>
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard className={`${estilos.coluna} ${estilos.centro}`}>
            <img src={folhaReceita} alt="" className={estilos.folha} />
            {lendo ? (
              <div role="status" className={estilos.analisando}>
                <span className={`${botoes.girando} ${estilos.girando}`} />
                <p className={estilos.envioTitulo}>Analisando sua receita…</p>
                <p className={estilos.corpo}>{espera(segundos)}</p>
                <button type="button" className={botoes.contorno} onClick={() => cancelamento.current?.abort()}>
                  Cancelar
                </button>
              </div>
            ) : estado.fase === 'erro' ? (
              <Erro codigo={estado.codigo} aoTentar={() => void enviar(estado.kind)} />
            ) : (
              <div className={estilos.analisando}>
                <p className={estilos.envioTitulo}>Aguardando a receita</p>
                <p className={estilos.corpo}>A leitura leva alguns segundos. Nada é salvo antes de você conferir.</p>
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className={estilos.coluna}>
            <h2 className={estilos.confiraTitulo}>
              <span className={estilos.confiraIcone} aria-hidden="true">
                <Icone nome="check" size={18} />
              </span>
              Confira os dados lidos
            </h2>
            <ul className={estilos.confira}>
              {[
                { icone: 'user', rotulo: 'Nome do médico' },
                { icone: 'mci:medical-bag', rotulo: 'Especialidade' },
                { icone: 'calendar', rotulo: 'Data da consulta' },
                { icone: 'mci:pill', rotulo: 'Medicamentos e posologia' },
              ].map((c) => (
                <li key={c.rotulo}>
                  <span className={estilos.confiraLadrilho} aria-hidden="true">
                    <Icone nome={c.icone} size={22} />
                  </span>
                  <span className={estilos.textos}>
                    <span className={estilos.confiraRotulo}>{c.rotulo}</span>
                    <span className={estilos.corpo}>Preenchido pela IA</span>
                  </span>
                  <Icone nome="check" size={20} />
                </li>
              ))}
            </ul>
            <p className={estilos.corpo}>
              Depois da leitura, você revisa cada campo, corrige o que precisar e só então salva.
            </p>
          </SurfaceCard>
        </div>

        <p className={estilos.faixa}>
          <Icone nome="sprout" size={20} />A leitura da receita é feita por IA para facilitar sua vida, mas pode ter
          erros. Sempre confira os dados antes de salvar.
        </p>

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
