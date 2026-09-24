import { Feather } from '@expo/vector-icons';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  /** Preenche o campo com uma pergunta pronta. */
  onPerguntar: (pergunta: string) => void;
  desabilitado?: boolean;
};

type Acao = {
  chave: string;
  rotulo: string;
  icone: keyof typeof Feather.glyphMap;
  cor: string;
  pergunta: string;
};

const ACOES: Acao[] = [
  {
    chave: 'remedios',
    rotulo: 'Meus remédios',
    icone: 'thermometer',
    cor: colors.quickMeds,
    pergunta: 'Quais remédios estão cadastrados e quando é a próxima dose?',
  },
  {
    chave: 'sintomas',
    rotulo: 'Sintomas',
    icone: 'activity',
    cor: colors.quickSymptoms,
    pergunta: 'Quero falar sobre um sintoma que apareceu. O que você precisa saber para me ajudar?',
  },
  {
    chave: 'consultas',
    rotulo: 'Consultas',
    icone: 'calendar',
    cor: colors.quickAppointments,
    pergunta: 'Quando é a próxima consulta e com quem?',
  },
];

/**
 * Os quatro cartoes do mockup.
 *
 * EMERGENCIA NAO E PERGUNTA. Ela nao manda nada para o modelo: abre o aviso do
 * 192 na hora, sem rede e sem espera. E o unico caminho do aplicativo em que
 * latencia e disponibilidade nao podem falhar — um modelo fora do ar, ou
 * demorando tres segundos, seria inaceitavel aqui.
 *
 * O texto de sistema tambem reconhece emergencia descrita em palavras, mas
 * isso e a segunda linha de defesa, nunca a primeira.
 *
 * "Sintomas" VOLTOU ao rotulo do mockup. Eu o tinha trocado por "Doses de
 * hoje" enquanto o assistente recusava interpretar sintoma — um botao que
 * convida exatamente a pergunta que vai ser recusada e uma armadilha. Com o
 * escopo aberto, o botao passou a valer o que promete.
 *
 * A pergunta dele nao descreve sintoma nenhum: ABRE a conversa. Estes cartoes
 * enviam na hora, e mandar "tenho febre" sem a pessoa ter dito isso poria
 * palavras na boca dela.
 */
export function QuickActions({ onPerguntar, desabilitado = false }: Props) {
  function emergencia() {
    Alert.alert(
      'Emergência',
      'Em caso de risco — falta de ar, convulsão, desmaio, sangramento intenso ou bebê que não acorda — ligue para o SAMU agora.',
      [
        { text: 'Fechar', style: 'cancel' },
        { text: 'Ligar 192', onPress: () => void Linking.openURL('tel:192') },
      ],
    );
  }

  return (
    <View>
      <Text style={styles.titulo} accessibilityRole="header">
        Ações rápidas
      </Text>

      <View style={styles.grade}>
        {ACOES.map((a) => (
          <Pressable
            key={a.chave}
            onPress={() => onPerguntar(a.pergunta)}
            disabled={desabilitado}
            accessibilityRole="button"
            accessibilityLabel={a.rotulo}
            style={({ pressed }) => [styles.cartao, pressed && styles.pressionado]}
          >
            <View style={[styles.circulo, { backgroundColor: a.cor }]}>
              <Feather name={a.icone} size={22} color={colors.onAccent} />
            </View>
            <Text style={styles.rotulo} numberOfLines={2}>
              {a.rotulo}
            </Text>
          </Pressable>
        ))}

        <Pressable
          onPress={emergencia}
          accessibilityRole="button"
          accessibilityLabel="Emergência. Mostra o número do SAMU."
          style={({ pressed }) => [styles.cartao, pressed && styles.pressionado]}
        >
          <View style={[styles.circulo, { backgroundColor: colors.quickEmergency }]}>
            <Feather name="plus" size={24} color={colors.onAccent} />
          </View>
          <Text style={styles.rotulo} numberOfLines={2}>
            Emergência
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: {
    fontFamily: fonts.bold,
    fontSize: 19,
    color: colors.sectionTitle,
    marginBottom: spacing.md,
  },
  grade: { flexDirection: 'row', gap: spacing.sm },
  cartao: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.card - 10,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  pressionado: { opacity: 0.8 },
  circulo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  rotulo: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.sectionTitle,
    textAlign: 'center',
  },
});
