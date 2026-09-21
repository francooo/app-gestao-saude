/**
 * Tokens de design extraidos pixel a pixel dos assets originais
 * (assets-source/login-screen-mother-baby.png e mother-baby-splash-primary.png,
 * ambos 1440x2560).
 */

export const colors = {
  /** Verde sage do fundo, faixa superior da ilustracao. */
  sage: '#7F8E5C',
  /** Verde sage da base — o fundo tem um leve degrade vertical. */
  sageDeep: '#8A9564',

  /** Card translucido. Sobre o sage resulta em ~#DFDDC6, como no mockup. */
  cardFill: 'rgba(245, 243, 230, 0.78)',
  /** Borda sutil que destaca o card do fundo. */
  cardBorder: 'rgba(255, 255, 255, 0.35)',

  /** Pilula dos campos de texto. Sobre o card resulta em ~#F1EEDB. */
  inputFill: 'rgba(255, 253, 245, 0.88)',
  inputBorder: 'rgba(255, 255, 255, 0.55)',
  /** Borda quando o campo esta em foco. */
  inputBorderFocused: '#B78842',
  /** Borda quando o campo tem erro de validacao. */
  inputBorderError: '#9E4B36',

  /** Titulo "Bem-vinda" e labels dos campos. */
  textPrimary: '#39432C',
  textSecondary: '#5A6449',
  textPlaceholder: '#878F78',
  textError: '#8C3A28',

  /** Link "Esqueci minha senha". */
  link: '#52613C',

  /** Botao "Entrar". */
  accent: '#B78842',
  accentPressed: '#9E7436',
  accentDisabled: '#B78842A0',
  onAccent: '#FFFFFF',

  // -------------------------------------------------------------------------
  // Tela inicial (home-screen-warm-family.png)
  //
  // A area logada e um ambiente mais claro e quente que as telas de
  // autenticacao. Estes tokens SE SOMAM aos de cima, nao os substituem:
  // login, cadastro e recuperacao continuam usando sage/cardFill.
  // -------------------------------------------------------------------------

  /** Fundo da area logada — degrade vertical suave. */
  homeBackgroundTop: '#99A270',
  homeBackgroundBottom: '#A5AD7C',

  /** Cards da home: creme SOLIDO, ao contrario do cardFill translucido. */
  surface: '#F8F3DE',
  /** Variante quente, usada no icone do medicamento. */
  surfaceWarm: '#F4E2BE',

  /** Verde de destaque: aba ativa, contorno do membro selecionado. */
  accentGreen: '#1E603E',
  /** Verde mais claro: botao de enviar do assistente. */
  accentGreenSoft: '#3E765B',

  /** Titulos de secao ("Medicamentos de hoje"). */
  sectionTitle: '#2E4D30',

  /** Gradiente do card do Assistente, da esquerda para a direita. */
  assistantGradientFrom: '#B77C32',
  assistantGradientTo: '#49623A',

  // --- Tela de Medicos (doctors-screen-family-health.png) ---
  /** Chip de especialidade selecionado. */
  chipActive: '#326F3C',
  /** Botao de acao no card do medico. */
  actionGreen: '#467C43',
  /** Estrelas da sua nota privada. */
  star: '#E8A62A',
  starEmpty: '#CBC9B2',

  /** Fundo da aba ativa na barra inferior. */
  tabActive: '#E5E6C8',
  /** Chip "Ver mais", mais claro que os demais. */
  chipMore: '#EFEBD6',
} as const;

/**
 * Paradas do gradiente de fundo, medidas na coluna x=8 de cada mockup —
 * longe de cards e de folhas.
 *
 * O fundo importa mais do que parece: uma tela com todos os componentes
 * certos sobre o gradiente errado nao se parece com a referencia. O da
 * home e bem mais escuro e clareia mais tarde que o de medicos.
 */
export const backgrounds = {
  doctors: ['#B3B87B', '#DAD9AE', '#E1DEB8'] as const,
  home: ['#96A06A', '#ABAE78', '#E2DDB9'] as const,
} as const;

/**
 * Cores dos avatares.
 *
 * A escolha e deterministica a partir do nome (ver pickAvatarColor), para a
 * mesma pessoa aparecer sempre com a mesma cor em qualquer tela. Sortear por
 * indice de lista faria a cor mudar quando alguem fosse adicionado ou removido.
 */
export const avatarColors = ['#3E765B', '#D19628', '#6A774B', '#BF6A4F'] as const;

export function pickAvatarColor(nome: string): string {
  let soma = 0;
  for (let i = 0; i < nome.length; i += 1) soma += nome.charCodeAt(i);
  return avatarColors[soma % avatarColors.length]!;
}

/** Iniciais exibidas no avatar: primeira letra do primeiro e do ultimo nome. */
export function initialsFor(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase();
}

export const radii = {
  card: 28,
  /** Campos e botao sao totalmente arredondados. */
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const sizes = {
  /** 56 e o piso de acessibilidade para alvo de toque; o mockup e um poster,
   *  os 25pt literais dele seriam inutilizaveis num aparelho. */
  inputHeight: 56,
  buttonHeight: 58,
  iconSize: 20,
  /** Impede o card de esticar em tablet. */
  cardMaxWidth: 420,
} as const;

/**
 * A fonte do mockup e uma sans geometrica arredondada com 'a' de dois andares —
 * compativel com Nunito. Confirme com quem produziu a arte se houver duvida.
 */
export const fonts = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
} as const;

export const typography = {
  title: { fontFamily: fonts.extrabold, fontSize: 30, letterSpacing: -0.3 },
  /** Linha de apoio sob o titulo, como em "Preencha os dados para comecar." */
  subtitle: { fontFamily: fonts.regular, fontSize: 15 },
  label: { fontFamily: fonts.bold, fontSize: 15 },
  /** Precisa ser >= 16: abaixo disso o iOS da zoom ao focar o campo. */
  input: { fontFamily: fonts.regular, fontSize: 16 },
  /** 18 em negrito conta como "texto grande" no WCAG, onde o contraste
   *  minimo cai de 4.5:1 para 3:1 — que e onde o ambar do mockup fica. */
  button: { fontFamily: fonts.bold, fontSize: 18 },
  link: { fontFamily: fonts.bold, fontSize: 14 },
  error: { fontFamily: fonts.semibold, fontSize: 13 },
} as const;

export type Colors = typeof colors;

/**
 * Fracao da altura do asset de fundo ocupada pela faixa de verde chapado no
 * topo (medida: a ilustracao so comeca em y=720 de 2560). E o que permite
 * ancorar a imagem embaixo e deixar o recorte comer sempre o vazio, nunca o
 * rosto da mae.
 */
export const BG_FLAT_TOP_RATIO = 0.281;
