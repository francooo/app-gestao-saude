/**
 * Os tokens vivem em packages/shared para poderem ser usados tambem por
 * ferramentas fora do app (geracao de assets, futuro painel web).
 * Este modulo so reexporta, para as telas importarem de "@/theme".
 */
export {
  colors,
  radii,
  spacing,
  sizes,
  typography,
  fonts,
  avatarColors,
  backgrounds,
  pickAvatarColor,
  initialsFor,
  BG_FLAT_TOP_RATIO,
} from '@gestao/shared';
