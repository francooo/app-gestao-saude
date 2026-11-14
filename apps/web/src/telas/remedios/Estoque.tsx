import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  healthApi,
  type Medication,
  type Stock,
  type StockEntry,
} from '@gestao/shared/api/health';
import {
  dataDeTermino,
  diaPorExtenso,
  estoqueBaixo,
  nivel,
  quantidadeDoEstoque,
  validadeCurta,
  validadeProxima,
} from '@gestao/shared/lib/estoque';
import { diaCurto, formaVisual, tituloDoMedicamento } from '@gestao/shared/lib/posologia';
import { endOfDay, startOfDay } from 'date-fns';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { CHAVES, usePerfis, useRemedio, type ListaDeRemedios } from '@/api/consultas';
import { mensagemDoErro } from '@/api/doses';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { useDialogos } from '@/ui/Dialogo';
import { FilterChips, type Chip } from '@/ui/FilterChips';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_NEUTRO, LADRILHO_POR_FORMA } from '@/ui/IconTile';
import { Aviso, Pagina } from '@/ui/Pagina';
import { ProfileSelector } from '@/ui/ProfileSelector';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SummaryTile } from '@/ui/SummaryTile';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './Estoque.module.css';
import comuns from './remedios.module.css';
import { useAreaDeRemedios } from './RemediosLayout';

type Filtro = 'baixo' | 'validade';

const CHIPS: Chip[] = [
  { value: null, label: 'Todos' },
  { value: 'baixo', label: 'Estoque baixo' },
  { value: 'validade', label: 'Validade próxima' },
];

type ComEstoque = Medication & { stock: Stock };

/**
 * Estoque: o que sobra de cada remedio, quando acaba e quando vence.
 *
 * O filtro de pessoa e proprio desta tela (como no aplicativo), e nao o da
 * lista de Remedios: olhar o estoque da familia nao muda a lista ao lado.
 */
