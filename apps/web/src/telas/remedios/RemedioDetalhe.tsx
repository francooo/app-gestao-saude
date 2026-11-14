import { useQueryClient } from '@tanstack/react-query';
import { healthApi, type Medication, type MedicationPatch } from '@gestao/shared/api/health';
import {
  dataDeTermino,
  diaPorExtenso,
  estoqueBaixo,
  nivel,
  quantidadeDoEstoque,
  validadeCurta,
} from '@gestao/shared/lib/estoque';
import {
  diaCurto,
  estadoHoje,
  formaVisual,
  hora,
  posologia,
  proximaDose,
  tituloDoMedicamento,
  type EstadoHoje,
} from '@gestao/shared/lib/posologia';
import { isSameDay, isTomorrow } from 'date-fns';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { CHAVES, useRemedio } from '@/api/consultas';
import { mensagemDoErro, useMarcarDose } from '@/api/doses';
import { escolherFotoDeDocumento } from '@/lib/foto';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { useDialogos } from '@/ui/Dialogo';
import { DoseButton } from '@/ui/DoseButton';
import { Icone } from '@/ui/Icone';
import {
  IconTile,
  LADRILHO_ATENCAO,
  LADRILHO_NEUTRO,
  LADRILHO_POR_FORMA,
} from '@/ui/IconTile';
import { Aviso, Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { BarraDeProgresso, SeloDeStatus } from '@/ui/Selo';
import { SurfaceCard } from '@/ui/SurfaceCard';

import { FotoDoRemedio, PrescriptionCard } from './Anexos';
import { HistoricoDeDoses } from './HistoricoDeDoses';
import estilos from './remedios.module.css';
import { useAreaDeRemedios } from './RemediosLayout';

/** Detalhe de um remedio: situacao de hoje, posologia, estoque, receita e historico. */
export function RemedioDetalhe() {
  const { id } = useParams();
  const { doisPaineis } = useAreaDeRemedios();
  const consulta = useRemedio(id);

  return (
    <Pagina area="medications" largura="larga">
      {/* Com a lista ao lado, o voltar nao tem para onde ir. */}
      <ScreenHeader
        title="Detalhes do medicamento"
        voltar={doisPaineis ? undefined : '/remedios'}
        mostrarSino
      />

      {consulta.isPending ? (
        <Carregando />
      ) : !consulta.data ? (
        <div className={estilos.secao}>
          <Aviso
            icone="alert-circle"
            erro
            acao={{ rotulo: 'Tentar de novo', onClick: () => void consulta.refetch() }}
          >
            {consulta.isError ? mensagemDoErro(consulta.error) : 'Remédio não encontrado.'}
          </Aviso>
        </div>
      ) : (
        // A chave refaz os estados locais (fotos em envio) ao trocar de remedio.
        <Conteudo key={consulta.data.remedio.id} m={consulta.data.remedio} agora={consulta.data.agora} />
      )}
    </Pagina>
  );
}

function Conteudo({ m, agora }: { m: Medication; agora: Date }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirmar, avisar } = useDialogos();
  const { marcar, emVoo } = useMarcarDose();

  /** Envio ou remocao da receita em andamento. */
  const [anexando, setAnexando] = useState(false);
  const [fotoCaixa, setFotoCaixa] = useState<'enviando' | 'removendo' | null>(null);

  const titulo = tituloDoMedicamento(m);
  const estado = estadoHoje(m, agora);
  const forma = LADRILHO_POR_FORMA[formaVisual(m.form)];
  const chip = chipDeStatus(estado, agora);
  const dose = linhaDaProximaDose(m, estado, agora);

  const repetivel = m.scheduleType === 'as_needed';
  const marcado = estado.tipo === 'tomado' && !repetivel;
  const semAcao =
    estado.tipo === 'inativo' || estado.tipo === 'encerrado' || estado.tipo === 'nao_comecou';

  /** Salva uma mudanca e poe a resposta do servidor no cache do detalhe e das listas. */
  async function salvar(patch: MedicationPatch): Promise<void> {
    const salvo = await healthApi.updateMedication(m.id, patch);
    queryClient.setQueryData(CHAVES.remedio(m.id), { remedio: salvo, agora: new Date() });
    void queryClient.invalidateQueries({ queryKey: CHAVES.remedios });
  }

  /** Abre o seletor de arquivo e guarda a foto. Chamado direto do clique. */
  async function anexar(alvo: 'receita' | 'caixa') {
    const escolha = await escolherFotoDeDocumento();
    if (!escolha.ok) {
      if (escolha.motivo === 'falha') {
        void avisar('Não consegui usar a foto', 'Tente de novo, ou escolha outra imagem.');
      }
      return;
    }

    if (alvo === 'caixa') setFotoCaixa('enviando');
    else setAnexando(true);
    try {
      await salvar(
        alvo === 'caixa'
          ? { packagePhoto: escolha.dataUri }
          : { prescriptionPhoto: escolha.dataUri },
      );
    } catch (e) {
      void avisar(
        alvo === 'caixa' ? 'Não consegui guardar a foto' : 'Não consegui guardar a receita',
        mensagemDoErro(e),
      );
    } finally {
      if (alvo === 'caixa') setFotoCaixa(null);
      else setAnexando(false);
    }
  }

  async function removerFoto(alvo: 'receita' | 'caixa') {
    const confirmou = await confirmar(
      alvo === 'caixa' ? 'Remover a foto da caixinha?' : 'Remover a receita?',
      'A foto sai da sua conta e não dá para recuperar.',
      'Remover',
    );
    if (!confirmou) return;

    if (alvo === 'caixa') setFotoCaixa('removendo');
    else setAnexando(true);
    try {
      await salvar(alvo === 'caixa' ? { packagePhoto: null } : { prescriptionPhoto: null });
    } catch (e) {
      void avisar('Não consegui remover', mensagemDoErro(e));
    } finally {
      if (alvo === 'caixa') setFotoCaixa(null);
      else setAnexando(false);
    }
  }

  async function encerrar() {
    const confirmou = await confirmar(
      m.isActive ? 'Encerrar tratamento?' : 'Retomar tratamento?',
      m.isActive
        ? 'O remédio sai da lista de hoje, mas o histórico de doses continua guardado.'
        : 'O remédio volta a aparecer na lista de hoje.',
      m.isActive ? 'Encerrar' : 'Retomar',
      // Reversivel: nao e uma acao destrutiva.
      { destrutiva: false },
    );
    if (!confirmou) return;
    try {
      await salvar({ isActive: !m.isActive });
    } catch (e) {
      void avisar('Não consegui salvar', mensagemDoErro(e));
    }
  }

  async function apagar() {
    const confirmou = await confirmar(
      'Apagar o remédio?',
      `Apaga ${titulo} e também o registro de todas as doses já tomadas. Não dá para desfazer. Se a intenção é só parar de tomar, use "Encerrar tratamento".`,
      'Apagar tudo',
    );
    if (!confirmou) return;
    try {
      await healthApi.deleteMedication(m.id);
      queryClient.removeQueries({ queryKey: CHAVES.remedio(m.id) });
      void queryClient.invalidateQueries({ queryKey: CHAVES.remedios });
      navigate('/remedios', { replace: true });
    } catch (e) {
      void avisar('Não consegui apagar', mensagemDoErro(e));
    }
  }

  const estoqueAtual = m.stock ?? null;
  const baixo = estoqueAtual ? estoqueBaixo(m, estoqueAtual) : false;
  const termino = estoqueAtual ? dataDeTermino(m, estoqueAtual, agora) : null;
  const legendaDaFoto =
    m.photoReadKind === 'caixa' ? 'Foto identificada pela IA' : undefined;

  return (
    <>
      <div className={estilos.detalheTopo}>
        {/* Cartao principal: foto, nome, de quem e, estoque. */}
        <SurfaceCard className={estilos.principal}>
          <FotoDoRemedio
            foto={m.packagePhoto ?? null}
            doQue={titulo}
            ocupada={fotoCaixa}
            legenda={legendaDaFoto}
            onEscolher={() => void anexar('caixa')}
            onRemover={() => void removerFoto('caixa')}
          />

          <div className={estilos.principalTextos}>
            <div className={estilos.heroiLinha}>
              <div className={estilos.heroiTextos}>
                <h2 className={estilos.heroiNome}>{titulo}</h2>
                {m.profileName ? (
                  <p className={estilos.vinculo}>Vinculado a {m.profileName}</p>
                ) : null}
              </div>
              <DoseButton
                checked={marcado}
                repetivel={repetivel}
                disabled={semAcao}
                enviando={emVoo.has(m.id)}
                label={rotuloDaDose(titulo, estado, repetivel)}
                onClick={() => void marcar(m, agora)}
                size={48}
              />
            </div>

            <div className={estilos.selos}>
              {estoqueAtual ? (
                <SeloDeStatus tom={baixo ? 'atencao' : 'sucesso'} icone={baixo ? 'alert-triangle' : undefined}>
                  {baixo ? 'Estoque baixo' : 'Estoque suficiente'}
                </SeloDeStatus>
              ) : null}
              <p className={estilos.chip} data-ativo={chip.ativo ? '' : undefined}>
                <Icone nome={chip.icone} size={15} />
                <span className="so-leitor-de-tela">Situação: </span>
                {chip.texto}
              </p>
            </div>

            {estoqueAtual ? (
              <div className={estilos.nivel}>
                <p className={estilos.restantes}>
                  <Icone nome="mci:pill" size={22} />
                  {quantidadeDoEstoque(estoqueAtual.remaining, m.form)} restantes
                </p>
                <BarraDeProgresso nivel={nivel(estoqueAtual)} baixo={baixo} />
                {termino && estoqueAtual.remaining > 0 ? (
                  <p className={estilos.previsao}>
                    Previsão de término: {diaPorExtenso(termino, agora)}
                  </p>
                ) : null}
              </div>
            ) : (
              <Link to={`/remedios/compra?id=${m.id}`} className={estilos.semEstoque}>
                <Icone nome="mci:store-plus-outline" size={20} />
                Registrar a compra para acompanhar o estoque
                <Icone nome="chevron-right" size={18} />
              </Link>
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard className={estilos.informacoes}>
          <h2 className={estilos.cartaoTitulo}>Informações do medicamento</h2>
          <dl className={estilos.infos}>
            <Info
              tile={{ ...LADRILHO_NEUTRO, icone: 'mci:pill' }}
              rotulo="Orientação de uso do medicamento"
              valor={posologia(m)}
            />
            <Info
              tile={{ ...LADRILHO_NEUTRO, icone: 'box' }}
              rotulo="Quantidade por caixa"
              valor={
                m.packageAmount
                  ? quantidadeDoEstoque(m.packageAmount, m.form)
                  : 'Não informada'
              }
            />
            <Info
              tile={{ ...LADRILHO_NEUTRO, icone: 'calendar' }}
              rotulo="Validade"
              valor={
                estoqueAtual?.expiresOn
                  ? validadeCurta(estoqueAtual.expiresOn)
                  : 'Informe ao registrar a compra'
              }
            />
            <Info
              tile={{ ...LADRILHO_NEUTRO, icone: 'flag' }}
              rotulo="Tratamento"
              valor={periodoDoTratamento(m)}
            />
          </dl>
          <a href="#receita" className={estilos.verReceita}>
            <Icone nome="file-text" size={20} />
            {m.prescriptionPhoto ? 'Ver receita completa' : 'Anexar a receita'}
            <Icone nome="chevron-right" size={18} />
          </a>
        </SurfaceCard>
      </div>

      <section id="receita" className={estilos.bloco} aria-label="Receita médica vinculada">
        <PrescriptionCard
          foto={m.prescriptionPhoto ?? null}
          doQue={titulo}
          prescritor={m.prescriberName}
          ocupado={anexando}
          onEscolher={() => void anexar('receita')}
          onRemover={() => void removerFoto('receita')}
        />
      </section>

      <div className={estilos.detalheBase}>
        <SurfaceCard className={estilos.lembretes}>
          <IconTile {...(dose.atencao ? LADRILHO_ATENCAO : LADRILHO_NEUTRO)} icone="clock" size={64} />
          <div className={estilos.lembretesTextos}>
            <h2 className={estilos.cartaoTitulo}>Lembretes</h2>
            <p className={estilos.lembretesRotulo}>{dose.rotulo}</p>
            <p className={estilos.lembretesValor}>{dose.valor}</p>
          </div>
          <Link to={`/medicamento/form/${m.id}`} className={botoes.contorno}>
            <Icone nome="edit-2" size={18} />
            Editar lembretes
          </Link>
        </SurfaceCard>

        <SurfaceCard className={estilos.atualizar}>
          <Link to={`/remedios/compra?id=${m.id}`} className={`${botoes.ambar} ${botoes.largo} ${estilos.atualizarBotao}`}>
            <Icone nome="refresh-cw" size={22} />
            Atualizar estoque
          </Link>
        </SurfaceCard>
      </div>

      {/* A secao inteira some quando nao ha orientacoes: um cartao dizendo "sem
          orientacoes" gastaria rolagem para comunicar um nada sem saida. */}
      {m.instructions ? (
        <section className={estilos.secao}>
          <SectionHeader title="Instruções" />
          <SurfaceCard className={`${estilos.cartao} ${estilos.instrucoes}`}>
            <IconTile {...LADRILHO_ATENCAO} icone="mci:lightbulb-outline" />
            <p className={estilos.instrucoesTexto}>{m.instructions}</p>
          </SurfaceCard>
        </section>
      ) : null}

      <HistoricoDeDoses medicationId={m.id} nome={m.name} />

      <div className={estilos.acoes}>
        <Link to={`/medicamento/form/${m.id}`} className={botoes.verde}>
          <Icone nome="edit-2" size={18} />
          Editar medicamento
        </Link>
        <button type="button" className={botoes.contorno} onClick={() => void encerrar()}>
          {m.isActive ? 'Encerrar tratamento' : 'Retomar tratamento'}
        </button>
        <button type="button" className={botoes.perigo} onClick={() => void apagar()}>
          Apagar remédio e histórico
        </button>
      </div>
    </>
  );
}

type Tile = { fundo: string; traco: string; icone: string };

function Info({
  tile,
  rotulo,
  valor,
  para,
}: {
  tile: Tile;
  rotulo: string;
  valor: string;
  /** Com destino, a linha inteira vira link e ganha a seta. */
  para?: string;
}) {
  const conteudo = (
    <>
      <IconTile {...tile} />
      <span className={estilos.infoTextos}>
        <dt className={estilos.infoRotulo}>{rotulo}</dt>
        <dd className={estilos.infoValor}>{valor}</dd>
      </span>
    </>
  );

  return para ? (
    <Link to={para} className={`${estilos.info} ${estilos.infoLink}`}>
      {conteudo}
      <Icone nome="chevron-right" size={20} color="var(--cor-section-title)" />
    </Link>
  ) : (
    <div className={estilos.info}>{conteudo}</div>
  );
}

type Chip = { icone: string; texto: string; ativo: boolean };

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
        texto: isSameDay(estado.quando, agora)
          ? `Próxima dose ${hora(estado.quando)}`
          : `Próxima dose ${diaRelativo(estado.quando, agora).toLowerCase()} às ${hora(estado.quando)}`,
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

function rotuloDaDose(titulo: string, estado: EstadoHoje, repetivel: boolean): string {
  if (repetivel) return `Registrar uma dose de ${titulo} agora`;
  if (estado.tipo === 'tomado') return `Dose de ${titulo}, tomada às ${hora(estado.quando)}`;
  if (estado.tipo === 'pendente') return `Dose de ${titulo} das ${hora(estado.quando)}`;
  return `Dose de ${titulo}`;
}
