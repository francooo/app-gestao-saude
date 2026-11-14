import { useQueryClient } from '@tanstack/react-query';
import type { LoginRequest, PublicUser, RegisterRequest } from '@gestao/shared';
import { contaApi } from '@gestao/shared/api/conta';
import { descartarTodosOsRascunhos } from '@gestao/shared/lib/rascunhoDeMedicamento';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { authApi, definirAoExpirar, renovarSessao } from '@/api/cliente';

type AuthState = {
  user: PublicUser | null;
  /** true enquanto a sessao e restaurada a partir do cookie, na abertura. */
  initializing: boolean;
  signIn: (credentials: LoginRequest) => Promise<void>;
  signUp: (data: RegisterRequest) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  /**
   * Tira deste navegador tudo o que e da conta: as respostas em cache e os
   * rascunhos em memoria. A proxima pessoa a entrar pode ser outra.
   */
  const limparDadosLocais = useCallback(() => {
    queryClient.clear();
    descartarTodosOsRascunhos();
  }, [queryClient]);

  // Restaura a sessao: o cookie httpOnly vira um access token, e a conta vem
  // do servidor (o navegador nao guarda copia dela).
  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const token = await renovarSessao();
        if (!token) return;
        const { user: conta } = await contaApi.perfil();
        if (!cancelado) setUser({ id: conta.id, email: conta.email, fullName: conta.fullName });
      } catch {
        // Sem rede ou sem sessao: segue para o login.
      } finally {
        if (!cancelado) setInitializing(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  // O cliente HTTP avisa aqui quando a renovacao e recusada.
  useEffect(() => {
    definirAoExpirar(() => {
      setUser(null);
      limparDadosLocais();
    });
    return () => definirAoExpirar(null);
  }, [limparDadosLocais]);

  const signIn = useCallback(
    async (credentials: LoginRequest) => {
      const novo = await authApi.login(credentials);
      limparDadosLocais();
      setUser(novo);
    },
    [limparDadosLocais],
  );

  // O cadastro ja devolve a sessao: a pessoa entra direto.
  const signUp = useCallback(
    async (data: RegisterRequest) => {
      const novo = await authApi.register(data);
      limparDadosLocais();
      setUser(novo);
    },
    [limparDadosLocais],
  );

  const signOut = useCallback(async () => {
    // Limpa o estado local primeiro: a interface nao espera a rede para sair.
    setUser(null);
    limparDadosLocais();
    await authApi.logout();
  }, [limparDadosLocais]);

  const value = useMemo(
    () => ({ user, initializing, signIn, signUp, signOut }),
    [user, initializing, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return context;
}
