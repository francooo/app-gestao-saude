import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  CreditCard,
  FileSpreadsheet,
  MessageCircle,
  Pill as IconePill,
  Printer,
  ScanLine,
  SquareCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSearchParams } from 'react-router';

import { useRelatorio, type CategoriaDoRelatorio, type Periodo, type Relatorio } from '../api/telas';
import { CabecalhoDaPagina } from '../layout/CabecalhoDaPagina';
import { data, numero, percentual } from '../lib/formato';
import {
  Aviso,
  BarraDeFiltros,
  Cartao,
  Carregando,
  Erro,
  GradeDeKpis,
  Kpi,
  Selecao,
  Tabela,
  type Coluna,
} from '../ui/componentes';
import estilos from './telas.module.css';

const COR_MUSGO = '#3F5A45';
const COR_CARAMELO = '#C9854B';
const COR_GRADE = '#DDE8D8';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const PERIODOS: { valor: Periodo; rotulo: string; anterior: string }[] = [
  { valor: '7d', rotulo: 'Últimos 7 dias', anterior: '7 dias anteriores' },
  { valor: '30d', rotulo: 'Últimos 30 dias', anterior: '30 dias anteriores' },
  { valor: '90d', rotulo: 'Últimas 13 semanas', anterior: '13 semanas anteriores' },
  { valor: '12m', rotulo: 'Últimos 12 meses', anterior: '12 meses anteriores' },
];

const CATEGORIAS: Record<CategoriaDoRelatorio, { rotulo: string; Icone: LucideIcon }> = {
  novas_contas: { rotulo: 'Novas contas', Icone: UserPlus },
  contas_com_acesso: { rotulo: 'Contas com acesso', Icone: Users },
  medicamentos: { rotulo: 'Medicamentos cadastrados', Icone: IconePill },
  doses: { rotulo: 'Doses marcadas como tomadas', Icone: SquareCheck },
  consultas: { rotulo: 'Consultas no período', Icone: CalendarCheck },
  leituras: { rotulo: 'Leituras de receita por IA', Icone: ScanLine },
  mensagens: { rotulo: 'Mensagens de WhatsApp enviadas', Icone: MessageCircle },
};

/** Variacao contra o periodo anterior; null quando nao da para comparar. */
function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (atual - anterior) / anterior;
}

function textoDaVariacao(atual: number, anterior: number): string {
  const v = variacao(atual, anterior);
  if (v === null) return atual > 0 ? 'Sem base de comparação' : '—';
  return `${v > 0 ? '+' : ''}${percentual(v)}`;
}

/** "2026-10-25" -> "25 out" (dia/semana) ou "out" (mes). */
function rotuloDaFaixa(inicio: string, faixa: Relatorio['faixa']): string {
  const [, mes, dia] = inicio.split('-').map(Number);
  const nomeDoMes = MESES[(mes ?? 1) - 1] ?? '';
  return faixa === 'month' ? nomeDoMes : `${dia} ${nomeDoMes}`;
}

type Linha = Relatorio['consolidado'][number] & { id: string };

const COLUNAS: Coluna<Linha>[] = [
  {
    titulo: 'Categoria',
    render: (l) => {
      const { rotulo, Icone } = CATEGORIAS[l.categoria];
      return (
        <span className={estilos.categoria}>
          <Icone size={18} aria-hidden />
          {rotulo}
        </span>
      );
    },
  },
  { titulo: 'Período', render: (l) => numero(l.atual), numerica: true },
  { titulo: 'Anterior', render: (l) => numero(l.anterior), numerica: true },
  {
    titulo: 'Variação',
    render: (l) => {
      const v = variacao(l.atual, l.anterior);
      if (v === null || v === 0) return <span className={estilos.secundario}>{textoDaVariacao(l.atual, l.anterior)}</span>;
      const Seta = v > 0 ? ArrowUp : ArrowDown;
      return (
        <span className={v > 0 ? estilos.subiu : estilos.caiu}>
          <Seta size={16} aria-hidden />
          {textoDaVariacao(l.atual, l.anterior)}
        </span>
      );
    },
  },
];

/** Planilha do relatorio: ";" e BOM para o Excel em portugues abrir certo. */
function baixarCsv(dados: Relatorio, rotuloDoPeriodo: string) {
  const celula = (valor: string | number) => {
    const texto = String(valor);
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const linhas: (string | number)[][] = [
    ['Família Saúde — Relatório'],
    ['Período', rotuloDoPeriodo],
    ['Desde', data(dados.inicio)],
    ['Gerado em', new Date(dados.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })],
    [],
    ['Categoria', 'Período escolhido', 'Período anterior', 'Variação'],
    ...dados.consolidado.map((l) => [
      CATEGORIAS[l.categoria].rotulo,
      l.atual,
      l.anterior,
      textoDaVariacao(l.atual, l.anterior),
    ]),
    [],
    ['Planos hoje', 'Assinantes', dados.plano.assinantes],
    ['', 'Em período de teste', dados.plano.em_teste],
    [],
    ['Início da faixa', 'Contas com acesso', 'Novas contas'],
    ...dados.serie.map((s) => [s.inicio, s.ativas, s.novas]),
  ];
  const conteudo = '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio-familia-saude-${dados.periodo}-${dados.atualizadoEm.slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function Relatorios() {
  const [parametros, setParametros] = useSearchParams();
  const periodo = (PERIODOS.find((p) => p.valor === parametros.get('periodo'))?.valor ?? '30d') as Periodo;
  const infoDoPeriodo = PERIODOS.find((p) => p.valor === periodo)!;
  const consulta = useRelatorio(periodo);
  const dados = consulta.data;

  return (
    <>
      <CabecalhoDaPagina titulo="Relatórios" subtitulo="Compile e acompanhe os números do Família Saúde" />

      <BarraDeFiltros>
        <Selecao
          rotulo="Período"
          valor={periodo}
          todos={false}
          opcoes={PERIODOS.map(({ valor, rotulo }) => ({ valor, rotulo }))}
          onChange={(v) => setParametros(v === '30d' ? {} : { periodo: v }, { replace: true })}
        />
      </BarraDeFiltros>

      {consulta.isPending ? (
        <Cartao>
          <Carregando linhas={6} />
        </Cartao>
      ) : consulta.isError ? (
        <Cartao>
          <Erro onTentar={() => void consulta.refetch()} />
        </Cartao>
      ) : (
        <Conteudo dados={dados!} periodo={infoDoPeriodo} atualizando={consulta.isPlaceholderData} />
      )}
    </>
  );
}

