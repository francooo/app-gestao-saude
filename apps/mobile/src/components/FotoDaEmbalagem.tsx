import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { ImageViewerModal } from '@/components/ImageViewerModal';
import { colors, fonts, radii, spacing } from '@/theme';

type Props = {
  /** Data URI JPEG, ou null quando nao ha foto da caixa. */
  foto: string | null;
  /** Nome do remedio, para o leitor de tela saber de que caixa se trata. */
  doQue: string;
  /** Uniao e nao booleano: "Guardando" e "Removendo" sao textos diferentes. */
  ocupada?: 'enviando' | 'removendo' | null;
  onAdicionar: () => void;
  /** Abre o menu de trocar/remover. Quem monta o menu e a tela. */
  onOpcoes: () => void;
};

/**
 * A foto da embalagem, no rodape do cartao do topo do detalhe.
 *
 * FICA NUMA FAIXA DE LARGURA CHEIA, e nao no canto do cartao como o mockup
 * desenha. O motivo e medida, nao gosto: no canto mora o DoseButton, que e a
 * acao mais usada da tela, e qualquer miniatura ali derruba a coluna do nome
 * para 134 pt num aparelho de 360 — abaixo dos ~136 que "Monoidratada" exige
 * em Nunito ExtraBold 22. O mockup so fecha porque nao desenha aquele botao.
 *
 * Componente proprio para UM uso so, pelo mesmo criterio do PrescriptionCard,
 * que tambem tem um: seis estados, tratamento de falha de carga, veu de
 * ocupado, visualizador em tela cheia e reflow por fonte grande nao cabem
 * inline numa tela que ja passa de oitocentas linhas.
 */
export function FotoDaEmbalagem({
  foto,
  doQue,
  ocupada = null,
  onAdicionar,
  onOpcoes,
}: Props) {
  const [ampliada, setAmpliada] = useState(false);

  /**
   * Falha de carga, no padrao do Avatar — o unico componente desta base que
   * trata isso. Com uma diferenca deliberada: la o espaco reservado fica
   * SEMPRE desenhado por baixo, porque as iniciais sao informacao. Aqui o
   * ladrilho so aparece quando nao ha foto ou ela falhou, senao um icone de
   * camera piscaria por baixo de toda foto carregando.
   */
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [foto]);

  // Mesmo limiar e mesma fonte de verdade que o OpcaoDeFoto ja usa.
  const { fontScale } = useWindowDimensions();
  const empilhado = fontScale >= 1.3;

  const mostrarFoto = !!foto && !falhou;
  const inerte = ocupada !== null;

  const { titulo, ajuda } = textos(foto, falhou, ocupada);

  return (
    <View style={[styles.faixa, empilhado && styles.faixaEmpilhada]}>
      <Pressable
        onPress={() => {
          if (inerte) return;
          // Com a foto quebrada, ampliar so mostraria o mesmo defeito em
          // tela cheia. A faixa fica inerte e as acoes continuam no menu.
          if (mostrarFoto) setAmpliada(true);
          else if (!foto) onAdicionar();
        }}
        disabled={inerte || (!!foto && falhou)}
        accessible
        accessibilityRole={mostrarFoto ? 'imagebutton' : 'button'}
        accessibilityLabel={
          inerte ? titulo : mostrarFoto ? `Foto da caixinha de ${doQue}` : 'Adicionar foto da caixinha'
        }
        accessibilityHint={
          inerte
            ? undefined
            : mostrarFoto
              ? 'Toque duas vezes para ver em tela cheia'
              : 'Escolhe entre tirar uma foto e usar a galeria'
        }
        accessibilityState={{ disabled: inerte }}
        style={({ pressed }) => [styles.alvo, pressed && !inerte && styles.pressionado]}
      >
        <View style={styles.slot}>
          {mostrarFoto ? (
            <Image
              source={{ uri: foto }}
              contentFit="cover"
              transition={120}
              // O data URI ja vem no JSON do detalhe; gravar em disco
              // duplicaria os mesmos bytes. Mesma escolha do Avatar.
              cachePolicy="memory"
              onError={() => setFalhou(true)}
              style={styles.miniatura}
            />
          ) : (
            <Feather
              name={falhou ? 'image' : 'camera'}
              size={24}
              color={colors.pillTabletIcon}
            />
          )}

          {/* LUPA e nao camera: tocar aqui AMPLIA. Uma camera sobre uma foto
              que ja existe prometeria fotografar de novo. */}
          {mostrarFoto && !inerte ? (
            <View style={styles.lupa}>
              <Feather name="maximize-2" size={12} color={colors.onAccent} />
            </View>
          ) : null}

          {inerte ? (
            <View style={styles.veu}>
              <ActivityIndicator size="small" color={colors.accentGreen} />
            </View>
          ) : null}
        </View>

        <View style={[styles.textos, empilhado && styles.textosEmpilhados]}>
          <Text style={styles.titulo}>{titulo}</Text>
          <Text style={styles.ajuda}>{ajuda}</Text>
        </View>
      </Pressable>

      {inerte ? null : (
        <Pressable
          onPress={foto ? onOpcoes : onAdicionar}
          accessibilityRole="button"
          accessibilityLabel={foto ? 'Opções da foto da caixinha' : 'Adicionar foto da caixinha'}
          accessibilityHint={foto ? 'Trocar ou remover' : undefined}
          hitSlop={4}
          style={({ pressed }) => [
            styles.acao,
            empilhado && styles.acaoEmpilhada,
            pressed && styles.pressionado,
          ]}
        >
          <Feather
            name={foto ? 'more-horizontal' : 'plus-circle'}
            size={20}
            color={colors.accentGreen}
          />
          {empilhado ? (
            <Text style={styles.acaoTexto}>{foto ? 'Trocar ou remover' : 'Adicionar foto'}</Text>
          ) : null}
        </Pressable>
      )}

      <ImageViewerModal
        uri={foto ?? ''}
        visivel={ampliada && mostrarFoto}
        descricao={`Foto da caixinha de ${doQue}`}
        onClose={() => setAmpliada(false)}
      />
    </View>
  );
}

