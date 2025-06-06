import { Guide, GuideCategory, GuideTag } from '../models/guide.model';
import { IUser } from '../models/user.model';

// Sample categories
const sampleCategories = [
  {
    name: 'Brewing Methods',
    description: 'Learn different ways to brew the perfect cup of coffee',
    slug: 'brewing-methods',
    icon: '☕',
    order: 1,
    isActive: true,
  },
  {
    name: 'Coffee Origins',
    description: 'Explore coffee regions and their unique characteristics',
    slug: 'coffee-origins',
    icon: '🌍',
    order: 2,
    isActive: true,
  },
  {
    name: 'Equipment & Tools',
    description: 'Essential equipment for coffee brewing and preparation',
    slug: 'equipment-tools',
    icon: '⚙️',
    order: 3,
    isActive: true,
  },
  {
    name: 'Coffee Science',
    description: 'Understanding the science behind great coffee',
    slug: 'coffee-science',
    icon: '🔬',
    order: 4,
    isActive: true,
  },
];

// Sample tags
const sampleTags = [
  { name: 'Beginner', slug: 'beginner', color: '#22c55e', isActive: true },
  { name: 'Advanced', slug: 'advanced', color: '#ef4444', isActive: true },
  { name: 'Pour Over', slug: 'pour-over', color: '#3b82f6', isActive: true },
  { name: 'Espresso', slug: 'espresso', color: '#8b5cf6', isActive: true },
  { name: 'Cold Brew', slug: 'cold-brew', color: '#06b6d4', isActive: true },
  { name: 'French Press', slug: 'french-press', color: '#f59e0b', isActive: true },
  { name: 'Grind Size', slug: 'grind-size', color: '#84cc16', isActive: true },
  { name: 'Water Temperature', slug: 'water-temperature', color: '#f97316', isActive: true },
];

