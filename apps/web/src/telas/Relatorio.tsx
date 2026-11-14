import { healthApi } from '@gestao/shared/api/health';
import {
  dadosParaResumo,
  erroDoPeriodo,
  montarRelatorio,
  periodoDosUltimos,
  relatorioEmHtml,
  SECOES_PADRAO,
  type SecoesDoRelatorio,
} from '@gestao/shared/lib/relatorio';
import { endOfDay, format, startOfDay } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useAssinaturaExigida, usePerfis, usePlano } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import { useDadosDoRelatorio } from '@/api/relatorio';
import { SettingsGroup, SettingsRow } from '@/ui/Ajustes';
import botoes from '@/ui/botoes.module.css';
import { Chip, Chips } from '@/ui/Chip';
import { useDialogos } from '@/ui/Dialogo';
import { FormField } from '@/ui/FormField';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { Aviso, Pagina } from '@/ui/Pagina';
import { ProfileSelector } from '@/ui/ProfileSelector';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './Relatorio.module.css';

type Periodo = 7 | 30 | 90 | 'personalizado';

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: 7, rotulo: '7 dias' },
  { valor: 30, rotulo: '30 dias' },
  { valor: 90, rotulo: '90 dias' },
  { valor: 'personalizado', rotulo: 'Escolher datas' },
];

const SECOES: { chave: keyof SecoesDoRelatorio; rotulo: string; icone: string; apoio?: string }[] = [
  { chave: 'encerrados', rotulo: 'Tratamentos encerrados', icone: 'flag' },
  { chave: 'sintomas', rotulo: 'Sintomas', icone: 'activity' },
  { chave: 'consultas', rotulo: 'Consultas', icone: 'calendar' },
  { chave: 'historicoDeDoses', rotulo: 'Histórico dose a dose', icone: 'list', apoio: 'Lista longa: deixe só se o médico pedir' },
];

const DIA = 'yyyy-MM-dd';

/**
 * Relatorio para o medico: escolher quem e o periodo, ver a previa e gerar o
 * PDF.
 *
 * A previa e o MESMO HTML que vai para o papel (lib/relatorio do shared), num
 * iframe: o que a pessoa ve e exatamente o que sai. O PDF e a impressao do
 * proprio navegador ("Salvar como PDF") sobre esse iframe — sem biblioteca
 * nova, com o texto selecionavel, e o mesmo modelo do aplicativo (expo-print).
 *
 * O relatorio e gratis. A assinatura so acrescenta o resumo escrito pela IA,
 * e quem barra de verdade e o servidor (403).
 */
