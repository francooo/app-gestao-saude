/**
 * Pecas comuns das telas de lista: pagina, busca e filtros vindos da URL.
 *
 * Tudo que vem da querystring passa por aqui antes de chegar a uma consulta:
 * pagina vira inteiro dentro do limite, busca e filtro vazios viram null, e
 * filtro fora da lista permitida e ignorado (nunca vai cru para o SQL).
 */
export const POR_PAGINA = 10;

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export function parametrosDe(request: Request) {
  const url = new URL(request.url);
  const pagina = Math.min(1000, Math.max(1, Number.parseInt(url.searchParams.get('pagina') ?? '1', 10) || 1));
  const buscaCrua = url.searchParams.get('busca')?.trim().slice(0, 100) || null;

  return {
    pagina,
    offset: (pagina - 1) * POR_PAGINA,
    busca: buscaCrua,
    /** Busca pronta para ILIKE, com % e _ do usuario escapados. */
    padraoDeBusca: buscaCrua ? `%${buscaCrua.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null,
    filtro<T extends string>(nome: string, permitidos: readonly T[]): T | null {
      const valor = url.searchParams.get(nome);
      return valor && (permitidos as readonly string[]).includes(valor) ? (valor as T) : null;
    },
    texto(nome: string): string | null {
      return url.searchParams.get(nome)?.trim().slice(0, 100) || null;
    },
  };
}

/** Monta a resposta paginada a partir das linhas com `total` (count(*) over ()). */
export function paginar<T extends { total: number }>(linhas: T[], pagina: number): Pagina<Omit<T, 'total'>> {
  return {
    itens: linhas.map(({ total: _total, ...resto }) => resto),
    total: linhas[0]?.total ?? 0,
    pagina,
    porPagina: POR_PAGINA,
  };
}

/** Fuso das datas "de calendario" do painel (hoje, este mes). */
export const FUSO = 'America/Sao_Paulo';