function Conteudo({
  dados,
  periodo,
  atualizando,
}: {
  dados: Relatorio;
  periodo: (typeof PERIODOS)[number];
  atualizando: boolean;
}) {
  const por = new Map(dados.consolidado.map((l) => [l.categoria, l]));
  const kpi = (categoria: CategoriaDoRelatorio) => {
    const l = por.get(categoria) ?? { atual: 0, anterior: 0 };
    const v = variacao(l.atual, l.anterior);
    const detalhe =
      v === null
        ? `0 nos ${periodo.anterior}`
        : `${textoDaVariacao(l.atual, l.anterior)} vs. ${periodo.anterior}`;
    return { valor: l.atual, detalhe };
  };
  const serie = dados.serie.map((s) => ({ ...s, rotulo: rotuloDaFaixa(s.inicio, dados.faixa) }));
  const linhas: Linha[] = dados.consolidado.map((l) => ({ ...l, id: l.categoria }));
  const hora = new Date(dados.atualizadoEm).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  return (
    <div className={estilos.relatorio} data-atualizando={atualizando || undefined}>
      <GradeDeKpis>
        <Kpi rotulo="Contas com acesso" {...kpi('contas_com_acesso')} Icone={Users} />
        <Kpi rotulo="Novas contas" {...kpi('novas_contas')} Icone={UserPlus} tom="mostarda" />
        <Kpi rotulo="Medicamentos cadastrados" {...kpi('medicamentos')} Icone={IconePill} tom="musgo" />
        <Kpi
          rotulo="Assinantes hoje"
          valor={dados.plano.assinantes}
          detalhe={`${numero(dados.plano.em_teste)} em período de teste`}
          Icone={CreditCard}
          tom="caramelo"
        />
      </GradeDeKpis>

      <div className={estilos.linha}>
        <Cartao
          titulo="Resumo de atividade"
          subtitulo={`${periodo.rotulo}, desde ${data(dados.inicio)}`}
          acoes={
            <div className={estilos.legenda}>
              <span>
                <i style={{ background: COR_MUSGO }} />
                Contas com acesso
              </span>
              <span>
                <i style={{ background: COR_CARAMELO }} />
                Novas contas
              </span>
            </div>
          }
        >
          <div className={estilos.grafico}>
            <ResponsiveContainer>
              <AreaChart data={serie} margin={{ left: -20, right: 8 }}>
                <defs>
                  <linearGradient id="preenchimentoRelatorio" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COR_MUSGO} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COR_MUSGO} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={COR_GRADE} vertical={false} />
                <XAxis
                  dataKey="rotulo"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                  tick={{ fill: '#718074', fontSize: 13 }}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#718074', fontSize: 13 }} />
                <Tooltip
                  formatter={(valor, nome) => [numero(Number(valor)), nome === 'ativas' ? 'Contas com acesso' : 'Novas contas']}
                  labelFormatter={(rotulo) => (dados.faixa === 'week' ? `Semana de ${rotulo}` : String(rotulo))}
                  labelStyle={{ color: '#304637', fontWeight: 700 }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #B7C9AD' }}
                />
                <Area type="monotone" dataKey="ativas" stroke={COR_MUSGO} strokeWidth={2.5} fill="url(#preenchimentoRelatorio)" />
                <Area type="monotone" dataKey="novas" stroke={COR_CARAMELO} strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Cartao>
      </div>

      <Cartao
        titulo="Dados consolidados"
        subtitulo={`Comparado com os ${periodo.anterior}`}
        acoes={
          <div className={estilos.botoes} data-nao-imprimir>
            <button type="button" className={estilos.botaoContorno} onClick={() => window.print()}>
              <Printer size={18} aria-hidden />
              Imprimir ou salvar PDF
            </button>
            <button type="button" className={estilos.botaoContorno} onClick={() => baixarCsv(dados, periodo.rotulo)}>
              <FileSpreadsheet size={18} aria-hidden />
              Exportar CSV
            </button>
          </div>
        }
      >
        <Tabela legenda="Números do período comparados com o período anterior" colunas={COLUNAS} itens={linhas} compacta />
        <Aviso>
          “Contas com acesso” vem das sessões do app, que guardam só o primeiro e o último uso. Em períodos passados o
          número pode ficar abaixo do real. Assinantes não têm histórico no banco, então aparecem só como estão hoje.
        </Aviso>
        <p className={estilos.rodapeDoCartao}>Atualizado hoje às {hora}</p>
      </Cartao>
    </div>
  );
}
