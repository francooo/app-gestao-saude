import { CalendarPlus, Clock, HeartHandshake, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { useUsuarios, type Usuarios as Dados } from '../api/telas';
import { CabecalhoDaPagina } from '../layout/CabecalhoDaPagina';
import { idade, iniciais, numero, ultimoAcesso } from '../lib/formato';
import { useFiltros } from '../lib/useFiltros';
import {
  BarraDeFiltros,
  CampoDeBusca,
  Cartao,
  Carregando,
  ComAvatar,
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
import { opcoes, PLANO, SITUACAO_DA_CONTA } from './rotulos';
import estilos from './telas.module.css';

type Conta = Dados['lista']['itens'][number];

const COLUNAS: Coluna<Conta>[] = [
  {
    titulo: 'Conta',
    render: (c) => <ComAvatar nome={c.nome} iniciais={iniciais(c.nome)} secundario={c.email} />,
  },
  { titulo: 'Idade do titular', render: (c) => idade(c.nascimento) },
  { titulo: 'Pessoas', render: (c) => numero(c.perfis), numerica: true },
  { titulo: 'Plano', render: (c) => <Pill tom={PLANO[c.plano].tom}>{PLANO[c.plano].rotulo}</Pill> },
  { titulo: 'Último acesso', render: (c) => ultimoAcesso(c.ultimo_acesso) },
  {
    titulo: 'Situação',
    render: (c) => <Pill tom={SITUACAO_DA_CONTA[c.situacao].tom}>{SITUACAO_DA_CONTA[c.situacao].rotulo}</Pill>,
  },
];

export function Usuarios() {
  const filtros = useFiltros(['plano', 'situacao'] as const);
  const consulta = useUsuarios(filtros.consulta);
  const dados = consulta.data;

  return (
    <>
      <CabecalhoDaPagina titulo="Usuários" subtitulo="Acompanhe as famílias que utilizam o Família Saúde" />

      <BarraDeFiltros>
        <CampoDeBusca rotulo="Buscar por nome ou e-mail" valor={filtros.busca} onChange={filtros.setBusca} />
        <Selecao rotulo="Plano" valor={filtros.valores.plano} opcoes={opcoes(PLANO)} onChange={(v) => filtros.definir('plano', v)} />
        <Selecao
          rotulo="Situação"
          valor={filtros.valores.situacao}
          opcoes={opcoes(SITUACAO_DA_CONTA)}
          onChange={(v) => filtros.definir('situacao', v)}
        />
      </BarraDeFiltros>

      {dados && (
        <GradeDeKpis>
          <Kpi rotulo="Total de contas" valor={dados.numeros.contas} Icone={Users} />
          <Kpi rotulo="Com acesso hoje" valor={dados.numeros.ativas_hoje} Icone={Clock} tom="mostarda" />
          <Kpi rotulo="Novas este mês" valor={dados.numeros.novas_no_mes} Icone={CalendarPlus} tom="musgo" />
          <Kpi
            rotulo="Pessoas cuidadas"
            valor={dados.numeros.perfis}
            detalhe="perfis de família ativos"
            Icone={HeartHandshake}
            tom="caramelo"
          />
        </GradeDeKpis>
      )}

      <div className={`${estilos.linha} ${estilos.listaELateral}`}>
        <Cartao titulo="Lista de contas">
          {consulta.isPending ? (
            <Carregando linhas={6} />
          ) : consulta.isError ? (
            <Erro onTentar={() => void consulta.refetch()} />
          ) : dados!.lista.total === 0 ? (
            <Vazio titulo="Nenhuma conta encontrada" texto="Tente outra busca ou limpe os filtros." />
          ) : (
            <>
              <Tabela legenda="Contas do Família Saúde" colunas={COLUNAS} itens={dados!.lista.itens} atualizando={consulta.isPlaceholderData} />
              <Paginacao {...dados!.lista} onChange={(p) => filtros.definir('pagina', p)} />
            </>
          )}
        </Cartao>

        <Cartao titulo="Engajamento" subtitulo="Contas que abriram o app no período">
          {dados && <Engajamento numeros={dados.numeros} />}
        </Cartao>
      </div>
    </>
  );
}

const CORES = ['#B7C9AD', '#5D9B72', '#3F5A45'];

function Engajamento({ numeros }: { numeros: Dados['numeros'] }) {
  const barras = [
    { rotulo: 'Último dia', valor: numeros.ativas_1d },
    { rotulo: '7 dias', valor: numeros.ativas_7d },
    { rotulo: '30 dias', valor: numeros.ativas_30d },
  ];
  return (
    <div className={estilos.grafico}>
      <ResponsiveContainer>
        <BarChart data={barras} margin={{ left: -20, right: 8 }}>
          <CartesianGrid stroke="#DDE8D8" vertical={false} />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fill: '#718074', fontSize: 13 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#718074', fontSize: 13 }} />
          <Tooltip
            cursor={{ fill: '#EEF3E9' }}
            formatter={(valor) => [numero(Number(valor)), 'Contas']}
            contentStyle={{ borderRadius: 12, border: '1px solid #B7C9AD' }}
          />
          <Bar dataKey="valor" radius={[10, 10, 0, 0]} maxBarSize={56}>
            {barras.map((b, i) => (
              <Cell key={b.rotulo} fill={CORES[i]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
