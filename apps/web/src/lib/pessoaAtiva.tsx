import type { Profile } from '@gestao/shared/api/health';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import { usePerfis } from '@/api/consultas';

/**
 * A pessoa da familia que o site inteiro esta mostrando (o seletor de membros
 * do cabecalho, em layout/Casca).
 *
 * UM SO ESTADO PARA TODAS AS TELAS: escolher Carlos no Inicio faz Remedios,
 * Medicos e Medicoes abrirem em Carlos. null = "Todos" (a familia inteira).
 *
 * LEMBRADO ENTRE VISITAS em localStorage, como os avisos lidos (lib/avisos):
 * so uma conveniencia — num navegador sem armazenamento o site comeca em
 * "Todos" e funciona igual. Um id que nao existe mais (membro removido, outra
 * conta no mesmo navegador) cai para "Todos" sozinho.
 *
 * `?pessoa=<id>` na URL (ex.: da ficha do membro para Medicoes) troca a pessoa
 * ativa, em vez de cada tela guardar um estado proprio.
 */

const CHAVE = 'familia-saude:pessoa-ativa';

function ler(): string | null {
  try {
    return window.localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

function gravar(id: string | null) {
  try {
    if (id) window.localStorage.setItem(CHAVE, id);
    else window.localStorage.removeItem(CHAVE);
  } catch {
    // Sem armazenamento: a escolha vale so ate fechar a aba.
  }
}

type Estado = {
  /** null = Todos. Ja validado contra a lista de membros. */
  pessoaId: string | null;
  /** O membro escolhido, ou null em "Todos". */
  pessoa: Profile | null;
  /** Para telas que precisam de UMA pessoa: a escolhida ou, em "Todos", o titular. */
  pessoaOuTitular: Profile | null;
  /** O titular da conta. */
  titular: Profile | null;
  membros: Profile[];
  /** A lista ainda nao chegou: as telas nao devem concluir "nao ha ninguem". */
  carregando: boolean;
  setPessoa: (id: string | null) => void;
};

const Contexto = createContext<Estado | null>(null);

export function PessoaAtivaProvider({ children }: { children: ReactNode }) {
  const perfis = usePerfis();
  const membros = useMemo(() => perfis.data ?? [], [perfis.data]);
  const [escolhido, setEscolhido] = useState<string | null>(ler);
  const [params, setParams] = useSearchParams();

  const setPessoa = useCallback((id: string | null) => {
    setEscolhido(id);
    gravar(id);
  }, []);

  // ?pessoa= na URL troca a pessoa ativa e sai da URL (voltar nao repete).
  const pedida = params.get('pessoa');
  useEffect(() => {
    if (!pedida) return;
    setPessoa(pedida);
    const resto = new URLSearchParams(params);
    resto.delete('pessoa');
    setParams(resto, { replace: true });
  }, [pedida, params, setParams, setPessoa]);

  const valor = useMemo<Estado>(() => {
    // Enquanto a lista nao chega, confia no guardado; depois, valida.
    const pessoa = membros.find((m) => m.id === escolhido) ?? null;
    const pessoaId = perfis.data ? (pessoa?.id ?? null) : escolhido;
    const titular = membros.find((m) => m.isAccountHolder) ?? membros[0] ?? null;
    return {
      pessoaId,
      pessoa,
      pessoaOuTitular: pessoa ?? titular,
      titular,
      membros,
      carregando: perfis.isPending,
      setPessoa,
    };
  }, [membros, escolhido, perfis.data, perfis.isPending, setPessoa]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePessoaAtiva(): Estado {
  const v = useContext(Contexto);
  if (!v) throw new Error('usePessoaAtiva fora do PessoaAtivaProvider');
  return v;
}

/** Primeiro nome, com a inicial do sobrenome quando dois membros dividem o primeiro nome. */
export function rotuloCurto(nome: string, todos: { id: string; fullName: string }[], id: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeiro = partes[0] ?? nome;
  const repete = todos.some((o) => o.id !== id && (o.fullName.trim().split(/\s+/)[0] ?? '') === primeiro);
  if (!repete) return primeiro;
  const inicial = partes[1]?.charAt(0);
  return inicial ? `${primeiro} ${inicial}.` : primeiro;
}

/** "Cuidado de Ana Clara" / "Família toda": a linha de contexto dos cabecalhos. */
export function useContextoDaPagina(): string | null {
  // Fora da area logada (sem provider) nao ha contexto a mostrar.
  const v = useContext(Contexto);
  if (!v) return null;
  return v.pessoa ? `Cuidado de ${v.pessoa.fullName.split(/\s+/)[0]}` : 'Família toda';
}
