import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/theme';

type Props = {
  title: string;
  /** Sem onVerTodos, o link nao aparece — util quando a lista esta vazia. */
  onVerTodos?: () => void;
};

export function SectionHeader({ title, onVerTodos }: Props) {
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
          accessibilityLabel={`Ver todos: ${title}`}
          style={styles.link}
        >
          <Text style={styles.linkTexto}>Ver todos</Text>
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
  linkTexto: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.accentGreen,
    marginRight: 2,
  },
});
