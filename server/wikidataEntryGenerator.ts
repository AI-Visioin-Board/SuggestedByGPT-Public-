/**
 * Wikidata Entry Generator
 *
 * Generates structured Wikidata entry content for a business.
 * Even businesses that don't qualify for Wikipedia can create Wikidata entries,
 * which strengthens entity recognition across all AI platforms.
 *
 * Evidence: Wikipedia/Wikidata is the #1 cited source by ChatGPT (47.9% of top citations).
 * Entities with Wikidata Q-IDs have 2.8x higher citation likelihood.
 */

export interface WikidataInput {
  businessName: string;
  website: string;
  industry: string;
  servicesOffered: string[];
  businessAddress: string;
  targetLocation: string;
  foundedYear?: string;
  founderName?: string;
}

export interface WikidataOutput {
  entryContent: WikidataEntry;
  submissionGuide: string;
  eligibilityAssessment: string;
}

interface WikidataEntry {
  label: string;
  description: string;
  aliases: string[];
  statements: WikidataStatement[];
}

interface WikidataStatement {
  property: string;
  propertyLabel: string;
  value: string;
  note: string;
}

export function generateWikidataEntry(input: WikidataInput): WikidataOutput {
  console.log(`[Wikidata] Generating entry for ${input.businessName}...`);

  const entry: WikidataEntry = {
    label: input.businessName,
    description: `${input.industry.toLowerCase()} business based in ${input.targetLocation}`,
    aliases: generateAliases(input),
    statements: generateStatements(input),
  };

  return {
    entryContent: entry,
    submissionGuide: generateSubmissionGuide(input, entry),
    eligibilityAssessment: generateEligibilityAssessment(input),
  };
}

function generateAliases(input: WikidataInput): string[] {
  const aliases: string[] = [];

  // Common abbreviations or variations
  const name = input.businessName;
  if (name.includes(' LLC') || name.includes(' Inc') || name.includes(' Co')) {
    aliases.push(name.replace(/ (LLC|Inc|Co|Corp|Ltd)\.?$/i, '').trim());
  }
  if (name.includes('&')) {
    aliases.push(name.replace('&', 'and'));
  }
  if (name.includes(' and ')) {
    aliases.push(name.replace(' and ', ' & '));
  }

  // Add location-qualified version
  aliases.push(`${input.businessName} ${input.targetLocation}`);

  return aliases.filter(a => a !== input.businessName);
}

function generateStatements(input: WikidataInput): WikidataStatement[] {
  const statements: WikidataStatement[] = [
    {
      property: 'P31',
      propertyLabel: 'instance of',
      value: 'Q4830453 (business)',
      note: 'Identifies this entity as a business',
    },
    {
      property: 'P452',
      propertyLabel: 'industry',
      value: input.industry,
      note: 'The industry/sector this business operates in',
    },
    {
      property: 'P856',
      propertyLabel: 'official website',
      value: input.website,
      note: 'The official website URL',
    },
    {
      property: 'P159',
      propertyLabel: 'headquarters location',
      value: input.targetLocation,
      note: 'Where the business is based',
    },
    {
      property: 'P276',
      propertyLabel: 'location',
      value: input.businessAddress,
      note: 'Physical address',
    },
    {
      property: 'P17',
      propertyLabel: 'country',
      value: 'Q30 (United States of America)',
      note: 'Country of operation',
    },
  ];

  if (input.foundedYear) {
    statements.push({
      property: 'P571',
      propertyLabel: 'inception',
      value: input.foundedYear,
      note: 'Year the business was founded',
    });
  }

  if (input.founderName) {
    statements.push({
      property: 'P112',
      propertyLabel: 'founded by',
      value: input.founderName,
      note: 'Founder of the business',
    });
  }

  return statements;
}