export function Relatorio() {
  const [parametros] = useSearchParams();
  const perfis = usePerfis();
  const lista = perfis.data ?? [];
  const [escolhido, setEscolhido] = useState<string | null>(parametros.get('pessoa'));
  const perfilId =
    (escolhido && lista.some((p) => p.id === escolhido) ? escolhido : null) ??
    lista.find((p) => p.isAccountHolder)?.id ??
    lista[0]?.id ??
    null;

  const [agora] = useState(() => new Date());
  const [periodo, setPeriodo] = useState<Periodo>(30);
  const padrao = periodoDosUltimos(30, agora);
  const [deTexto, setDeTexto] = useState(format(padrao.inicio, DIA));
  const [ateTexto, setAteTexto] = useState(format(padrao.fim, DIA));
  const [secoes, setSecoes] = useState<SecoesDoRelatorio>(SECOES_PADRAO);

  const { inicio, fim, erroDoPeriodoEscolhido } = useMemo(() => {
    if (periodo !== 'personalizado') {
      return { ...periodoDosUltimos(periodo, agora), erroDoPeriodoEscolhido: null };
    }
    const i = startOfDay(new Date(`${deTexto}T00:00:00`));
    const f = endOfDay(new Date(`${ateTexto}T00:00:00`));
    return { inicio: i, fim: f, erroDoPeriodoEscolhido: erroDoPeriodo(i, f, agora) };
  }, [periodo, deTexto, ateTexto, agora]);

  const dados = useDadosDoRelatorio(perfilId, inicio, fim, !erroDoPeriodoEscolhido);

  // O resumo vale para a pessoa e o periodo em que foi pedido: trocar
  // qualquer um dos dois o descarta, senao o papel diria uma coisa e os
  // numeros outra.
  const chaveDoResumo = `${perfilId}|${inicio.toISOString()}|${fim.toISOString()}`;
  const [resumo, setResumo] = useState<{ chave: string; texto: string } | null>(null);
  const resumoValido = resumo?.chave === chaveDoResumo ? resumo.texto : null;

  const relatorio = useMemo(
    () =>
      dados.data
        ? montarRelatorio({ ...dados.data, inicio, fim, secoes, agora, resumoIA: resumoValido })
        : null,
    [dados.data, inicio, fim, secoes, agora, resumoValido],
  );
  const html = useMemo(() => (relatorio ? relatorioEmHtml(relatorio) : ''), [relatorio]);

  return (
    <Pagina area="settings" largura="larga">
      <ScreenHeader
        title="Relatório para o médico"
        subtitle="Remédios, doses, sintomas e consultas do período, prontos para levar à consulta"
        voltar="historico"
      />

      <div className={estilos.grade}>
        <aside className={estilos.opcoes} aria-label="Opções do relatório">
          <SurfaceCard className={estilos.cartao}>
            <h2 className={estilos.titulo}>De quem</h2>
            <ProfileSelector
              profiles={lista}
              selectedId={perfilId}
              onSelect={setEscolhido}
              tituloDoPainel="Relatório de"
              permitirTodos={false}
            />

            <h2 className={`${estilos.titulo} ${estilos.tituloSeguinte}`}>Período</h2>
            <Chips rotulo="Período do relatório">
              {PERIODOS.map((p) => (
                <Chip
                  key={p.valor}
                  rotulo={p.rotulo}
                  ativo={periodo === p.valor}
                  onClick={() => setPeriodo(p.valor)}
                />
              ))}
            </Chips>
            {periodo === 'personalizado' ? (
              <div className={estilos.datas}>
                <FormField
                  label="De"
                  type="date"
                  value={deTexto}
                  onChangeText={setDeTexto}
                  max={format(agora, DIA)}
                />
                <FormField
                  label="Até"
                  type="date"
                  value={ateTexto}
                  onChangeText={setAteTexto}
                  max={format(agora, DIA)}
                  error={erroDoPeriodoEscolhido ?? undefined}
                />
              </div>
            ) : null}
          </SurfaceCard>

          <SettingsGroup className={estilos.bloco}>
            <h2 className={`${estilos.titulo} ${estilos.tituloDoGrupo}`}>O que incluir</h2>
            {SECOES.map((s) => (
              <SettingsRow
                key={s.chave}
                marcador={<IconTile icone={s.icone} {...LADRILHO_NEUTRO} />}
                rotulo={s.rotulo}
                valor={s.apoio}
                ligado={secoes[s.chave]}
                onChange={(v) => setSecoes((atual) => ({ ...atual, [s.chave]: v }))}
              />
            ))}
          </SettingsGroup>

          <CartaoDoResumo
            dadosDoResumo={relatorio ? dadosParaResumo({ ...relatorio, resumoIA: null }) : null}
            temResumo={Boolean(resumoValido)}
            onResumo={(texto) => setResumo({ chave: chaveDoResumo, texto })}
            onTirar={() => setResumo(null)}
          />
        </aside>

        <section className={estilos.previa} aria-label="Prévia do relatório">
          {erroDoPeriodoEscolhido ? (
            <Aviso icone="calendar">Ajuste o período para ver a prévia.</Aviso>
          ) : dados.isPending || perfis.isPending ? (
            <div className={estilos.esqueleto} role="status" aria-label="Montando o relatório" />
          ) : dados.isError || !relatorio ? (
            <Aviso
              icone="alert-circle"
              erro
              acao={{ rotulo: 'Tentar de novo', onClick: () => void dados.refetch() }}
            >
              {mensagemDoErro(dados.error)}
            </Aviso>
          ) : (
            <Folha html={html} nome={relatorio.pessoa.nome} />
          )}
        </section>
      </div>
    </Pagina>
  );
}

/** Largura de uma folha A4 na tela (210 mm a 96 dpi). */
const LARGURA_A4 = 794;

/**
 * A previa em folha A4, com os botoes de baixar e imprimir.
 *
 * A folha e desenhada SEMPRE na largura do papel e reduzida em escala para
 * caber, como num visualizador de PDF. Espremer o documento na largura do
 * celular mostraria uma tabela que nao e a que vai sair impressa.
 */
