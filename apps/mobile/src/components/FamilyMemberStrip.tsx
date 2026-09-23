import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { colors, fonts, spacing } from '@/theme';

export type FamilyMember = {
  id: string;
  nome: string;
  /** Opcional: sem ela o Avatar deriva a cor do nome. */
  cor?: string | null;
  foto?: string | null;
};

type Props = {
  membros: FamilyMember[];
  /** Abre a ficha da pessoa. */
  onAbrir: (id: string) => void;
  onAdicionar: () => void;
  /** Primeira carga: mostra circulos cinzas em vez de familia vazia. */
  carregando?: boolean;
};

/**
 * Primeiro nome, desambiguado quando repete.
 *
 * Dois "Lucas" na familia virariam dois circulos identicos. Nesse caso o
 * rotulo passa a "Lucas S." — o leitor de tela continua anunciando o nome
 * completo, que e o rotulo de acessibilidade.
 */
function rotuloCurto(membro: FamilyMember, todos: FamilyMember[]): string {
  const partes = membro.nome.trim().split(/\s+/);
  const primeiro = partes[0] ?? membro.nome;

  const repete = todos.some(
    (o) => o.id !== membro.id && (o.nome.trim().split(/\s+/)[0] ?? '') === primeiro,
  );
  if (!repete) return primeiro;

  const inicial = partes[1]?.charAt(0);
  return inicial ? `${primeiro} ${inicial}.` : primeiro;
}

const AVATAR = 52;

export function FamilyMemberStrip({
  membros,
  onAbrir,
  onAdicionar,
  carregando = false,
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
        {carregando
          ? // Esqueleto. Nunca renderizar "familia vazia": uma conta sempre tem
            // ao menos o titular, entao lista vazia e sempre erro de carga — e
            // quem ve a faixa so com o botao Adicionar conclui que a familia
            // sumiu e recadastra todo mundo.
            [0, 1, 2].map((i) => (
              <View key={i} style={styles.item}>
                <View style={styles.esqueleto} />
              </View>
            ))
          : membros.map((membro) => (
              <Pressable
                key={membro.id}
                onPress={() => onAbrir(membro.id)}
                style={styles.item}
                accessibilityRole="button"
                accessibilityLabel={`Abrir ficha de ${membro.nome}`}
              >
                <Avatar
                  nome={membro.nome}
                  color={membro.cor ?? undefined}
                  photo={membro.foto}
                  recyclingKey={membro.id}
                  size={AVATAR}
                />
                <Text style={styles.nome} numberOfLines={1}>
                  {rotuloCurto(membro, membros)}
                </Text>
              </Pressable>
            ))}

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
  esqueleto: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.starEmpty,
    opacity: 0.5,
  },
});
