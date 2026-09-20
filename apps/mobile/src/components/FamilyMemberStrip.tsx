import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { colors, fonts, spacing } from '@/theme';

export type FamilyMember = {
  id: string;
  nome: string;
  /** Opcional: com dados reais a cor sai do nome. Ver Avatar. */
  cor?: string;
};

type Props = {
  membros: FamilyMember[];
  selecionadoId?: string;
  onSelecionar: (id: string) => void;
  onAdicionar: () => void;
};

const AVATAR = 52;

export function FamilyMemberStrip({
  membros,
  selecionadoId,
  onSelecionar,
  onAdicionar,
}: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.titulo} accessibilityRole="header">
        Membros da família
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.lista}
      >
        {membros.map((membro) => {
          const selecionado = membro.id === selecionadoId;
          return (
            <Pressable
              key={membro.id}
              onPress={() => onSelecionar(membro.id)}
              style={styles.item}
              accessibilityRole="button"
              accessibilityState={{ selected: selecionado }}
              accessibilityLabel={membro.nome}
            >
              <Avatar
                nome={membro.nome}
                color={membro.cor}
                size={AVATAR}
                selected={selecionado}
              />
              <Text
                style={[styles.nome, selecionado && styles.nomeSelecionado]}
                numberOfLines={1}
              >
                {/* So o primeiro nome cabe sob o avatar. */}
                {membro.nome.split(' ')[0]}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={onAdicionar}
          style={styles.item}
          accessibilityRole="button"
          accessibilityLabel="Adicionar membro da família"
        >
          <View style={styles.adicionar}>
            <Feather name="plus" size={26} color={colors.accentGreen} />
          </View>
          <Text style={styles.nome} numberOfLines={1}>
            Adicionar
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingBottom: spacing.xl,
  },
  titulo: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.sectionTitle,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  lista: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  item: {
    alignItems: 'center',
    width: 72,
  },
  adicionar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  nomeSelecionado: {
    fontFamily: fonts.bold,
    color: colors.accentGreen,
  },
});
