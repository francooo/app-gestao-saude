import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';

/** Rota raiz: so decide para onde mandar o usuario. */
export default function Index() {
  const { user } = useAuth();
  return <Redirect href={user ? '/inicio' : '/login'} />;
}
