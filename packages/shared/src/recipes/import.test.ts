import { describe, expect, it } from 'vitest'
import { extractRecipe, parseDuration } from './import'

function page(body: string): string {
  return `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`
}

function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`
}

const graphPage = page(
  jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: 'Sloppy Joes - Budget Bytes' },
      {
        '@type': 'Recipe',
        name: 'Sloppy Joes',
        recipeYield: ['5', '5 servings'],
        prepTime: 'PT10M',
        cookTime: 'PT20M',
        totalTime: 'PT30M',
        recipeIngredient: ['1 yellow onion ($0.32)', '1 Tbsp olive oil', '&frac12; cup ketchup', '  '],
        recipeInstructions: [
          { '@type': 'HowToStep', text: 'Dice the onion.' },
          { '@type': 'HowToStep', text: 'Brown the beef <em>well</em>.' }
        ]
      }
    ]
  })
)

describe('extractRecipe from JSON-LD', () => {
  it('reads a recipe nested in a @graph', () => {
    expect(extractRecipe(graphPage)).toEqual({
      name: 'Sloppy Joes',
      ingredients: ['1 yellow onion ($0.32)', '1 Tbsp olive oil', '½ cup ketchup'],
      steps: ['Dice the onion.', 'Brown the beef well.'],
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      servings: 5
    })
  })

  it('drops section headings from the ingredient list', () => {
    const html = page(
      jsonLd({
        '@type': 'Recipe',
        name: 'Tacos',
        recipeIngredient: ['For the sauce:', '1 cup ketchup', 'Toppings:', 'cilantro']
      })
    )
    expect(extractRecipe(html)?.ingredients).toEqual(['1 cup ketchup', 'cilantro'])
  })

  it('accepts a type list, a bare object and a top-level array', () => {
    const typed = page(
      jsonLd({ '@type': ['Recipe', 'NewsArticle'], name: 'Mac and Cheese', recipeIngredient: ['1 lb pasta'] })
    )
    const listed = page(
      jsonLd([{ '@type': 'Person' }, { '@type': 'Recipe', name: 'Tacos', recipeIngredient: ['2 lb beef'] }])
    )
    expect(extractRecipe(typed)?.name).toBe('Mac and Cheese')
    expect(extractRecipe(listed)?.name).toBe('Tacos')
  })

  it('flattens HowToSection groups into one list of steps', () => {
    const html = page(
      jsonLd({
        '@type': 'Recipe',
        name: 'Lasagne',
        recipeInstructions: [
          {
            '@type': 'HowToSection',
            name: 'Sauce',
            itemListElement: [{ '@type': 'HowToStep', text: 'Simmer the sauce.' }]
          },
          { '@type': 'HowToSection', name: 'Assembly', itemListElement: [{ '@type': 'HowToStep', text: 'Layer it up.' }] }
        ]
      })
    )
    expect(extractRecipe(html)?.steps).toEqual(['Simmer the sauce.', 'Layer it up.'])
  })

  it('splits one numbered string into steps', () => {
    const text = '1. Preheat the oven to 400 degrees F. 2. Melt the butter. Cook for 5 minutes. 3. Add 1.5 cups of stock.'
    const html = page(jsonLd({ '@type': 'Recipe', name: 'Pasta', recipeInstructions: [{ '@type': 'HowToStep', text }] }))
    expect(extractRecipe(html)?.steps).toEqual([
      'Preheat the oven to 400 degrees F.',
      'Melt the butter. Cook for 5 minutes.',
      'Add 1.5 cups of stock.'
    ])
  })

  it('tolerates a repeated number and keeps line breaks inside separate steps', () => {
    const repeated = '1. Preheat the oven. 2. Melt the butter. 2. Add the garlic. 3. Serve.'
    const html = page(
      jsonLd({ '@type': 'Recipe', name: 'Pasta', recipeInstructions: [{ '@type': 'HowToStep', text: repeated }] })
    )
    expect(extractRecipe(html)?.steps).toEqual(['Preheat the oven.', 'Melt the butter.', 'Add the garlic.', 'Serve.'])
    const bulleted = page(
      jsonLd({
        '@type': 'Recipe',
        name: 'Kit',
        recipeInstructions: [
          { '@type': 'HowToStep', text: '• Wash the produce.\n• Halve the potatoes.' },
          { '@type': 'HowToStep', text: 'Roast 20 minutes.' }
        ]
      })
    )
    expect(extractRecipe(html)?.steps.length).toBe(4)
    expect(extractRecipe(bulleted)?.steps).toEqual(['• Wash the produce. • Halve the potatoes.', 'Roast 20 minutes.'])
  })

  it('splits a plain string on list items or line breaks', () => {
    const list = page(jsonLd({ '@type': 'Recipe', name: 'A', recipeInstructions: '<ol><li>One</li><li>Two</li></ol>' }))
    const lines = page(jsonLd({ '@type': 'Recipe', name: 'B', recipeInstructions: 'One\n\nTwo' }))
    expect(extractRecipe(list)?.steps).toEqual(['One', 'Two'])
    expect(extractRecipe(lines)?.steps).toEqual(['One', 'Two'])
  })

  it('unwraps CDATA and skips a malformed block before a good one', () => {
    const html = page(
      `<script type='application/ld+json'>{not json</script>` +
        `<script type="application/ld+json">//<![CDATA[\n${JSON.stringify({
          '@type': 'Recipe',
          name: 'Soup',
          recipeIngredient: ['1 leek']
        })}\n//]]></script>`
    )
    expect(extractRecipe(html)?.name).toBe('Soup')
  })

  it('returns null when the page has no recipe', () => {
    expect(extractRecipe(page('<h1>About us</h1>'))).toBeNull()
    expect(extractRecipe(page(jsonLd({ '@type': 'Article', headline: 'Ten tips' })))).toBeNull()
  })

  it('prefers microdata when the JSON-LD recipe has no body', () => {
    const html = page(
      jsonLd({ '@type': 'Recipe', name: 'Video only' }) +
        `<div itemscope itemtype="http://schema.org/Recipe"><span itemprop="name">Chili</span>` +
        `<span itemprop="recipeIngredient">1 lb beef</span></div>`
    )
    expect(extractRecipe(html)).toMatchObject({ name: 'Chili', ingredients: ['1 lb beef'] })
  })
})

