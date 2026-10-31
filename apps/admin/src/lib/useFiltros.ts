import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Filtros e pagina das telas de lista, guardados na URL: recarregar ou
 * compartilhar o link mantem a mesma visao. Mudar um filtro volta a pagina 1.
 *
 * A busca digitada espera 300 ms parada antes de ir para a URL (e dai para o
 * servidor), para nao disparar uma consulta por tecla.
 */
export function useFiltros<Chave extends string>(chaves: readonly Chave[]) {
  const [parametros, setParametros] = useSearchParams();
  const buscaDaUrl = parametros.get('busca') ?? '';
  const [busca, setBusca] = useState(buscaDaUrl);

  useEffect(() => {
    if (busca === buscaDaUrl) return;
    const espera = setTimeout(() => {
      setParametros(
        (atuais) => {
          const novos = new URLSearchParams(atuais);
          if (busca.trim()) novos.set('busca', busca.trim());
          else novos.delete('busca');
          novos.delete('pagina');
          return novos;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(espera);
  }, [busca, buscaDaUrl, setParametros]);

  const valores = Object.fromEntries(chaves.map((c) => [c, parametros.get(c) ?? ''])) as Record<Chave, string>;
  const pagina = Math.max(1, Number(parametros.get('pagina')) || 1);

  function definir(chave: Chave | 'pagina', valor: string | number | null) {
    setParametros((atuais) => {
      const novos = new URLSearchParams(atuais);
      if (valor == null || valor === '' || (chave === 'pagina' && valor === 1)) novos.delete(chave);
      else novos.set(chave, String(valor));
      if (chave !== 'pagina') novos.delete('pagina');
      return novos;
    });
  }

  return {
    busca,
    setBusca,
    valores,
    pagina,
    definir,
    /** Pronto para mandar ao servidor. */
    consulta: { ...valores, busca: buscaDaUrl, pagina },
  };
}