function Folha({ html, nome }: { html: string; nome: string }) {
  const quadro = useRef<HTMLIFrameElement>(null);
  const moldura = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState(1123);
  const [escala, setEscala] = useState(1);

  // O iframe cresce com o documento: a previa rola junto com a pagina, sem
  // uma segunda barra de rolagem dentro dela.
  function medir() {
    const doc = quadro.current?.contentDocument;
    if (doc) setAltura(Math.max(600, doc.documentElement.scrollHeight + 8));
  }
  useEffect(() => {
    const id = window.setTimeout(medir, 60);
    return () => window.clearTimeout(id);
  }, [html]);

  useEffect(() => {
    const el = moldura.current;
    if (!el) return;
    const observar = new ResizeObserver(([entrada]) => {
      const largura = entrada?.contentRect.width ?? LARGURA_A4;
      setEscala(Math.min(1, largura / LARGURA_A4));
    });
    observar.observe(el);
    return () => observar.disconnect();
  }, []);

  function imprimir() {
    quadro.current?.contentWindow?.focus();
    quadro.current?.contentWindow?.print();
  }

  return (
    <>
      <div className={estilos.barraDaFolha}>
        <button type="button" className={`${botoes.ambar} ${estilos.baixar}`} onClick={imprimir}>
          <Icone nome="download" size={20} />
          Baixar PDF
        </button>
        <button type="button" className={botoes.contorno} onClick={imprimir}>
          <Icone nome="printer" size={20} />
          Imprimir
        </button>
        <p className={estilos.dica}>
          <Icone nome="info" size={14} />
          <span>
            Na janela que abrir, escolha <strong>Salvar como PDF</strong> para baixar o arquivo.
          </span>
        </p>
      </div>
      <div ref={moldura} className={estilos.moldura}>
        <div className={estilos.folha} style={{ width: LARGURA_A4 * escala, height: altura * escala }}>
          <iframe
            ref={quadro}
            title={`Prévia do relatório de ${nome}`}
            srcDoc={html}
            onLoad={medir}
            className={estilos.quadro}
            style={{ width: LARGURA_A4, height: altura, transform: `scale(${escala})` }}
          />
        </div>
      </div>
    </>
  );
}

/** O resumo escrito pela IA: o que a assinatura acrescenta ao relatorio. */
function CartaoDoResumo({
  dadosDoResumo,
  temResumo,
  onResumo,
  onTirar,
}: {
  dadosDoResumo: string | null;
  temResumo: boolean;
  onResumo: (texto: string) => void;
  onTirar: () => void;
}) {
  const { premium } = usePlano();
  const tratarAssinatura = useAssinaturaExigida();
  const { avisar } = useDialogos();
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    if (!dadosDoResumo) return;
    setGerando(true);
    try {
      onResumo(await healthApi.resumoDoRelatorio(dadosDoResumo));
    } catch (e) {
      if (!tratarAssinatura(e)) void avisar('Não consegui escrever o resumo', mensagemDoErro(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <SurfaceCard className={`${estilos.cartao} ${estilos.bloco} ${estilos.ia}`}>
      <div className={estilos.iaTopo}>
        <span className={estilos.iaSelo} aria-hidden="true">
          <Icone nome="mci:star-four-points" size={20} />
        </span>
        <div>
          <h2 className={estilos.titulo}>Resumo por IA</h2>
          <p className={estilos.iaTexto}>
            Um parágrafo no topo do relatório com o que aconteceu no período, para o médico ler
            primeiro. Não faz diagnóstico.
          </p>
        </div>
      </div>

      {premium ? (
        <div className={estilos.iaAcoes}>
          <button
            type="button"
            className={botoes.verde}
            onClick={() => void gerar()}
            disabled={gerando || !dadosDoResumo}
          >
            {gerando ? <span className={botoes.girando} /> : <Icone nome="mci:star-four-points" size={18} />}
            {temResumo ? 'Escrever de novo' : 'Gerar resumo'}
          </button>
          {temResumo ? (
            <button type="button" className={botoes.texto} onClick={onTirar} disabled={gerando}>
              Tirar do relatório
            </button>
          ) : null}
        </div>
      ) : (
        <Link to="/conta/assinatura" className={estilos.iaConvite}>
          <Icone nome="lock" size={16} />
          Faz parte da assinatura
          <Icone nome="chevron-right" size={16} />
        </Link>
      )}
    </SurfaceCard>
  );
}
