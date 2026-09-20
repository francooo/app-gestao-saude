import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';

/** Area publica: quem ja esta logado nao deve ver a tela de login. */
export default function AuthLayout() {
  const { user } = useAuth();

  if (user) return <Redirect href="/inicio" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