export function Estoque() {
  const { doisPaineis } = useAreaDeRemedios();
  const perfis = usePerfis();
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro | null>(null);

  const consulta = useQuery({
    // Sob a raiz das listas de remedios: dose marcada e compra registrada
    // atualizam o estoque daqui tambem.
    queryKey: [...CHAVES.remedios, 'estoque', { perfilId }],
    queryFn: async (): Promise<ListaDeRemedios> => {
      const agora = new Date();
      const remedios = await healthApi.listMedications({
        from: startOfDay(agora),
        to: endOfDay(agora),
        profileId: perfilId,
      });
      return { remedios, agora };
    },
    placeholderData: (anterior) => anterior,
  });

  const agora = consulta.data?.agora ?? new Date();
  const comEstoque = useMemo(
    () =>
      (consulta.data?.remedios ?? []).filter((m): m is ComEstoque => m.isActive && !!m.stock),
    [consulta.data],
  );
  const baixos = useMemo(() => comEstoque.filter((m) => estoqueBaixo(m, m.stock)), [comEstoque]);
  const vencendo = useMemo(
    () => comEstoque.filter((m) => validadeProxima(m.stock, agora)),
    [comEstoque, agora],
  );
  const visiveis = filtro === 'baixo' ? baixos : filtro === 'validade' ? vencendo : comEstoque;

  /** Onde foi a compra mais recente que tem local anotado. */
  const ultimoLocal = useMemo(() => {
    const comLocal = comEstoque
      .filter((m) => m.stock.place && m.stock.lastPurchaseAt)
      .sort((a, b) => (b.stock.lastPurchaseAt! > a.stock.lastPurchaseAt! ? 1 : -1));
    return comLocal[0]?.stock.place ?? null;
  }, [comEstoque]);

  const adicionar = (
    <Link to="/remedios/compra" className={`${botoes.ambar} ${botoes.largo} ${comuns.secao}`}>
      <Icone nome="plus" size={20} />
      Adicionar medicamento ao estoque
    </Link>
  );

  return (
    <Pagina area="medications">
      <ScreenHeader
        title="Estoque de medicamentos"
        voltar={doisPaineis ? undefined : '/remedios'}
        mostrarSino
      />

      <div className={comuns.bloco}>
        <ProfileSelector
          profiles={perfis.data ?? []}
          selectedId={perfilId}
          onSelect={setPerfilId}
          tituloDoPainel="Ver estoque de"
        />
      </div>

      {consulta.isPending ? (
        <Carregando />
      ) : consulta.isError && !consulta.data ? (
        <div className={comuns.bloco}>
          <Aviso
            icone="alert-circle"
            erro
            acao={{ rotulo: 'Tentar de novo', onClick: () => void consulta.refetch() }}
          >
            {mensagemDoErro(consulta.error)}
          </Aviso>
        </div>
      ) : comEstoque.length === 0 ? (
        <>
          <SurfaceCard className={`${estilos.vazio} ${comuns.bloco}`}>
            <IconTile {...LADRILHO_NEUTRO} icone="mci:store-plus-outline" size={54} />
            <h2 className={estilos.vazioTitulo}>Nenhum remédio com estoque ainda</h2>
            <p className={estilos.vazioTexto}>
              Registre a compra de uma caixa e o aplicativo conta o que sobra a cada dose marcada.
            </p>
          </SurfaceCard>
          {adicionar}
        </>
      ) : (
        <>
          <div className={comuns.resumo}>
            <SummaryTile
              icone="alert-triangle"
              corDoLadrilho="var(--cor-tile-sun)"
              rotulo="Estoque baixo"
              valor={`${baixos.length} ${baixos.length === 1 ? 'alerta' : 'alertas'}`}
              detalhe="acaba em até 7 dias"
            />
            <SummaryTile
              icone="mci:shield-check-outline"
              corDoLadrilho="var(--cor-tile-clock)"
              rotulo="Validade próxima"
              valor={`${vencendo.length} ${vencendo.length === 1 ? 'remédio' : 'remédios'}`}
              detalhe="vence em até 30 dias"
            />
          </div>

          <div className={comuns.bloco}>
            <FilterChips
              rotulo="Filtrar o estoque"
              chips={CHIPS}
              selected={filtro}
              onSelect={(v) => setFiltro(v as Filtro | null)}
            />
          </div>

          <section className={comuns.secao}>
            <SectionHeader title="Meu estoque" />
            {visiveis.length === 0 ? (
              <Aviso icone="check-circle">
                {filtro === 'baixo'
                  ? 'Nenhum remédio acabando. Tudo em dia.'
                  : 'Nenhuma validade vencendo nos próximos 30 dias.'}
              </Aviso>
            ) : (
              <div className={comuns.pilha}>
                {visiveis.map((m) => (
                  <CartaoDeEstoque
                    key={m.id}
                    medicamento={m}
                    agora={agora}
                    mostrarPerfil={perfilId === null}
                  />
                ))}
              </div>
            )}
          </section>

          {ultimoLocal ? (
            <div className={`${comuns.atalho} ${comuns.bloco}`}>
              <IconTile {...LADRILHO_NEUTRO} icone="mci:store-plus-outline" size={54} />
              <span className={comuns.atalhoTextos}>
                <span className={comuns.atalhoTitulo}>Onde foi adquirido?</span>
                <span className={comuns.atalhoDescricao}>{ultimoLocal}</span>
              </span>
            </div>
          ) : null}

          {adicionar}
        </>
      )}

      {/* No aplicativo, aqui fica o interruptor do lembrete de compra do aparelho. */}
      {consulta.data ? (
        <div className={`${comuns.atalho} ${comuns.bloco}`}>
          <IconTile {...LADRILHO_NEUTRO} icone="bell" />
          <span className={comuns.atalhoTextos}>
            <span className={comuns.atalhoTitulo}>Lembrete de compra</span>
            <span className={comuns.atalhoDescricao}>
              O aviso de estoque baixo toca no aplicativo do celular
            </span>
          </span>
        </div>
      ) : null}
    </Pagina>
  );
}

