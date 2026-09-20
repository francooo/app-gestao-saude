import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { LoginRequest, PublicUser, RegisterRequest } from '@gestao/shared';

import { authApi, setOnSessionExpired } from '@/api/client';
import { tokenStorage } from '@/auth/tokenStorage';

type AuthState = {
  user: PublicUser | null;
  /** true enquanto restauramos a sessao do SecureStore, no boot do app. */
  initializing: boolean;
  signIn: (credentials: LoginRequest) => Promise<void>;
  signUp: (data: RegisterRequest) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Restaura a sessao guardada antes de decidir qual rota mostrar.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const session = await tokenStorage.load();
      if (!cancelled) {
        setUser(session?.user ?? null);
        setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // O client HTTP avisa aqui quando o refresh token e rejeitado.
  useEffect(() => {
    setOnSessionExpired(() => setUser(null));
    return () => setOnSessionExpired(null);
  }, []);

  const signIn = useCallback(async (credentials: LoginRequest) => {
    const result = await authApi.login(credentials);
    await tokenStorage.save({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
    setUser(result.user);
  }, []);

  // O cadastro ja devolve a sessao, entao a pessoa entra direto — sem
  // precisar digitar as credenciais que acabou de criar.
  const signUp = useCallback(async (data: RegisterRequest) => {
    const result = await authApi.register(data);
    await tokenStorage.save({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = await tokenStorage.getRefreshToken();
    // Limpa o estado local primeiro: a UI nao deve esperar a rede para sair.
    await tokenStorage.clear();
    setUser(null);
    if (refreshToken) await authApi.logout(refreshToken);
  }, []);

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
