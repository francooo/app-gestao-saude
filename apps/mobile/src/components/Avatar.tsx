import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
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
  /**
   * Foto como data URI JPEG. Ausente ou nula, ficam as iniciais.
   */
  photo?: string | null;
  /**
   * Identidade do dono da foto.
   *
   * Em lista reciclada (FlatList), sem isto a foto do item anterior aparece
   * por um frame no item novo.
   */
  recyclingKey?: string;
  /** Anel em volta, usado no membro da familia selecionado. */
  selected?: boolean;
  style?: ViewStyle;
};

export function Avatar({
  nome,
  size = 52,
  color,
  photo,
  recyclingKey,
  selected = false,
  style,
}: Props) {
  const fundo = color ?? pickAvatarColor(nome);
  const iniciais = initialsFor(nome);

  // Base64 corrompido faz o expo-image renderizar nada. Sem este estado o
  // resultado seria um circulo vazio; com ele, volta para as iniciais.
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [photo]);

  const mostrarFoto = !!photo && !falhou;

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
      // O leitor de tela le o nome; as iniciais sozinhas nao diriam nada, e
      // anunciar "imagem de" quando ha foto tambem nao acrescenta.
      accessibilityLabel={nome}
    >
      {/*
        As iniciais ficam SEMPRE desenhadas, e a foto entra por cima. Assim o
        estado degradado — foto quebrada, ainda carregando — e as iniciais, e
        nunca um buraco.
      */}
      <Text
        style={[styles.iniciais, { fontSize: size * 0.36 }]}
        allowFontScaling={false}
        numberOfLines={1}
      >
        {iniciais}
      </Text>

      {mostrarFoto ? (
        <Image
          source={{ uri: photo }}
          // O data URI ja veio no JSON da listagem: guardar em disco seria
          // duplicar bytes que a proxima resposta traz de novo.
          cachePolicy="memory"
          recyclingKey={recyclingKey}
          contentFit="cover"
          transition={0}
          onError={() => setFalhou(true)}
          // O borderRadius do pai nao recorta o filho no Android sem o
          // overflow do container; mesmo assim, arredondar aqui tambem evita
          // um canto duro aparecendo durante a transicao.
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
