import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SurfaceCard } from '@/components/SurfaceCard';
import { UpdateCard } from '@/components/UpdateCard';
import { colors, fonts, spacing } from '@/theme';

export default function AjustesScreen() {
  const { user, signOut } = useAuth();

  return (
    <PlaceholderScreen
      icone="sliders"
      titulo="Ajustes"
      descricao="Aqui ficarão seus dados, preferências de notificação e as configurações de privacidade da conta."
    >
      <SurfaceCard style={styles.conta}>
        <Text style={styles.rotulo}>Conectada como</Text>
        <Text style={styles.nome} numberOfLines={1}>
          {user?.fullName ?? 'Minha conta'}
        </Text>
        <Text style={styles.email} numberOfLines={1}>
          {user?.email}
        </Text>

        <View style={styles.separador} />

        <PrimaryButton title="Sair" onPress={signOut} />
      </SurfaceCard>

      <UpdateCard />
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  conta: { marginTop: spacing.lg },
  rotulo: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  nome: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.sectionTitle,
    marginTop: spacing.xs,
  },
  email: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  separador: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.textPlaceholder,
    opacity: 0.4,
    marginVertical: spacing.xl,
  },
});
