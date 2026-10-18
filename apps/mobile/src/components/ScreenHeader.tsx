import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BotaoDeSino } from '@/components/BotaoDeSino';
import { Icone, type NomeIcone } from '@/components/Icone';
import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  title: string;
  /** Sem onBack o botao de voltar nao aparece — caso das abas principais. */
  onBack?: () => void;
  /**
   * Mostra o sino, que abre a tela de Notificacoes.
   *
   * Substituiu o par `onNotifications` + `hasNotifications`: o destino e
   * sempre o mesmo, e o ponto vem do provider em vez de ser passado tela a
   * tela — antes ele era fixo no codigo em cinco lugares, sempre aceso.
   */
  mostrarSino?: boolean;
  /**
   * Quantas linhas o titulo pode ocupar. Padrao 1.
   *
   * "Detalhes do medicamento" nao cabe numa linha: em 27 pt ele mede mais que
   * a coluna central num aparelho de 320 pt e era cortado com reticencias. Em
   * duas linhas, a 25 pt, cabe em qualquer tela — e e assim que o mockup
   * desenha. O bloco mais alto continua centralizado em relacao aos botoes.
   */
  titleLines?: 1 | 2;
  /**
   * Onde fica o titulo. Padrao centro. "esquerda" cola o titulo no botao de
   * voltar, como o pacote final desenha o detalhe do remedio e os Ajustes.
   */
  alinhamento?: 'centro' | 'esquerda';
  /** Icone antes do titulo (so no alinhamento a esquerda, ex.: Assistente). */
  icone?: NomeIcone;
};

export function ScreenHeader({
  title,
  onBack,
  mostrarSino = false,
  titleLines = 1,
  alinhamento = 'centro',
  icone,
}: Props) {
  const esquerda = alinhamento === 'esquerda';
  return (
    <View style={styles.linha}>
      <View style={[styles.lado, esquerda && !onBack && styles.ladoVazio]}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            style={styles.botao}
          >
            <Feather name="chevron-left" size={24} color={colors.sectionTitle} />
          </Pressable>
        ) : null}
      </View>

      {esquerda && icone ? (
        <View style={styles.iconeTitulo}>
          <Icone nome={icone} size={26} color={colors.accentGreen} />
        </View>
      ) : null}
      <Text
        style={[
          styles.titulo,
          titleLines === 2 && styles.tituloDuasLinhas,
          esquerda && styles.tituloEsquerda,
        ]}
        accessibilityRole="header"
        numberOfLines={titleLines}
      >
        {title}
      </Text>

      <View style={[styles.lado, styles.ladoDireito]}>
        {mostrarSino ? <BotaoDeSino /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Laterais de largura fixa mantem o titulo centralizado mesmo quando so um
  // dos lados tem botao.
  lado: {
    width: 48,
  },
  // Sem voltar e com titulo a esquerda, a lateral vazia so empurraria o texto.
  ladoVazio: { width: 0 },
  iconeTitulo: { marginLeft: spacing.xs },
  tituloEsquerda: { textAlign: 'left', paddingLeft: spacing.md },
  ladoDireito: {
    alignItems: 'flex-end',
  },
  botao: {
    width: 48,
    height: 48,
    borderRadius: radii.card - 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.extrabold,
    fontSize: 27,
    letterSpacing: -0.3,
    color: colors.sectionTitle,
    paddingHorizontal: spacing.sm,
  },
  tituloDuasLinhas: {
    fontSize: 25,
    lineHeight: 29,
  },
});
