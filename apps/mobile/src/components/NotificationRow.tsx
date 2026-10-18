import { Feather } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconTile } from '@/components/IconTile';
import { colors, fonts, radii, spacing } from '@/theme';
import type { NomeIcone } from '@/components/Icone';

type Props = {
  ladrilho: { icone: NomeIcone; fundo: string; traco: string };
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
 * Cada aviso e o PROPRIO cartao, separado do seguinte por espaco, como o
 * pacote final desenha. Antes era uma linha dentro de um SettingsGroup com
 * filetes; aviso e coisa a ser lida um por um, nao uma lista de ajustes, e o
 * cartao solto da peso a cada um. O ladrilho cresceu para 56 pelo mesmo
 * motivo.
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
      style={({ pressed }) => [styles.cartao, pressed && onPress && styles.pressionada]}
    >
      <IconTile size={56} {...ladrilho} />

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
        <Feather
          name="chevron-right"
          size={20}
          color={colors.textSecondary}
          style={styles.seta}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cartao: {
    flexDirection: 'row',
    // flex-start, como no SettingsRow: com fonte grande do sistema o titulo
    // vira tres linhas e um ladrilho centralizado flutuaria no meio do texto.
    alignItems: 'flex-start',
    // Translucido como o SurfaceCard, e pelo mesmo motivo sem `elevation` no
    // Android: com fundo translucido a sombra aparece manchada DENTRO do card.
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 88,
    ...Platform.select({
      android: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
      default: {
        shadowColor: '#2C3520',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
    }),
  },
  pressionada: { opacity: 0.85 },
  textos: { flex: 1, marginLeft: spacing.lg, marginTop: 2 },
  // A seta fica na altura do meio do ladrilho, e nao colada no topo.
  seta: { marginTop: 18 },
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
