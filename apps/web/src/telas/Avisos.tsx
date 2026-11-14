import type { TipoDeAviso } from '@gestao/shared/lib/avisos';
import { isSameDay } from 'date-fns';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { useAvisos, type AvisoComLeitura } from '@/lib/avisos';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { FilterChips, type Chip } from '@/ui/FilterChips';
import { Icone } from '@/ui/Icone';
import { IconTile } from '@/ui/IconTile';
import { Aviso, Pagina } from '@/ui/Pagina';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './Avisos.module.css';

const CHIPS: Chip[] = [
  { value: null, label: 'Todas' },
  { value: 'medicamentos', label: 'Medicamentos' },
  { value: 'consultas', label: 'Consultas' },
  { value: 'lembretes', label: 'Lembretes' },
];

const QUENTE = { fundo: 'var(--cor-surface-warm)', traco: 'var(--cor-accent)' } as const;
const SALVIA = { fundo: 'var(--cor-pill-tablet)', traco: 'var(--cor-pill-tablet-icon)' } as const;

/** Ladrilho e icone de cada tipo. Ambar so onde ha algo a fazer. */
const VISUAL: Record<TipoDeAviso, { icone: string; fundo: string; traco: string }> = {
  'dose-atrasada': { icone: 'alert-circle', ...QUENTE },
  'dose-agora': { icone: 'mci:pill', ...QUENTE },
  'consulta-hoje': { icone: 'calendar', ...QUENTE },
  'consulta-amanha': { icone: 'calendar', ...SALVIA },
  'tratamento-terminando': { icone: 'flag', ...SALVIA },
  'tratamento-terminado': { icone: 'check-circle', ...SALVIA },
  'peso-desatualizado': {
    icone: 'activity',
    fundo: 'var(--cor-terracotta)',
    traco: 'var(--cor-surface)',
  },
  'politica-desatualizada': { icone: 'shield', ...SALVIA },
  'teste-terminando': { icone: 'mci:star-four-points', ...SALVIA },
};

/**
 * O que precisa da sua atencao.
 *
 * NAO e caixa de entrada nem historico: e ESTADO CORRENTE. Cada item e uma
 * condicao que vale agora, e resolver a condicao — marcar a dose, aceitar a
 * politica — faz o item sumir. "Marcar como lida" so apaga o ponto.
 */
