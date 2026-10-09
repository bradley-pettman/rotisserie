export type Palette = {
  bg: string
  card: string
  raised: string
  line: string
  ink: string
  ink2: string
  ink3: string
  ring: string
  gold: string
  onGold: string
  accent: string
  chip: string
  chipInk: string
  danger: string
  shadow: string
  navBg: string
  scrim: string
}

export const light: Palette = {
  bg: '#FBF8F2',
  card: '#FFFFFF',
  raised: '#F3ECDF',
  line: '#EAE2D3',
  ink: '#2B1D12',
  ink2: '#6E5D4E',
  ink3: '#B9AC9C',
  ring: '#9C8A78',
  gold: '#F2AE2A',
  onGold: '#2B1D12',
  accent: '#94600A',
  chip: '#F1E8D6',
  chipInk: '#5A4636',
  danger: '#B3261E',
  shadow: 'rgba(74, 45, 20, 0.10)',
  navBg: 'rgba(251, 248, 242, 0.96)',
  scrim: 'rgba(43, 29, 18, 0.35)'
}

export const dark: Palette = {
  bg: '#1A1612',
  card: '#26201A',
  raised: '#2E271F',
  line: '#342C24',
  ink: '#F4EDE1',
  ink2: '#A8998A',
  ink3: '#5E5348',
  ring: '#8A7B6C',
  gold: '#F0B23C',
  onGold: '#1A1612',
  accent: '#F0B23C',
  chip: '#2E271F',
  chipInk: '#D6C9B8',
  danger: '#F2B8B5',
  shadow: 'rgba(0, 0, 0, 0.40)',
  navBg: 'rgba(26, 22, 18, 0.96)',
  scrim: 'rgba(0, 0, 0, 0.55)'
}

export const fonts = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  extrabold: 'Figtree_800ExtraBold'
} as const

export const type = {
  title: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  dish: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26 },
  heading: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  section: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  captionStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.4 }
} as const

export const radius = { sm: 9, md: 12, lg: 16, pill: 999 } as const
