import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useAvisos } from '@/lib/avisosContext';
import { colors, radii } from '@/theme';

type Props = { style?: ViewStyle };

/**
 * O sino, com o ponto que diz a verdade.
 *
 * Saiu de dentro do ScreenHeader porque a tela Inicio precisa dele e NAO usa
 * ScreenHeader — ela tem uma faixa ilustrada. As alternativas eram um
 * cabecalho com titulo fantasma (o titulo do ScreenHeader e sempre
 * centralizado) ou duplicar vinte linhas de estilo. Extrair nao custa nada e
 * resolve os dois lugares.
 *
 * O ponto vem do provider, e antes estava FIXO NO CODIGO em cinco telas:
 * `hasNotifications` sem condicao nenhuma, sempre aceso. Um ponto que nunca
 * apaga ensina a ignorar o ponto.
 */
export function BotaoDeSino({ style }: Props) {
  const router = useRouter();
  const { temNaoLido } = useAvisos();

  return (
    <Pressable
      onPress={() => router.push('/notificacoes')}
      accessibilityRole="button"
      accessibilityLabel={temNaoLido ? 'Notificações, há novidades' : 'Notificações'}
      style={[styles.botao, style]}
    >
      <Feather name="bell" size={20} color={colors.sectionTitle} />
      {temNaoLido ? <View style={styles.ponto} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  botao: {
    width: 48,
    height: 48,
    borderRadius: radii.card - 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ponto: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