function textos(foto: string | null, falhou: boolean, ocupada: 'enviando' | 'removendo' | null) {
  if (ocupada === 'enviando') {
    return { titulo: 'Guardando a foto…', ajuda: 'Pode levar alguns segundos.' };
  }
  if (ocupada === 'removendo') {
    return { titulo: 'Removendo a foto…', ajuda: 'Pode levar alguns segundos.' };
  }
  if (foto && falhou) {
    return { titulo: 'Foto da caixinha', ajuda: 'Não consegui mostrar esta foto.' };
  }
  if (foto) return { titulo: 'Foto da caixinha', ajuda: 'Toque para ampliar.' };
  return {
    titulo: 'Adicionar foto da caixinha',
    ajuda: 'Ajuda a reconhecer o remédio na hora de tomar.',
  };
}

const styles = StyleSheet.create({
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  faixaEmpilhada: { flexDirection: 'column', alignItems: 'stretch' },
  alvo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pressionado: { opacity: 0.85 },

  slot: {
    // 54 e o degrau "destaque" que o IconTile ja documenta, e o raio sai do
    // mapa RAIO dele. Altura FIXA de proposito: e imagem, nao texto, e
    // imagem nao escala com a fonte do sistema.
    width: 54,
    height: 54,
    borderRadius: radii.card - 12,
    backgroundColor: colors.pillTablet,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  miniatura: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radii.card - 12,
  },
  lupa: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  veu: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card - 12,
    backgroundColor: colors.veil,
  },

  textos: { flex: 1 },
  textosEmpilhados: { marginTop: spacing.md },
  titulo: { fontFamily: fonts.bold, fontSize: 15, color: colors.sectionTitle },
  ajuda: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },

  acao: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  acaoEmpilhada: {
    width: 'auto',
    height: undefined,
    minHeight: 44,
    flexDirection: 'row',
    gap: spacing.sm,
    // Contornado, e nao ambar preenchido: aquele esta reservado para
    // "Adicionar prescricao", a acao primaria da outra secao. Guardar a foto
    // da caixa e opcional e nao vence prazo nenhum.
    borderWidth: 1.5,
    borderColor: colors.accentGreen,
    borderRadius: radii.pill,
    marginTop: spacing.md,
  },
  acaoTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accentGreen },
});
