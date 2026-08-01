/**
 * ATM10 Codex — Bundled seed schemas.
 *
 * One schema object per entry type. JSON-able (no functions) so a schema can later
 * live in Firestore and be produced by the in-app editor. These are the offline
 * source of truth; a Firestore overlay wins when configured (see schemaStore.js).
 *
 * Field `kind`: text | prose | list | reference | hero | gallery.
 *   - text      single-line input; read view escapes it
 *   - prose     multi-line textarea; read view runs formatInline (bold/links/inline images)
 *   - list      repeatable rows; stored as string[]; read view renders a <ul>
 *   - reference single entry id of `targetType`; read view renders a live link
 *   - hero      single pool image id; delegates to existing media components
 *   - gallery   pool image id array; delegates to existing carousel
 * Field `showInMetadata`: include in the top metadata callout.
 * Field `inputType` (text only): passes through to the HTML input type (e.g. 'date').
 */

export const seedSchemas = [
  {
    type: 'civilization',
    label: 'Civilization',
    idField: 'id',
    titleField: 'name',
    sections: [
      {
        title: 'Core Identity',
        fields: [
          { key: 'id', label: 'Civilization ID', kind: 'text', placeholder: 'e.g. dwarves', showInMetadata: true },
          { key: 'name', label: 'Title / Name', kind: 'text', placeholder: 'e.g. Dwarves — Masters of Industry' },
          { key: 'philosophy', label: 'Philosophy', kind: 'prose' },
          { key: 'history', label: 'History', kind: 'prose' },
        ],
      },
      {
        title: 'Geography & Architecture',
        fields: [
          { key: 'geography', label: 'Geography & Terrain', kind: 'prose' },
          { key: 'architecture', label: 'Architecture Style', kind: 'prose' },
          { key: 'materialPalette', label: 'Material Palette', kind: 'list' },
          { key: 'silhouette', label: 'Silhouette', kind: 'text', placeholder: 'Skyline shape' },
          { key: 'infrastructure', label: 'Infrastructure Style', kind: 'text', placeholder: 'Tunnels and mine rail', showInMetadata: true },
        ],
      },
      {
        title: 'Economy & Trade',
        fields: [
          { key: 'economy', label: 'Economy', kind: 'prose' },
          { key: 'exports', label: 'Trade Exports', kind: 'list', showInMetadata: true },
          { key: 'imports', label: 'Trade Imports', kind: 'list', showInMetadata: true },
          { key: 'assignedMods', label: 'Assigned Mods', kind: 'list', showInMetadata: true },
        ],
      },
      {
        title: 'Settlements & Systems',
        fields: [
          { key: 'majorCities', label: 'Major Cities', kind: 'list' },
          { key: 'minorSettlements', label: 'Minor Settlements', kind: 'list' },
          { key: 'landmarks', label: 'Landmarks', kind: 'list' },
          { key: 'designPatterns', label: 'Design Patterns', kind: 'list' },
          { key: 'futureExpansion', label: 'Future Expansion', kind: 'prose' },
        ],
      },
      {
        title: 'Imagery',
        fields: [
          { key: 'heroImage', label: 'Hero Image', kind: 'hero' },
          { key: 'gallery', label: 'Inspiration', kind: 'gallery' },
        ],
      },
    ],
  },

  {
    type: 'mod',
    label: 'Mod',
    idField: 'id',
    titleField: 'name',
    sections: [
      {
        title: 'Mod Specification',
        fields: [
          { key: 'id', label: 'Mod ID', kind: 'text', placeholder: 'e.g. create', showInMetadata: true },
          { key: 'name', label: 'Mod Name', kind: 'text', placeholder: 'e.g. Create' },
          { key: 'civilization', label: 'Assigned Civilization', kind: 'reference', targetType: 'civilization', showInMetadata: true },
          { key: 'regionPlacement', label: 'Region Placement', kind: 'text', showInMetadata: true },
          { key: 'gameplayPurpose', label: 'Gameplay Purpose', kind: 'prose' },
          { key: 'architecturalThemes', label: 'Architectural Themes', kind: 'prose' },
          { key: 'typicalBuildings', label: 'Typical Buildings', kind: 'list' },
          { key: 'progression', label: 'Progression', kind: 'prose' },
          { key: 'integration', label: 'Integration', kind: 'prose' },
        ],
      },
      {
        title: 'Imagery',
        fields: [
          { key: 'heroImage', label: 'Hero Image', kind: 'hero' },
          { key: 'gallery', label: 'Inspiration', kind: 'gallery' },
        ],
      },
    ],
  },

  {
    type: 'region',
    label: 'Region',
    idField: 'id',
    titleField: 'name',
    sections: [
      {
        title: 'Region Specification',
        fields: [
          { key: 'id', label: 'Region ID', kind: 'text', placeholder: 'e.g. ironvein_peaks', showInMetadata: true },
          { key: 'name', label: 'Region Name', kind: 'text', placeholder: 'e.g. Ironvein Peaks' },
          { key: 'climate', label: 'Climate', kind: 'text', placeholder: 'e.g. Alpine Cold', showInMetadata: true },
          { key: 'dominantCivilization', label: 'Dominant Civilization', kind: 'reference', targetType: 'civilization', showInMetadata: true },
          { key: 'geography', label: 'Geography', kind: 'prose' },
          { key: 'settlements', label: 'Settlements', kind: 'list' },
          { key: 'tradeRoutes', label: 'Trade Routes', kind: 'list' },
          { key: 'resources', label: 'Resources', kind: 'list' },
          { key: 'storyHooks', label: 'Story Hooks', kind: 'prose' },
          { key: 'pointsOfInterest', label: 'Points of Interest', kind: 'list' },
        ],
      },
      {
        title: 'Imagery',
        fields: [
          { key: 'heroImage', label: 'Hero Image', kind: 'hero' },
          { key: 'gallery', label: 'Inspiration', kind: 'gallery' },
        ],
      },
    ],
  },

  {
    type: 'decision',
    label: 'Decision Log',
    idField: 'id',
    titleField: 'title',
    sections: [
      {
        title: 'Architectural Decision Record',
        fields: [
          { key: 'id', label: 'Decision ID', kind: 'text', placeholder: 'e.g. adr-001', showInMetadata: true },
          { key: 'date', label: 'Date', kind: 'text', inputType: 'date', showInMetadata: true },
          { key: 'title', label: 'Decision Title', kind: 'text', placeholder: 'e.g. Civilization-First Mod Allocation' },
          { key: 'whatChanged', label: 'What Changed', kind: 'prose' },
          { key: 'why', label: 'Why (Rationale)', kind: 'prose' },
          { key: 'alternativesConsidered', label: 'Alternatives Considered', kind: 'prose' },
          { key: 'longTermImplications', label: 'Long-Term Implications', kind: 'prose' },
        ],
      },
    ],
  },
];
