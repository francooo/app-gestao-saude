import { BadgeCheck, Hourglass, Percent, TimerOff } from 'lucide-react';

import { useAssinaturas, type Assinaturas as Dados } from '../api/telas';
import { CabecalhoDaPagina } from '../layout/CabecalhoDaPagina';
import { data, diasAte, numero, percentual } from '../lib/formato';
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
  ListaDeBarras,
  Paginacao,
  Pill,
  Selecao,
  Tabela,
  Vazio,
  type Coluna,
} from '../ui/componentes';
import { opcoes, SITUACAO_DA_ASSINATURA } from './rotulos';
import estilos from './telas.module.css';

type Linha = Dados['lista']['itens'][number];

const ORIGEM: Record<string, string> = { play: 'Google Play', manual: 'Ativação manual' };

function prazo(l: Linha): string {
  if (!l.fim) return '—';
  const dias = diasAte(l.fim);
  if (dias > 1) return `${data(l.fim)} · faltam ${dias} dias`;
  if (dias === 1) return `${data(l.fim)} · amanhã`;
  if (dias === 0) return `${data(l.fim)} · hoje`;
  return data(l.fim);
}

const COLUNAS: Coluna<Linha>[] = [
  {
    titulo: 'Conta',
    render: (l) => (
      <span>
        <strong>{l.nome}</strong>
        <br />
        <span className={estilos.secundario}>{l.email}</span>
      </span>
    ),
  },
  {
    titulo: 'Situação',
    render: (l) => (
      <Pill tom={SITUACAO_DA_ASSINATURA[l.situacao].tom}>{SITUACAO_DA_ASSINATURA[l.situacao].rotulo}</Pill>
    ),
  },
  { titulo: 'Cadastro', render: (l) => data(l.cadastro) },
  { titulo: 'Fim do teste ou da assinatura', render: prazo },
  { titulo: 'Origem', render: (l) => (l.origem ? (ORIGEM[l.origem] ?? l.origem) : '—') },
];

export function Assinaturas() {
  const filtros = useFiltros(['situacao'] as const);
  const consulta = useAssinaturas(filtros.consulta);
  const dados = consulta.data;
  const n = dados?.numeros;

  return (
    <>
      <CabecalhoDaPagina titulo="Assinaturas" subtitulo="Acompanhe os planos e o período de teste das contas" />

      <BarraDeFiltros>
        <CampoDeBusca rotulo="Buscar por nome ou e-mail" valor={filtros.busca} onChange={filtros.setBusca} />
        <Selecao
          rotulo="Situação"
          valor={filtros.valores.situacao}
          opcoes={opcoes(SITUACAO_DA_ASSINATURA)}
          onChange={(v) => filtros.definir('situacao', v)}
        />
      </BarraDeFiltros>

      {n && (
        <GradeDeKpis>
          <Kpi rotulo="Assinantes" valor={n.assinantes} Icone={BadgeCheck} />
          <Kpi
            rotulo="Em período de teste"
            valor={n.em_teste}
            detalhe={n.teste_acabando ? `${numero(n.teste_acabando)} acabam em até 3 dias` : undefined}
            Icone={Hourglass}
            tom="mostarda"
          />
          <Kpi rotulo="Testes encerrados sem assinar" valor={n.teste_encerrado} Icone={TimerOff} tom="musgo" />
          <Kpi
            rotulo="Conversão do teste"
            valor={n.testes_concluidos ? percentual(n.ja_assinaram / n.testes_concluidos) : '—'}
            detalhe={`${numero(n.ja_assinaram)} de ${numero(n.testes_concluidos)} testes concluídos`}
            Icone={Percent}
            tom="caramelo"
          />
        </GradeDeKpis>
      )}

      <div className={`${estilos.linha} ${estilos.listaELateral}`}>
        <Cartao titulo="Contas e planos">
          {consulta.isPending ? (
            <Carregando linhas={6} />
          ) : consulta.isError ? (
            <Erro onTentar={() => void consulta.refetch()} />
          ) : dados!.lista.total === 0 ? (
            <Vazio titulo="Nenhuma conta encontrada" texto="Tente outra busca ou limpe o filtro." />
          ) : (
            <>
              <Tabela legenda="Planos das contas" colunas={COLUNAS} itens={dados!.lista.itens} atualizando={consulta.isPlaceholderData} />
              <Paginacao {...dados!.lista} onChange={(p) => filtros.definir('pagina', p)} />
            </>
          )}
        </Cartao>

        <Cartao titulo="Distribuição" subtitulo="Contas por situação do plano">
          {n && (
            <ListaDeBarras
              itens={[
                { rotulo: 'Assinantes', valor: n.assinantes, detalhe: numero(n.assinantes) },
                { rotulo: 'Em teste', valor: n.em_teste, detalhe: numero(n.em_teste) },
                { rotulo: 'Teste encerrado', valor: n.teste_encerrado, detalhe: numero(n.teste_encerrado) },
                { rotulo: 'Assinatura vencida', valor: n.assinatura_vencida, detalhe: numero(n.assinatura_vencida) },
              ]}
            />
          )}
          <Aviso>
            A cobrança pela Google Play ainda não está ativa no app. Receita, preço e renovações aparecem aqui
            quando ela existir.
          </Aviso>
        </Cartao>
      </div>
    </>
  );
}
