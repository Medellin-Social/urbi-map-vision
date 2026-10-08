// Medellín Social design tokens: the one source for colors and fonts.
// Colombia flag (yellow, blue, red) + Antioquia green + ink black on warm paper.
export const K = {
  // brand
  amarillo: "#FCD116",
  azul: "#003893",
  azulMid: "#1F5BC6",
  azulLight: "#E6ECF7",
  rojo: "#CE1126",
  coral: "#CE1126",
  coralLight: "#FCE8EA",
  teal: "#0F8A4F",
  tealMid: "#0C7343",
  tealDeep: "#0A5C36",
  tealLight: "#E7F4EC",
  green: "#25D366", // WhatsApp only
  amber: "#8A6A00",
  dorado: "#FCD116",
  fucsia: "#CE1126",
  // neutrals
  ink: "#111418",
  paper: "#FAF8F3",
  surface: "#F3F0E8",
  faint: "#F3F0E8",
  line: "#E5E0D5",
  muted: "#5B5F5C",
  tertiary: "#6E726E",
  // type
  serif: "'Fraunces', Georgia, serif",
  lora: "'Fraunces', Georgia, serif",
  sans: "'Inter', system-ui, sans-serif",
  manrope: "'Inter', system-ui, sans-serif",
} as const;

export type Tokens = typeof K;