describe('extractRecipe from microdata', () => {
  const html = page(`
    <div itemscope itemtype="http://schema.org/Recipe">
      <span itemprop="author" itemscope itemtype="http://schema.org/Person"><span itemprop="name">Deb</span></span>
      <h1 itemprop="name">Tomato Sauce with Butter &amp; Onions</h1>
      <meta itemprop="recipeYield" content="Serves 4">
      <time itemprop="totalTime" datetime="PT45M">45 minutes</time>
      <ul>
        <li itemprop="recipeIngredient">28 ounces whole peeled tomatoes</li>
        <li itemprop="recipeIngredient">5 tablespoons <b>unsalted</b> butter</li>
      </ul>
      <ol itemprop="recipeInstructions"><li>Put everything in a pot.</li><li>Simmer 45 minutes.</li></ol>
    </div>`)

  it('reads the recipe scope and ignores nested scopes', () => {
    expect(extractRecipe(html)).toEqual({
      name: 'Tomato Sauce with Butter & Onions',
      ingredients: ['28 ounces whole peeled tomatoes', '5 tablespoons unsalted butter'],
      steps: ['Put everything in a pot.', 'Simmer 45 minutes.'],
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: 45,
      servings: 4
    })
  })

  it('returns what it finds when instructions are not marked up', () => {
    const partial = page(
      `<div itemscope itemtype="https://schema.org/Recipe"><span itemprop="name">Pierogi</span>` +
        `<span itemprop="recipeIngredient">1 tablespoon butter</span></div>`
    )
    expect(extractRecipe(partial)).toMatchObject({ name: 'Pierogi', ingredients: ['1 tablespoon butter'], steps: [] })
  })
})

describe('servings', () => {
  it.each([
    ['6–8 servings', 6],
    ['Serves 4', 4],
    ['Makes 24 cookies', 24],
    [2, 2],
    [['', '12 servings'], 12],
    ['a crowd', null]
  ])('reads %j as %j', (recipeYield, expected) => {
    const html = page(jsonLd({ '@type': 'Recipe', name: 'X', recipeYield, recipeIngredient: ['1 egg'] }))
    expect(extractRecipe(html)?.servings).toBe(expected)
  })
})

describe('parseDuration', () => {
  it.each([
    ['PT30M', 30],
    ['PT1H30M', 90],
    ['PT2H', 120],
    ['P0DT1H0M', 60],
    ['P1D', 1440],
    ['PT90S', 2],
    ['P0Y0M0DT0H20M0.000S', 20],
    ['PT0M', null],
    ['P', null],
    ['', null],
    ['15 minutes', 15],
    ['1 hr 30 min', 90],
    ['1 hour 15 minutes', 75],
    ['2 hours', 120],
    ['45 mins', 45],
    ['1 1/2 hours', 90],
    ['1h30', 90],
    ['about 20 minutes', 20],
    ['overnight', null]
  ])('parses %j as %j', (input, expected) => {
    expect(parseDuration(input)).toBe(expected)
  })
})
