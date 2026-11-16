import z from 'zod'

export const GrocerySection = z.enum([
  'produce',
  'meat_seafood',
  'dairy_eggs',
  'bakery',
  'pantry',
  'frozen',
  'drinks',
  'household',
  'personal_care',
  'baby_kids',
  'pet',
  'other'
])

export type GrocerySection = z.infer<typeof GrocerySection>

export const SECTION_LABELS: Record<GrocerySection, string> = {
  produce: 'Produce',
  meat_seafood: 'Meat & seafood',
  dairy_eggs: 'Dairy & eggs',
  bakery: 'Bakery',
  pantry: 'Pantry',
  frozen: 'Frozen',
  drinks: 'Drinks',
  household: 'Household',
  personal_care: 'Personal care',
  baby_kids: 'Baby & kids',
  pet: 'Pet',
  other: 'Other'
}
