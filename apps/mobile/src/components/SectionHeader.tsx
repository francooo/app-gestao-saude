import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/theme';

type Props = {
  title: string;
  /** Sem onVerTodos, o link nao aparece — util quando a lista esta vazia. */
  onVerTodos?: () => void;
  /** Texto do link. Padrao "Ver todos"; a tela de medicos usa "Mapa". */
  verTodosLabel?: string;
  /** Icone antes do texto do link. */
  verTodosIcon?: keyof typeof Feather.glyphMap;
};

export function SectionHeader({ title, onVerTodos, verTodosLabel, verTodosIcon }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>

      {onVerTodos ? (
        <Pressable
          onPress={onVerTodos}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`${verTodosLabel ?? 'Ver todos'}: ${title}`}
          style={styles.link}
        >
          {verTodosIcon ? (
            <Feather
              name={verTodosIcon}
              size={17}
              color={colors.accentGreen}
              style={styles.linkIcone}
            />
          ) : null}
          <Text style={styles.linkTexto}>{verTodosLabel ?? 'Ver todos'}</Text>
          <Feather name="chevron-right" size={18} color={colors.accentGreen} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    flexShrink: 1,
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.sectionTitle,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
  },
  linkIcone: { marginRight: spacing.xs },
  linkTexto: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.accentGreen,
    marginRight: 2,
  },
});
