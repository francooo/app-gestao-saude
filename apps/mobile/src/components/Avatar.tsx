import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fonts, initialsFor, pickAvatarColor } from '@/theme';

type Props = {
  nome: string;
  size?: number;
  /**
   * Sobrescreve a cor derivada do nome.
   *
   * Existe para os dados de demonstracao reproduzirem as cores do mockup.
   * Com dados reais, deixe em branco: a cor sai do nome e fica estavel entre
   * telas, sem precisar guardar nada no banco.
   */
  color?: string;
  /** Anel em volta, usado no membro da familia selecionado. */
  selected?: boolean;
  style?: ViewStyle;
};

export function Avatar({ nome, size = 52, color, selected = false, style }: Props) {
  const fundo = color ?? pickAvatarColor(nome);
  const iniciais = initialsFor(nome);

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: fundo,
        },
        selected && styles.selected,
        style,
      ]}
      // O leitor de tela le o nome; as iniciais sozinhas nao diriam nada.
      accessibilityLabel={nome}
    >
      <Text
        style={[styles.iniciais, { fontSize: size * 0.36 }]}
        allowFontScaling={false}
        numberOfLines={1}
      >
        {iniciais}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    borderWidth: 3,
    borderColor: colors.accentGreen,
  },
  iniciais: {
    fontFamily: fonts.bold,
    color: colors.onAccent,
    // As iniciais sao curtas e centradas; desligar o ajuste automatico evita
    // que uma fonte grande do sistema estoure o circulo.
    includeFontPadding: false,
  },
});
