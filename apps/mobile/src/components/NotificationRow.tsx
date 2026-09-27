import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconTile } from '@/components/IconTile';
import { colors, fonts, spacing } from '@/theme';

type Props = {
  ladrilho: { icone: keyof typeof Feather.glyphMap; fundo: string; traco: string };
  titulo: string;
  subtitulo: string;
  /** "Agora", "Há 2 horas", "Ontem". */
  quando: string;
  naoLido: boolean;
  /** Ausente deixa a linha inerte: sem seta, sem toque. */
  onPress?: () => void;
};

/**
 * Um aviso na lista.
 *
 * Componente proprio, e nao duas props no SettingsRow: falta-lhe a terceira
 * linha (relogio + "Há 2 horas") e o ponto de nao-lido. E o ponto nao e
 * decoracao — e o que distingue esta lista de uma lista de ajustes, e um
 * componente de AJUSTES nao tem por que conhecer o conceito de notificacao.
 *
 * As medidas sao COPIADAS do SettingsRow de proposito: as duas listas
 * aparecem no mesmo aplicativo e precisam ler como irmas, e o filete do
 * SettingsGroup ja assume a coluna de 44 px do ladrilho.
 */
export function NotificationRow({
  ladrilho,
  titulo,
  subtitulo,
  quando,
  naoLido,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessible
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${naoLido ? 'Não lida, ' : ''}${titulo}, ${subtitulo}, ${quando}`}
      style={({ pressed }) => [styles.linha, pressed && onPress && styles.pressionada]}
    >
      <IconTile size={44} {...ladrilho} />

      <View style={styles.textos}>
        <Text style={styles.titulo} numberOfLines={2}>
          {titulo}
        </Text>
        <Text style={styles.subtitulo} numberOfLines={2}>
          {subtitulo}
        </Text>
        <View style={styles.carimbo}>
          <Feather name="clock" size={13} color={colors.textSecondary} />
          <Text style={styles.carimboTexto}>{quando}</Text>
        </View>
      </View>

      {/*
        Ponto VERDE, nao ambar. Ambar significa "tem coisa para fazer" em todo
        o aplicativo — usa-lo em toda linha nao lida faria cinco itens
        parecerem cinco pendencias urgentes. Nao lido nao e pendente.
      */}
      {naoLido ? <View style={styles.ponto} /> : null}

      {onPress ? (
        <Feather name="chevron-right" size={20} color={colors.textSecondary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    // flex-start, como no SettingsRow: com fonte grande do sistema o titulo
    // vira tres linhas e um ladrilho centralizado flutuaria no meio do texto.
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 68,
  },
  pressionada: { backgroundColor: 'rgba(90, 100, 73, 0.06)' },
  textos: { flex: 1, marginLeft: spacing.md, marginTop: 2 },
  titulo: { fontFamily: fonts.bold, fontSize: 15, color: colors.sectionTitle },
  subtitulo: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },
  carimbo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  carimboTexto: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  ponto: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.doseTaken,
    marginTop: 6,
    marginRight: spacing.sm,
  },
});
