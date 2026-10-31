import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import * as cliente from '../api/cliente';
import type { AdminDoPainel } from '../api/cliente';

type EstadoDaSessao =
  | { estado: 'carregando' }
  | { estado: 'anonimo' }
  | { estado: 'autenticado'; admin: AdminDoPainel };

interface ValorDoContexto {
  sessao: EstadoDaSessao;
  entrar: (email: string, senha: string, lembrar: boolean) => Promise<void>;
  sair: () => Promise<void>;
  /** Troca os dados do admin na sessao (ex.: depois de editar o perfil). */
  atualizarAdmin: (admin: AdminDoPainel) => void;
}

const Contexto = createContext<ValorDoContexto | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<EstadoDaSessao>({ estado: 'carregando' });
  const queryClient = useQueryClient();

  // Ao abrir ou recarregar a pagina: o cookie ainda vale?
  useEffect(() => {
    let ativo = true;
    cliente.renovarSessao().then((renovada) => {
      if (!ativo) return;
      setSessao(renovada ? { estado: 'autenticado', admin: renovada.admin } : { estado: 'anonimo' });
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Sessao perdida no meio do uso (revogada, vencida): volta ao login e
  // descarta tudo que estava em cache — dado de familia nao fica na tela.
  useEffect(() => {
    cliente.definirAoPerderSessao(() => {
      queryClient.clear();
      setSessao({ estado: 'anonimo' });
    });
    return () => cliente.definirAoPerderSessao(null);
  }, [queryClient]);

  const entrar = useCallback(async (email: string, senha: string, lembrar: boolean) => {
    const nova = await cliente.entrar(email, senha, lembrar);
    setSessao({ estado: 'autenticado', admin: nova.admin });
  }, []);

  const sair = useCallback(async () => {
    await cliente.sair();
    queryClient.clear();
    setSessao({ estado: 'anonimo' });
  }, [queryClient]);

  const atualizarAdmin = useCallback((admin: AdminDoPainel) => {
    setSessao((atual) => (atual.estado === 'autenticado' ? { estado: 'autenticado', admin } : atual));
  }, []);

  const valor = useMemo(() => ({ sessao, entrar, sair, atualizarAdmin }), [sessao, entrar, sair, atualizarAdmin]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): ValorDoContexto {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useAuth fora do AuthProvider');
  return valor;
}