// Sample guides
const createSampleGuides = (categoryIds: any, tagIds: any, authorId: string) => [
  {
    title: 'Perfect Pour Over Coffee Guide',
    slug: 'perfect-pour-over-coffee-guide',
    description: 'Master the art of pour over coffee with this comprehensive step-by-step guide.',
    content: `
# Perfect Pour Over Coffee Guide

Pour over coffee is one of the most rewarding brewing methods, offering complete control over every variable in the brewing process. This guide will walk you through creating the perfect cup.

## What You'll Need

- Pour over dripper (V60, Chemex, or similar)
- Paper filters
- Gooseneck kettle
- Coffee grinder
- Digital scale
- Timer
- Fresh coffee beans (medium grind)

## The Process

Pour over brewing is all about precision and timing. The key is to maintain consistent water temperature, grind size, and pouring technique.

## Tips for Success

- Use a 1:16 coffee to water ratio
- Water temperature should be 195-205°F
- Bloom the coffee for 30 seconds
- Pour in slow, circular motions
    `,
    excerpt:
      'Master the art of pour over coffee with this comprehensive step-by-step guide covering equipment, technique, and timing.',
    featuredImage: '/images/guides/pour-over-featured.jpg',
    images: ['/images/guides/pour-over-1.jpg', '/images/guides/pour-over-2.jpg'],
    category: categoryIds['brewing-methods'],
    tags: [tagIds['beginner'], tagIds['pour-over']],
    author: authorId,
    difficulty: 'beginner',
    estimatedTime: 15,
    equipment: [
      'Pour over dripper',
      'Paper filters',
      'Gooseneck kettle',
      'Coffee grinder',
      'Digital scale',
    ],
    ingredients: ['30g fresh coffee beans', '480ml filtered water'],
    steps: [
      {
        stepNumber: 1,
        title: 'Heat Water and Prepare Equipment',
        description:
          'Heat water to 200°F (93°C). Place filter in dripper and rinse with hot water.',
        duration: 3,
        tips: [
          'Rinsing the filter removes papery taste',
          'Preheating the dripper maintains temperature',
        ],
      },
      {
        stepNumber: 2,
        title: 'Grind Coffee',
        description: 'Grind 30g of coffee to medium consistency, similar to kosher salt.',
        duration: 1,
        tips: ['Grind just before brewing for best flavor', 'Consistent grind size is crucial'],
      },
      {
        stepNumber: 3,
        title: 'Add Coffee and Bloom',
        description:
          'Add ground coffee to filter. Pour 60ml water in circular motion, wait 30 seconds.',
        duration: 1,
        tips: ['Start timer when you begin pouring', 'Coffee should puff up during bloom'],
      },
      {
        stepNumber: 4,
        title: 'Continue Pouring',
        description:
          'Pour remaining water in slow, steady circles, keeping water level consistent.',
        duration: 3,
        tips: ['Pour from center outward', 'Maintain steady flow rate'],
      },
      {
        stepNumber: 5,
        title: 'Finish and Serve',
        description: 'Total brew time should be 4-6 minutes. Remove dripper and enjoy.',
        duration: 1,
        tips: ['Taste and adjust grind size for next brew', 'Clean equipment immediately'],
      },
    ],
    isPublished: true,
    isFeatured: true,
    viewCount: 1250,
    bookmarkCount: 89,
    rating: { average: 4.7, count: 156 },
    seo: {
      metaTitle: 'Perfect Pour Over Coffee Guide - Step by Step Tutorial',
      metaDescription:
        'Learn to make perfect pour over coffee with our detailed guide. Includes equipment list, step-by-step instructions, and pro tips.',
      keywords: ['pour over coffee', 'coffee brewing', 'coffee guide', 'V60', 'Chemex'],
    },
  },
  {
    title: 'French Press Brewing Mastery',
    slug: 'french-press-brewing-mastery',
    description: 'Discover the secrets to brewing rich, full-bodied coffee with a French press.',
    content: `
# French Press Brewing Mastery

The French press, also known as a cafetière, is beloved for producing rich, full-bodied coffee with minimal equipment. This immersion brewing method extracts maximum flavor from your coffee beans.

## Why French Press?

French press brewing allows coffee grounds to steep directly in hot water, creating a robust cup with oils and fine particles that paper filters would remove.

## Equipment Needed

- French press (8-cup recommended)
- Coarse grind coffee
- Hot water
- Wooden spoon
- Timer

## The Science

The metal mesh filter allows oils and fine particles through, creating the characteristic body and mouthfeel of French press coffee.
    `,
    excerpt:
      'Discover the secrets to brewing rich, full-bodied coffee with a French press using proper technique and timing.',
    featuredImage: '/images/guides/french-press-featured.jpg',
    category: categoryIds['brewing-methods'],
    tags: [tagIds['beginner'], tagIds['french-press']],
    author: authorId,
    difficulty: 'beginner',
    estimatedTime: 8,
    equipment: ['French press', 'Coffee grinder', 'Wooden spoon', 'Timer'],
    ingredients: ['56g coarse ground coffee', '850ml hot water'],
    steps: [
      {
        stepNumber: 1,
        title: 'Preheat French Press',
        description: 'Rinse French press with hot water to preheat.',
        duration: 1,
        tips: ['Preheating maintains brewing temperature'],
      },
      {
        stepNumber: 2,
        title: 'Add Coffee',
        description: 'Add coarsely ground coffee to the press.',
        duration: 1,
        tips: ['Use coarse grind to prevent over-extraction'],
      },
      {
        stepNumber: 3,
        title: 'Add Water and Stir',
        description: 'Pour hot water (200°F) over coffee, stir gently.',
        duration: 1,
        tips: ['Ensure all grounds are saturated'],
      },
      {
        stepNumber: 4,
        title: 'Steep',
        description: "Place lid on press (don't plunge yet), steep for 4 minutes.",
        duration: 4,
        tips: ['Consistent timing is key to flavor'],
      },
      {
        stepNumber: 5,
        title: 'Plunge and Serve',
        description: 'Slowly press plunger down, serve immediately.',
        duration: 1,
        tips: ['Press slowly to avoid agitation', 'Serve immediately to prevent over-extraction'],
      },
    ],
    isPublished: true,
    isFeatured: false,
    viewCount: 890,
    bookmarkCount: 67,
    rating: { average: 4.5, count: 123 },
  },
  {
    title: 'Understanding Coffee Grind Sizes',
    slug: 'understanding-coffee-grind-sizes',
    description: 'Learn how grind size affects extraction and flavor in your coffee brewing.',
    content: `
# Understanding Coffee Grind Sizes

Grind size is one of the most important variables in coffee brewing. It directly affects extraction rate, flavor, and the overall quality of your cup.

## Why Grind Size Matters

The size of your coffee grounds determines how quickly water can extract flavors, oils, and caffeine from the coffee. Too fine, and you'll over-extract (bitter). Too coarse, and you'll under-extract (sour).

## Grind Size Guide

### Extra Coarse
- Appearance: Like peppercorns
- Best for: Cold brew, cowboy coffee
- Extraction time: 12+ hours

### Coarse
- Appearance: Like kosher salt
- Best for: French press, percolator
- Extraction time: 4-6 minutes

### Medium-Coarse
- Appearance: Like coarse sand
- Best for: Chemex, Clever dripper
- Extraction time: 4-6 minutes

### Medium
- Appearance: Like table salt
- Best for: Drip coffee makers, pour over
- Extraction time: 4-6 minutes

### Medium-Fine
- Appearance: Like fine sand
- Best for: AeroPress, siphon
- Extraction time: 1-3 minutes

### Fine
- Appearance: Like powdered sugar
- Best for: Espresso, Moka pot
- Extraction time: 20-30 seconds

### Extra Fine
- Appearance: Like flour
- Best for: Turkish coffee
- Extraction time: Immediate
    `,
    excerpt:
      'Master the fundamentals of coffee grind sizes and how they affect extraction and flavor in different brewing methods.',
    featuredImage: '/images/guides/grind-sizes-featured.jpg',
    category: categoryIds['coffee-science'],
    tags: [tagIds['beginner'], tagIds['grind-size']],
    author: authorId,
    difficulty: 'intermediate',
    estimatedTime: 10,
    equipment: ['Coffee grinder', 'Various brewing devices'],
    ingredients: ['Coffee beans'],
    steps: [
      {
        stepNumber: 1,
        title: 'Identify Your Brewing Method',
        description: "Determine which brewing method you'll be using.",
        duration: 1,
        tips: ['Different methods require different grind sizes'],
      },
      {
        stepNumber: 2,
        title: 'Select Appropriate Grind Size',
        description: 'Choose the grind size that matches your brewing method.',
        duration: 1,
        tips: ['Refer to the grind size chart above'],
      },
      {
        stepNumber: 3,
        title: 'Grind Coffee',
        description: 'Grind your coffee beans to the selected size.',
        duration: 1,
        tips: ['Grind just before brewing', 'Use a burr grinder for consistency'],
      },
      {
        stepNumber: 4,
        title: 'Test and Adjust',
        description: 'Brew and taste, then adjust grind size if needed.',
        duration: 5,
        tips: ['If bitter, try coarser', 'If sour, try finer'],
      },
    ],
    isPublished: true,
    isFeatured: true,
    viewCount: 2100,
    bookmarkCount: 145,
    rating: { average: 4.8, count: 234 },
  },
];

export const seedEducationData = async (authorId: string) => {
  try {
    console.log('Seeding education data...');

    // Clear existing data
    await GuideCategory.deleteMany({});
    await GuideTag.deleteMany({});
    await Guide.deleteMany({});

    // Create categories
    const categories = await GuideCategory.insertMany(sampleCategories);
    const categoryMap: { [key: string]: any } = {};
    categories.forEach((cat) => {
      categoryMap[cat.slug] = cat._id;
    });

    // Create tags
    const tags = await GuideTag.insertMany(sampleTags);
    const tagMap: { [key: string]: any } = {};
    tags.forEach((tag) => {
      tagMap[tag.slug] = tag._id;
    });

    // Create guides
    const guidesData = createSampleGuides(categoryMap, tagMap, authorId);
    const guides = await Guide.insertMany(guidesData);

    console.log(`✅ Education data seeded successfully:`);
    console.log(`   - ${categories.length} categories created`);
    console.log(`   - ${tags.length} tags created`);
    console.log(`   - ${guides.length} guides created`);

    return {
      categories,
      tags,
      guides,
    };
  } catch (error) {
    console.error('❌ Error seeding education data:', error);
    throw error;
  }
};
