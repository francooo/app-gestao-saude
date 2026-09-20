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
} as const;

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
