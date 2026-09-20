import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';

/**
 * Area autenticada. O guard tambem cobre a expiracao da sessao: quando o
 * refresh token e rejeitado, o AuthContext zera o usuario e o redirect dispara.
 */
export default function AppLayout() {
  const { user } = useAuth();

  if (!user) return <Redirect href="/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