export function Avisos() {
  const { avisos, carregando, erro, parcial, recarregar, marcarTodasComoLidas, marcarComoLido } =
    useAvisos();
  const [filtro, setFiltro] = useState<string | null>(null);

  const visiveis = useMemo(
    () => (filtro ? avisos.filter((a) => a.categoria === filtro) : avisos),
    [avisos, filtro],
  );

  // "Hoje" e sobre QUANDO O AVISO SURGIU: uma consulta de amanha e um aviso de
  // hoje, porque foi hoje que ela entrou no horizonte.
  const agora = new Date();
  const hoje = visiveis.filter((a) => a.surgiuEm == null || isSameDay(a.surgiuEm, agora));
  const anteriores = visiveis.filter((a) => a.surgiuEm != null && !isSameDay(a.surgiuEm, agora));

  const grupo = (titulo: string, itens: AvisoComLeitura[]) =>
    itens.length > 0 ? (
      <section className={estilos.secao} aria-label={titulo}>
        <SectionHeader title={titulo} />
        <ul className={estilos.lista}>
          {itens.map((a) => (
            <li key={a.id}>
              <Linha aviso={a} agora={agora} aoAbrir={() => marcarComoLido(a.id)} />
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <Pagina area="home">
      {/* Sem sino: um sino que abre a tela em que voce ja esta e botao morto. */}
      <ScreenHeader title="Notificações" voltar="historico" />

      <div className={estilos.filtros}>
        <FilterChips chips={CHIPS} selected={filtro} onSelect={setFiltro} rotulo="Tipo de aviso" />
      </div>

      {carregando && avisos.length === 0 ? (
        <Carregando />
      ) : erro && avisos.length === 0 ? (
        <div className={estilos.secao}>
          <Aviso icone="wifi-off" erro acao={{ rotulo: 'Tentar de novo', onClick: recarregar }}>
            Sem conexão. Os avisos são calculados a partir dos seus dados, e eu preciso buscá-los.
          </Aviso>
        </div>
      ) : (
        <>
          {/* Erro parcial: mostra o que veio. Esconder uma dose atrasada porque
              a busca da conta falhou seria o pior desfecho. */}
          {parcial ? (
            <p className={estilos.parcial} role="status">
              <Icone nome="alert-circle" size={14} />
              Alguns avisos podem estar faltando.
            </p>
          ) : null}

          {visiveis.length === 0 ? (
            <Vazio filtro={filtro} onVerTodas={() => setFiltro(null)} />
          ) : null}

          {grupo('Hoje', hoje)}
          {grupo('Anteriores', anteriores)}

          {visiveis.some((a) => !a.lido) ? (
            <button
              type="button"
              className={`${botoes.contorno} ${botoes.largo} ${estilos.marcarTodas}`}
              onClick={marcarTodasComoLidas}
            >
              Marcar todas como lidas
            </button>
          ) : null}
        </>
      )}
    </Pagina>
  );
}

function Linha({
  aviso,
  agora,
  aoAbrir,
}: {
  aviso: AvisoComLeitura;
  agora: Date;
  aoAbrir: () => void;
}) {
  const miolo = (
    <>
      <IconTile size={56} {...VISUAL[aviso.tipo]} />
      <span className={estilos.textos}>
        <span className={estilos.titulo}>
          {aviso.lido ? null : <span className="so-leitor-de-tela">Não lida: </span>}
          {aviso.titulo}
        </span>
        <span className={estilos.subtitulo}>{aviso.subtitulo}</span>
        <span className={estilos.carimbo}>
          <Icone nome="clock" size={13} />
          {quandoTexto(aviso, agora)}
        </span>
      </span>
      {/* Ponto VERDE, nao ambar: nao lido nao e pendente. */}
      {aviso.lido ? null : <span className={estilos.ponto} aria-hidden="true" />}
    </>
  );

  // Sem destino, a linha e so leitura: sem seta e sem clique.
  if (!aviso.rota) return <div className={estilos.cartao}>{miolo}</div>;

  return (
    <Link to={aviso.rota} className={estilos.cartao} onClick={aoAbrir}>
      {miolo}
      <Icone nome="chevron-right" size={20} className={estilos.seta} />
    </Link>
  );
}

/**
 * O vazio, que num aplicativo saudavel e o estado NORMAL. O corpo diz O QUE
 * FOI VERIFICADO — e o que transforma "vazio" em "confiavel" — e nao ha botao:
 * aqui o vazio e sucesso.
 */
function Vazio({ filtro, onVerTodas }: { filtro: string | null; onVerTodas: () => void }) {
  if (filtro) {
    const rotulo = CHIPS.find((c) => c.value === filtro)?.label.toLowerCase() ?? filtro;
    return (
      <div className={estilos.secao}>
        <Aviso icone="check-circle" acao={{ rotulo: 'Ver todas', onClick: onVerTodas }}>
          Nenhum aviso de {rotulo} agora.
        </Aviso>
      </div>
    );
  }

  return (
    <SurfaceCard className={estilos.vazio}>
      <IconTile
        icone="check-circle"
        size={54}
        fundo="var(--cor-pill-tablet)"
        traco="var(--cor-accent-green)"
      />
      <h2 className={estilos.vazioTitulo}>Tudo em dia</h2>
      <p className={estilos.vazioTexto}>
        Nenhuma dose atrasada e nenhuma consulta nas próximas 48 horas. Vamos avisar aqui quando
        algo precisar de você.
      </p>
    </SurfaceCard>
  );
}

/** "Agora", "Há 2 horas", "Ontem", "26/09". */
function quandoTexto(a: AvisoComLeitura, agora: Date): string {
  if (!a.surgiuEm) return 'Pendente';

  const minutos = Math.floor((agora.getTime() - a.surgiuEm.getTime()) / 60_000);
  if (minutos < 2) return 'Agora';
  if (minutos < 60) return `Há ${minutos} minutos`;

  const horas = Math.floor(minutos / 60);
  if (isSameDay(a.surgiuEm, agora)) return horas === 1 ? 'Há 1 hora' : `Há ${horas} horas`;

  const ontem = new Date(agora.getTime() - 24 * 3_600_000);
  if (isSameDay(a.surgiuEm, ontem)) return 'Ontem';

  return a.surgiuEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
