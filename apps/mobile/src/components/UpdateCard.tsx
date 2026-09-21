import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { SurfaceCard } from '@/components/SurfaceCard';
import { colors, fonts, radii, spacing } from '@/theme';

/**
 * Qual versao esta rodando, e um botao para buscar atualizacao agora.
 *
 * Existe porque a pergunta "a atualizacao chegou?" era impossivel de
 * responder: o aplicativo nao dizia sua versao, entao so restava adivinhar
 * entre "o pacote nao subiu", "o aparelho tem um APK antigo" e "o aplicativo
 * nao foi realmente fechado".
 *
 * O botao tambem elimina a danca dos dois reinicios. Por padrao o
 * expo-updates abre pelo cache e baixa o novo em segundo plano, aplicando so
 * na abertura SEGUINTE — e "fechar" no Android quase sempre e apenas mandar
 * para segundo plano, o que nem dispara a verificacao.
 */
export function UpdateCard() {
  const [verificando, setVerificando] = useState(false);

  const versao = Constants.expoConfig?.version ?? '—';
  const origem = Updates.isEmbeddedLaunch ? 'do APK instalado' : 'atualização baixada';

  async function buscar() {
    if (!Updates.isEnabled) {
      Alert.alert(
        'Atualização indisponível',
        'Esta versão do aplicativo não recebe atualizações pela internet.',
      );
      return;
    }

    setVerificando(true);
    try {
      const r = await Updates.checkForUpdateAsync();
      if (!r.isAvailable) {
        Alert.alert('Tudo em dia', 'Você já está com a versão mais recente.');
        return;
      }

      await Updates.fetchUpdateAsync();
      Alert.alert('Atualização pronta', 'O aplicativo vai reiniciar para aplicar.', [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Reiniciar', onPress: () => void Updates.reloadAsync() },
      ]);
    } catch {
      // Sem internet, ou o servidor de atualizacao fora do ar. Nenhum dos dois
      // deve parecer um defeito do aplicativo.
      Alert.alert(
        'Não consegui verificar',
        'Confira sua conexão e tente de novo em alguns instantes.',
      );
    } finally {
      setVerificando(false);
    }
  }

  return (
    <SurfaceCard style={styles.card}>
      <Text style={styles.rotulo}>Versão</Text>
      <Text style={styles.versao}>{versao}</Text>
      <Text style={styles.detalhe}>
        Rodando {origem}
        {Updates.runtimeVersion ? ` · base ${Updates.runtimeVersion}` : ''}
      </Text>

      {/* O id da atualizacao e o que permite conferir, daqui, se o aparelho
          esta mesmo no pacote que foi publicado. */}
      {Updates.updateId ? (
        <Text style={styles.id} selectable numberOfLines={1}>
          {Updates.updateId}
        </Text>
      ) : null}

      <Pressable
        onPress={() => void buscar()}
        disabled={verificando}
        accessibilityRole="button"
        accessibilityLabel="Buscar atualização agora"
        style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
      >
        {verificando ? (
          <ActivityIndicator size="small" color={colors.accentGreen} />
        ) : (
          <>
            <Feather name="download" size={18} color={colors.accentGreen} />
            <Text style={styles.botaoTexto}>Buscar atualização</Text>
          </>
        )}
      </Pressable>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.lg },
  rotulo: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  versao: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.sectionTitle,
    marginTop: spacing.xs,
  },
  detalhe: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  id: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textPlaceholder,
    marginTop: spacing.xs,
  },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
    minHeight: 48,
  },
  pressionado: { opacity: 0.7 },
  botaoTexto: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.accentGreen,
  },
});
