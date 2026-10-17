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
  /** Quem esta filtrando a tela. null = a familia inteira. */
  selecionadoId: string | null;
  /** TOQUE: filtra a tela por essa pessoa (quem chama decide desmarcar). */
  onSelecionar: (id: string) => void;
  /** PRESSIONAR E SEGURAR: abre a ficha para editar. */
  onEditar: (id: string) => void;
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
  selecionadoId,
  onSelecionar,
  onEditar,
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
          : membros.map((membro) => {
              const ativo = membro.id === selecionadoId;
              return (
                <Pressable
                  key={membro.id}
                  onPress={() => onSelecionar(membro.id)}
                  // Editar e o gesto menos frequente, por isso o mais caro.
                  onLongPress={() => onEditar(membro.id)}
                  delayLongPress={400}
                  style={styles.item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                  accessibilityLabel={
                    ativo ? `Mostrando dados de ${membro.nome}` : `Mostrar dados de ${membro.nome}`
                  }
                  accessibilityHint="Toque duas vezes e segure para editar"
                  // Leitor de tela nao tem "segurar" confiavel: a edicao vira
                  // uma acao do menu de acessibilidade.
                  accessibilityActions={[{ name: 'editar', label: 'Editar membro' }]}
                  onAccessibilityAction={(e) => {
                    if (e.nativeEvent.actionName === 'editar') onEditar(membro.id);
                  }}
                >
                  <Avatar
                    nome={membro.nome}
                    color={membro.cor ?? undefined}
                    photo={membro.foto}
                    recyclingKey={membro.id}
                    size={AVATAR}
                    selected={ativo}
                  />
                  <Text style={[styles.nome, ativo && styles.nomeAtivo]} numberOfLines={1}>
                    {rotuloCurto(membro, membros)}
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
  nomeAtivo: {
    fontFamily: fonts.bold,
    color: colors.sectionTitle,
  },
  esqueleto: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.starEmpty,
    opacity: 0.5,
  },
});
