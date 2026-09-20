import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { colors, fonts, radii, spacing } from '@/theme';

export type SelectableProfile = {
  id: string;
  fullName: string;
  avatarColor?: string | null;
  relationship?: string | null;
};

type Props = {
  profiles: SelectableProfile[];
  /** null = todos da família. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

const TODOS = 'Todos da família';

export function ProfileSelector({ profiles, selectedId, onSelect }: Props) {
  const [aberto, setAberto] = useState(false);
  const selecionado = profiles.find((p) => p.id === selectedId) ?? null;
  const rotulo = selecionado?.fullName ?? TODOS;

  function escolher(id: string | null) {
    onSelect(id);
    setAberto(false);
  }

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel={`Filtrar por pessoa. Atual: ${rotulo}`}
        style={styles.barra}
      >
        {selecionado ? (
          <Avatar
            nome={selecionado.fullName}
            color={selecionado.avatarColor ?? undefined}
            size={46}
            selected
          />
        ) : (
          <View style={styles.todosIcone}>
            <Feather name="users" size={20} color={colors.accentGreen} />
          </View>
        )}

        <Text style={styles.nome} numberOfLines={1}>
          {selecionado ? selecionado.fullName.split(' ')[0] : TODOS}
        </Text>

        <Feather name="chevron-down" size={22} color={colors.sectionTitle} />
      </Pressable>

      <Modal
        visible={aberto}
        transparent
        animationType="fade"
        onRequestClose={() => setAberto(false)}
      >
        {/* Toque fora fecha: no Android o botao fisico ja faz isso, mas no
            iOS sem esta area nao haveria saida. */}
        <Pressable style={styles.fundo} onPress={() => setAberto(false)}>
          <Pressable style={styles.painel} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.painelTitulo}>Ver médicos de</Text>

            <ScrollView bounces={false}>
              <Opcao
                rotulo={TODOS}
                ativo={selectedId === null}
                onPress={() => escolher(null)}
              />
              {profiles.map((p) => (
                <Opcao
                  key={p.id}
                  rotulo={p.fullName}
                  detalhe={p.relationship ?? undefined}
                  cor={p.avatarColor ?? undefined}
                  ativo={p.id === selectedId}
                  onPress={() => escolher(p.id)}
                />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Opcao({
  rotulo,
  detalhe,
  cor,
  ativo,
  onPress,
}: {
  rotulo: string;
  detalhe?: string;
  cor?: string;
  ativo: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      style={[styles.opcao, ativo && styles.opcaoAtiva]}
    >
      {rotulo === TODOS ? (
        <View style={styles.todosIcone}>
          <Feather name="users" size={18} color={colors.accentGreen} />
        </View>
      ) : (
        <Avatar nome={rotulo} color={cor} size={40} />
      )}

      <View style={styles.opcaoTextos}>
        <Text style={styles.opcaoNome} numberOfLines={1}>
          {rotulo}
        </Text>
        {detalhe ? <Text style={styles.opcaoDetalhe}>{detalhe}</Text> : null}
      </View>

      {ativo ? <Feather name="check" size={20} color={colors.accentGreen} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingRight: spacing.lg,
  },
  todosIcone: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.sectionTitle,
    marginLeft: spacing.lg,
  },
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(30, 38, 22, 0.45)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  painel: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  painelTitulo: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    marginLeft: spacing.sm,
  },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.card - 8,
  },
  opcaoAtiva: {
    backgroundColor: colors.surfaceWarm,
  },
  opcaoTextos: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  opcaoNome: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.sectionTitle,
  },
  opcaoDetalhe: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