function CartaoDeEstoque({
  medicamento: m,
  agora,
  mostrarPerfil,
}: {
  medicamento: ComEstoque;
  agora: Date;
  mostrarPerfil: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const estoque = m.stock;
  const forma = LADRILHO_POR_FORMA[formaVisual(m.form)];
  const titulo = tituloDoMedicamento(m);
  const baixo = estoqueBaixo(m, estoque);
  const vencendo = validadeProxima(estoque, agora);
  const termino = dataDeTermino(m, estoque, agora);
  const restante = quantidadeDoEstoque(estoque.remaining, m.form);
  const quem = mostrarPerfil && m.profileName ? m.profileName.split(' ')[0] : null;
  const idDasCompras = `compras-${m.id}`;

  const previsao =
    estoque.remaining <= 0
      ? 'Estoque esgotado'
      : termino
        ? `Acaba por volta de ${diaPorExtenso(termino, agora)}`
        : 'Uso se necessário: sem previsão';

  return (
    <SurfaceCard className={comuns.cartao}>
      <div className={estilos.topo}>
        <IconTile {...forma} size={54} />
        <div className={estilos.textos}>
          <div className={estilos.linhaTitulo}>
            <h3 className={estilos.nome}>{titulo}</h3>
            <span className={estilos.etiqueta} data-baixo={baixo ? '' : undefined}>
              {baixo ? 'Estoque baixo' : 'Estoque suficiente'}
            </span>
          </div>
          <p className={estilos.restante}>{restante} restantes</p>
          {quem ? <p className={estilos.detalhe}>{quem}</p> : null}

          <div className={estilos.trilho} aria-hidden="true">
            <div
              className={estilos.nivel}
              data-baixo={baixo ? '' : undefined}
              style={{ width: `${nivel(estoque) * 100}%` }}
            />
          </div>

          <p className={estilos.meta}>
            <Icone nome="calendar" size={14} />
            {previsao}
          </p>
          {estoque.expiresOn ? (
            <p className={estilos.meta} data-atencao={vencendo ? '' : undefined}>
              <Icone nome="mci:shield-check-outline" size={15} />
              Validade: {validadeCurta(estoque.expiresOn)}
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className={estilos.faixa}
        aria-expanded={aberto}
        aria-controls={idDasCompras}
        onClick={() => setAberto((v) => !v)}
      >
        <Icone nome="package" size={16} color="var(--cor-text-secondary)" />
        <span className={estilos.faixaTexto}>
          {m.packageAmount
            ? `Quantidade por caixa: ${quantidadeDoEstoque(m.packageAmount, m.form)}`
            : 'Compras registradas'}
        </span>
        <span className="so-leitor-de-tela">
          {aberto ? 'Esconder compras' : 'Ver compras registradas'}
        </span>
        <Icone nome={aberto ? 'chevron-up' : 'chevron-down'} size={20} />
      </button>

      {aberto ? <Compras id={idDasCompras} medicamento={m} titulo={titulo} /> : null}
    </SurfaceCard>
  );
}

/** As compras de um remedio. So busca quando o cartao e aberto. */
function Compras({ id, medicamento: m, titulo }: { id: string; medicamento: Medication; titulo: string }) {
  const queryClient = useQueryClient();
  const { confirmar, avisar } = useDialogos();
  const detalhe = useRemedio(m.id);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const compras = detalhe.data?.remedio.stockEntries ?? null;

  async function remover(e: StockEntry) {
    const confirmou = await confirmar(
      'Remover esta compra?',
      `${quantidadeDoEstoque(e.units, m.form)} de ${diaCurto(new Date(e.purchasedAt))} saem do estoque de ${titulo}.`,
      'Remover',
    );
    if (!confirmou) return;

    setRemovendo(e.id);
    try {
      const atualizado = await healthApi.removerCompra(m.id, e.id);
      queryClient.setQueryData(CHAVES.remedio(m.id), { remedio: atualizado, agora: new Date() });
      void queryClient.invalidateQueries({ queryKey: CHAVES.remedios });
    } catch (erro) {
      void avisar('Não consegui remover', mensagemDoErro(erro));
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <div id={id} className={estilos.compras}>
      {detalhe.isPending ? (
        <Carregando />
      ) : !compras ? (
        <button type="button" className={estilos.tentar} onClick={() => void detalhe.refetch()}>
          {mensagemDoErro(detalhe.error)} <strong>Tentar de novo</strong>
        </button>
      ) : compras.length === 0 ? (
        <p className={estilos.detalhe}>Nenhuma compra registrada.</p>
      ) : (
        <ul className={estilos.listaDeCompras}>
          {compras.map((e) => (
            <li key={e.id} className={estilos.compra}>
              <div className={estilos.compraTextos}>
                <p className={estilos.compraTitulo}>
                  {diaCurto(new Date(e.purchasedAt))} · {quantidadeDoEstoque(e.units, m.form)}
                </p>
                {e.place || e.expiresOn ? (
                  <p className={estilos.detalhe}>
                    {[e.place, e.expiresOn ? `validade ${validadeCurta(e.expiresOn)}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className={estilos.lixeira}
                disabled={removendo !== null}
                onClick={() => void remover(e)}
                aria-label={`Remover compra de ${diaCurto(new Date(e.purchasedAt))}`}
              >
                {removendo === e.id ? (
                  <span className={botoes.girando} />
                ) : (
                  <Icone nome="trash-2" size={18} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Link to={`/remedios/compra?id=${m.id}`} className={estilos.registrar}>
        <Icone nome="plus" size={16} />
        Registrar compra
      </Link>
    </div>
  );
}
