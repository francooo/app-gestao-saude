import { ChevronLeft, ChevronRight, CircleAlert, RotateCw, Search, Sprout, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { numero } from '../lib/formato';
import estilos from './componentes.module.css';

// --- cartao -----------------------------------------------------------------

export function Cartao({
  titulo,
  subtitulo,
  acoes,
  children,
  className,
}: {
  titulo?: string;
  subtitulo?: string;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${estilos.cartao} ${className ?? ''}`}>
      {(titulo || acoes) && (
        <header className={estilos.cabecalhoDoCartao}>
          <div>
            {titulo && <h2 className={estilos.tituloDoCartao}>{titulo}</h2>}
            {subtitulo && <p className={estilos.subtituloDoCartao}>{subtitulo}</p>}
          </div>
          {acoes}
        </header>
      )}
      {children}
    </section>
  );
}

// --- KPI --------------------------------------------------------------------

export type Tom = 'salvia' | 'mostarda' | 'musgo' | 'caramelo';

export function Kpi({
  rotulo,
  valor,
  detalhe,
  Icone,
  tom = 'salvia',
}: {
  rotulo: string;
  valor: number | string;
  detalhe?: string;
  Icone: LucideIcon;
  tom?: Tom;
}) {
  return (
    <div className={estilos.kpi}>
      <span className={`${estilos.kpiIcone} ${estilos[`tom_${tom}`]}`} aria-hidden>
        <Icone size={22} strokeWidth={1.8} />
      </span>
      <div className={estilos.kpiTextos}>
        <span className={estilos.kpiRotulo}>{rotulo}</span>
        <strong className={estilos.kpiValor}>{typeof valor === 'number' ? numero(valor) : valor}</strong>
        {detalhe && <span className={estilos.kpiDetalhe}>{detalhe}</span>}
      </div>
      <img src="/folhas/ramo-canto.png" alt="" className={estilos.kpiFolha} aria-hidden />
    </div>
  );
}

export function GradeDeKpis({ children }: { children: ReactNode }) {
  return <div className={estilos.gradeDeKpis}>{children}</div>;
}

// --- status -----------------------------------------------------------------

export type TomDaPill = 'sucesso' | 'aviso' | 'perigo' | 'neutro' | 'info';

/** Status sempre com cor E texto (DS): o ponto reforca, o texto informa. */
export function Pill({ tom, children }: { tom: TomDaPill; children: ReactNode }) {
  return (
    <span className={`${estilos.pill} ${estilos[`pill_${tom}`]}`}>
      <span className={estilos.ponto} aria-hidden />
      {children}
    </span>
  );
}

// --- filtros ----------------------------------------------------------------

export function BarraDeFiltros({ children }: { children: ReactNode }) {
  return (
    <div className={estilos.barraDeFiltros} role="search">
      {children}
    </div>
  );
}

export function CampoDeBusca({
  valor,
  onChange,
  rotulo,
}: {
  valor: string;
  onChange: (valor: string) => void;
  rotulo: string;
}) {
  return (
    <label className={estilos.busca}>
      <Search size={18} aria-hidden />
      <span className="so-leitor-de-tela">{rotulo}</span>
      <input type="search" placeholder={rotulo} value={valor} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Selecao({
  rotulo,
  valor,
  opcoes,
  onChange,
  todos = true,
}: {
  rotulo: string;
  valor: string;
  opcoes: { valor: string; rotulo: string }[];
  onChange: (valor: string) => void;
  /** Mostra a opcao "Todos" (valor vazio). */
  todos?: boolean;
}) {
  return (
    <label className={estilos.selecao}>
      <span className={estilos.selecaoRotulo}>{rotulo}</span>
      <select value={valor} onChange={(e) => onChange(e.target.value)}>
        {todos && <option value="">Todos</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}

// --- tabela -----------------------------------------------------------------

export interface Coluna<T> {
  titulo: string;
  render: (item: T) => ReactNode;
  /** Coluna numerica: alinhada a direita. */
  numerica?: boolean;
}

export function Tabela<T extends { id: string }>({
  legenda,
  colunas,
  itens,
  atualizando,
  compacta,
}: {
  legenda: string;
  colunas: Coluna<T>[];
  itens: T[];
  atualizando?: boolean;
  /** Poucas colunas curtas: cabe no celular sem rolar de lado. */
  compacta?: boolean;
}) {
  return (
    <div className={estilos.rolagemDaTabela} data-atualizando={atualizando || undefined}>
      <table className={`${estilos.tabela} ${compacta ? estilos.tabelaCompacta : ''}`}>
        <caption className="so-leitor-de-tela">{legenda}</caption>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c.titulo} scope="col" className={c.numerica ? estilos.numerica : undefined}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id}>
              {colunas.map((c) => (
                <td key={c.titulo} className={c.numerica ? estilos.numerica : undefined}>
                  {c.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Paginacao({
  pagina,
  total,
  porPagina,
  onChange,
}: {
  pagina: number;
  total: number;
  porPagina: number;
  onChange: (pagina: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const de = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const ate = Math.min(total, pagina * porPagina);

  return (
    <nav className={estilos.paginacao} aria-label="Paginação">
      <span>
        Mostrando {numero(de)}–{numero(ate)} de {numero(total)}
      </span>
      <div className={estilos.paginas}>
        <button type="button" onClick={() => onChange(pagina - 1)} disabled={pagina <= 1} aria-label="Página anterior">
          <ChevronLeft size={18} />
        </button>
        <span aria-current="page">
          {pagina} de {paginas}
        </span>
        <button
          type="button"
          onClick={() => onChange(pagina + 1)}
          disabled={pagina >= paginas}
          aria-label="Próxima página"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </nav>
  );
}

// --- barras de progresso (rankings, distribuicao) ---------------------------

export function ListaDeBarras({
  itens,
  tom = 'caramelo',
}: {
  itens: { rotulo: string; valor: number; detalhe: string }[];
  tom?: 'caramelo' | 'musgo';
}) {
  const maximo = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className={estilos.listaDeBarras}>
      {itens.map((i) => (
        <li key={i.rotulo}>
          <div className={estilos.barraTextos}>
            <span>{i.rotulo}</span>
            <strong>{i.detalhe}</strong>
          </div>
          <div className={estilos.trilho}>
            <div
              className={`${estilos.preenchimento} ${estilos[`preenchimento_${tom}`]}`}
              style={{ width: `${(i.valor / maximo) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// --- estados ----------------------------------------------------------------

export function Carregando({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className={estilos.esqueleto} aria-busy="true" aria-live="polite">
      <span className="so-leitor-de-tela">Carregando…</span>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className={estilos.linhaDoEsqueleto} />
      ))}
    </div>
  );
}

export function Erro({ onTentar }: { onTentar: () => void }) {
  return (
    <div className={estilos.estado} role="alert">
      <CircleAlert size={28} className={estilos.iconeErro} aria-hidden />
      <p className={estilos.estadoTitulo}>Não foi possível carregar os dados</p>
      <p>Verifique a conexão e tente de novo.</p>
      <button type="button" className={estilos.botaoSecundario} onClick={onTentar}>
        <RotateCw size={16} aria-hidden />
        Tentar de novo
      </button>
    </div>
  );
}

export function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className={estilos.estado}>
      <Sprout size={28} className={estilos.iconeVazio} aria-hidden />
      <p className={estilos.estadoTitulo}>{titulo}</p>
      <p>{texto}</p>
    </div>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return <p className={estilos.aviso}>{children}</p>;
}

/** Nome com avatar de iniciais. */
export function ComAvatar({ nome, iniciais, secundario }: { nome: string; iniciais: string; secundario?: string }) {
  return (
    <span className={estilos.comAvatar}>
      <span className={estilos.avatar} aria-hidden>
        {iniciais}
      </span>
      <span className={estilos.comAvatarTextos}>
        <strong>{nome}</strong>
        {secundario && <span>{secundario}</span>}
      </span>
    </span>
  );
}