function generateEligibilityAssessment(input: WikidataInput): string {
  return `## Wikidata vs. Wikipedia — Eligibility Assessment

### Wikidata (RECOMMENDED — Lower Barrier)
**Eligible?** Most likely YES.

Wikidata has much lower notability requirements than Wikipedia. Any entity that is:
- A registered business with a physical location
- Has an official website
- Can be verified through external sources

...is generally eligible for a Wikidata entry.

### Wikipedia (HARDER — Higher Barrier)
**Eligible?** Depends on notability.

Wikipedia requires "significant coverage in reliable sources that are independent of the subject." This typically means:
- Press coverage in multiple news outlets
- Industry awards or recognition
- Published academic or trade references
- Revenue above certain thresholds (for businesses)

**For most small businesses, Wikipedia is NOT realistic.** Focus on Wikidata instead — it provides the entity recognition benefits without the notability hurdle.

### Why Wikidata Matters

- AI models use Wikidata's Knowledge Graph (500+ billion facts) for entity disambiguation
- A Wikidata Q-ID gives your business a unique, stable identifier
- Google's Knowledge Graph directly imports from Wikidata
- When AI platforms encounter your business name, a Wikidata entry helps them verify it's a real entity
`;
}

function generateSubmissionGuide(input: WikidataInput, entry: WikidataEntry): string {
  return `# Wikidata Entry Submission Guide

## What Is Wikidata?

Wikidata is a free, open knowledge base that feeds data to Wikipedia, Google Knowledge Graph, and every major AI platform. Creating a Wikidata entry for your business gives it a unique identifier (Q-ID) that AI systems use for entity recognition.

## Your Prepared Entry

### Label
\`${entry.label}\`

### Description
\`${entry.description}\`

### Aliases
${entry.aliases.map(a => `- \`${a}\``).join('\n')}

### Properties (Statements)

| Property | Label | Value |
|----------|-------|-------|
${entry.statements.map(s => `| ${s.property} | ${s.propertyLabel} | ${s.value} |`).join('\n')}

## Step-by-Step Submission

### Step 1: Create a Wikidata Account
1. Go to https://www.wikidata.org
2. Click "Create account" in the top right
3. Choose a username (use your real name or business name)
4. Verify your email

### Step 2: Create the Item
1. Go to https://www.wikidata.org/wiki/Special:NewItem
2. Enter the Label: \`${entry.label}\`
3. Enter the Description: \`${entry.description}\`
4. Enter Aliases: ${entry.aliases.join(', ')}
5. Click "Create"

### Step 3: Add Statements
After creating the item, add each statement:

${entry.statements.map((s, i) => `
**${i + 1}. ${s.propertyLabel} (${s.property})**
1. Click "add statement"
2. Type "${s.propertyLabel}" in the property field
3. Set the value to: ${s.value}
4. Click "publish"
`).join('')}

### Step 4: Add References
For each statement, add a reference:
1. Click "add reference" on the statement
2. Add "reference URL" → ${input.website}
3. Add "retrieved" → today's date

### Step 5: Verify
After adding all statements:
1. Review the complete entry for accuracy
2. Ensure all information matches your website and other listings
3. Save and note your Q-ID (e.g., Q123456789)
4. Use this Q-ID in your schema markup (sameAs property)

## After Submission

- Your entry may be reviewed by Wikidata editors
- Keep information up-to-date
- Add more statements as your business grows (awards, certifications, etc.)
- Link your Wikidata Q-ID in your website's schema markup:

\`\`\`json
{
  "@type": "LocalBusiness",
  "sameAs": [
    "https://www.wikidata.org/wiki/Q[YOUR_ID]",
    "${input.website}",
    "https://www.google.com/maps/place/..."
  ]
}
\`\`\`

---

*Generated by SuggestedByGPT AI Visibility Optimization*
`;
}

/**
 * Format as deliverable report.
 */
export function formatWikidataReport(businessName: string, output: WikidataOutput): string {
  const entry = output.entryContent;

  return `# Wikidata Entity Registration Package

**Client:** ${businessName}
**Generated:** ${new Date().toLocaleDateString()}

---

## Why Wikidata Matters for AI Visibility

- Wikipedia/Wikidata is the **#1 cited source** by ChatGPT (47.9% of top citations)
- Wikidata entities have **2.8x higher** citation likelihood across AI platforms
- Google's Knowledge Graph imports directly from Wikidata
- A Wikidata Q-ID gives your business a unique, verified identifier

---

${output.eligibilityAssessment}

---

## Your Prepared Entry Content

**Label:** ${entry.label}
**Description:** ${entry.description}
**Aliases:** ${entry.aliases.join(', ')}

### Properties to Set

| Property | Label | Value | Note |
|----------|-------|-------|------|
${entry.statements.map(s => `| ${s.property} | ${s.propertyLabel} | ${s.value} | ${s.note} |`).join('\n')}

---

${output.submissionGuide}
`;
}
