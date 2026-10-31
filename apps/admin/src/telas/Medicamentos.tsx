import { Bell, CalendarClock, Pill as IconePill, ScanLine, TriangleAlert } from 'lucide-react';

import { useMedicamentos, type Medicamentos as Dados } from '../api/telas';
import { CabecalhoDaPagina } from '../layout/CabecalhoDaPagina';
import { data, numero } from '../lib/formato';
import { useFiltros } from '../lib/useFiltros';
import {
  Aviso,
  BarraDeFiltros,
  CampoDeBusca,
  Cartao,
  Carregando,
  Erro,
  GradeDeKpis,
  Kpi,
  Paginacao,
  Pill,
  Selecao,
  Tabela,
  Vazio,
  type Coluna,
} from '../ui/componentes';
import { opcoes, quantidade, SITUACAO_DO_ESTOQUE } from './rotulos';
import estilos from './telas.module.css';

type Linha = Dados['lista']['itens'][number];

const COLUNAS: Coluna<Linha>[] = [
  {
    titulo: 'Medicamento',
    render: (m) => (
      <span>
        <strong>{m.nome}</strong>
        {m.concentracao && <span className={estilos.secundario}> {m.concentracao}</span>}
      </span>
    ),
  },
  {
    titulo: 'Pessoa',
    render: (m) => (
      <span>
        {m.pessoa}
        <br />
        <span className={estilos.secundario}>Conta: {m.conta}</span>
      </span>
    ),
  },
  { titulo: 'Estoque', render: (m) => (m.situacao === 'sem_controle' ? '—' : quantidade(m.restante, m.forma)) },
  { titulo: 'Validade', render: (m) => data(m.validade) },
  {
    titulo: 'Situação',
    render: (m) => <Pill tom={SITUACAO_DO_ESTOQUE[m.situacao].tom}>{SITUACAO_DO_ESTOQUE[m.situacao].rotulo}</Pill>,
  },
];

export function Medicamentos() {
  const filtros = useFiltros(['situacao'] as const);
  const consulta = useMedicamentos(filtros.consulta);
  const dados = consulta.data;
  const n = dados?.numeros;

  return (
    <>
      <CabecalhoDaPagina titulo="Medicamentos" subtitulo="Medicamentos em uso nas famílias, com estoque e validade" />

      <BarraDeFiltros>
        <CampoDeBusca rotulo="Buscar medicamento, pessoa ou conta" valor={filtros.busca} onChange={filtros.setBusca} />
        <Selecao
          rotulo="Situação do estoque"
          valor={filtros.valores.situacao}
          opcoes={opcoes(SITUACAO_DO_ESTOQUE)}
          onChange={(v) => filtros.definir('situacao', v)}
        />
      </BarraDeFiltros>

      {n && (
        <GradeDeKpis>
          <Kpi rotulo="Medicamentos ativos" valor={n.ativos} Icone={IconePill} />
          <Kpi rotulo="Estoque baixo" valor={n.estoque_baixo} detalhe="acabam em até 7 dias" Icone={TriangleAlert} tom="caramelo" />
          <Kpi
            rotulo="Receitas lidas por IA"
            valor={n.lidas}
            detalhe={`${numero(n.lidas_30d)} nos últimos 30 dias`}
            Icone={ScanLine}
            tom="musgo"
          />
          <Kpi rotulo="Validade próxima" valor={n.validade_proxima} detalhe="vencem em até 30 dias" Icone={CalendarClock} tom="mostarda" />
        </GradeDeKpis>
      )}

      <div className={`${estilos.linha} ${estilos.listaELateral}`}>
        <Cartao titulo="Medicamentos cadastrados">
          {consulta.isPending ? (
            <Carregando linhas={6} />
          ) : consulta.isError ? (
            <Erro onTentar={() => void consulta.refetch()} />
          ) : dados!.lista.total === 0 ? (
            <Vazio titulo="Nenhum medicamento encontrado" texto="Tente outra busca ou limpe o filtro." />
          ) : (
            <>
              <Tabela legenda="Medicamentos em uso" colunas={COLUNAS} itens={dados!.lista.itens} atualizando={consulta.isPlaceholderData} />
              <Paginacao {...dados!.lista} onChange={(p) => filtros.definir('pagina', p)} />
            </>
          )}
        </Cartao>

        <Cartao titulo="Alertas do estoque">
          {n && (
            <div className={estilos.destaque}>
              <span className={estilos.numeroGrande}>{numero(n.estoque_baixo)}</span>
              <span>{n.estoque_baixo === 1 ? 'medicamento com estoque baixo' : 'medicamentos com estoque baixo'}</span>
              <button type="button" className={estilos.botaoPrimario} onClick={() => filtros.definir('situacao', 'estoque_baixo')}>
                <Bell size={18} aria-hidden />
                Ver alertas
              </button>
            </div>
          )}
          {n && n.sem_controle > 0 && (
            <Aviso>
              {numero(n.sem_controle)} de {numero(n.ativos)} medicamentos ainda não têm compra registrada no app, então
              não há como calcular estoque nem validade deles.
            </Aviso>
          )}
        </Cartao>
      </div>
    </>
  );
}
