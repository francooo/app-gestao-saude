import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthContext';
import { GlassCard } from '@/components/GlassCard';
import { IllustrationRegion } from '@/components/IllustrationRegion';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, spacing, typography } from '@/theme';

/**
 * Placeholder pos-login. Existe para provar o fluxo ponta a ponta e para dar
 * um lugar de onde sair. O app de verdade comeca aqui.
 */
export default function InicioScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const firstName = user?.fullName?.split(' ')[0] ?? 'mamãe';

  return (
    <View style={styles.screen}>
      <View style={[styles.cardArea, { paddingTop: insets.top + spacing.lg }]}>
        <GlassCard>
          <Text style={styles.title} accessibilityRole="header">
            Olá, {firstName}
          </Text>
          <Text style={styles.subtitle}>
            Login concluído. As telas do app entram a partir daqui.
          </Text>
          <PrimaryButton title="Sair" onPress={signOut} style={styles.button} />
        </GlassCard>
      </View>

      <IllustrationRegion />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sage },
  cardArea: { paddingHorizontal: spacing.xl },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.input,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  button: { marginTop: spacing.xl },
});
