/**
 * Codex — Neutral demo fixture.
 *
 * The single codex shown in local-only mode (no Firebase) and the shared content for
 * headless smoke tests + unit-test fixtures. Deliberately generic (no ATM10 lore): a
 * `note` type and a `person` type, chosen so the two schemas between them exercise every
 * field kind (text / prose / list / reference / hero / gallery) and a real cross-entry
 * reference (`person.favoriteNote` → a `note`).
 *
 * This is NOT "the app's data" — it is demo/test content. Real codices live in Firestore.
 * Its shape mirrors a codex's Firestore payload (schemas + entries-by-type) so the
 * local-only path and the configured path stay symmetrical.
 */

export const demoCodexId = 'demo';

export const demoCodexMeta = {
  codexId: demoCodexId,
  name: 'Demo',
  description: 'A neutral demo codex used in local-only mode and tests.',
  status: 'active',
};

export const demoSchemas = [
  {
    type: 'note',
    label: 'Note',
    icon: 'decision',
    idField: 'id',
    titleField: 'title',
    status: 'active',
    sections: [
      {
        title: 'Note',
        fields: [
          { key: 'id', label: 'Note ID', kind: 'text', placeholder: 'e.g. welcome', showInMetadata: true },
          { key: 'title', label: 'Title', kind: 'text', placeholder: 'e.g. Welcome' },
          { key: 'body', label: 'Body', kind: 'prose' },
          { key: 'tags', label: 'Tags', kind: 'list', showInMetadata: true },
        ],
      },
      {
        title: 'Imagery',
        fields: [
          { key: 'heroImage', label: 'Hero Image', kind: 'hero' },
          { key: 'gallery', label: 'Gallery', kind: 'gallery' },
        ],
      },
    ],
  },
  {
    type: 'person',
    label: 'Person',
    icon: 'civilization',
    idField: 'id',
    titleField: 'name',
    status: 'active',
    sections: [
      {
        title: 'Person',
        fields: [
          { key: 'id', label: 'Person ID', kind: 'text', placeholder: 'e.g. ada', showInMetadata: true },
          { key: 'name', label: 'Name', kind: 'text', placeholder: 'e.g. Ada' },
          { key: 'bio', label: 'Bio', kind: 'prose' },
          { key: 'favoriteNote', label: 'Favorite Note', kind: 'reference', targetType: 'note', showInMetadata: true },
        ],
      },
      {
        title: 'Imagery',
        fields: [{ key: 'heroImage', label: 'Hero Image', kind: 'hero' }],
      },
    ],
  },
];

export const demoEntriesByType = {
  note: [
    {
      type: 'note',
      id: 'welcome',
      status: 'active',
      title: 'Welcome',
      body: 'This is a **demo** note with an inline [link](https://example.com) and a `- ` list:\n- first\n- second',
      tags: ['demo', 'fixture'],
      heroImage: '',
      gallery: [],
    },
    {
      type: 'note',
      id: 'field-guide',
      status: 'active',
      title: 'Field Guide',
      body: 'A second note so a *reference* has somewhere to point.',
      tags: ['reference'],
      heroImage: '',
      gallery: [],
    },
  ],
  person: [
    {
      type: 'person',
      id: 'ada',
      status: 'active',
      name: 'Ada',
      bio: 'A demo person who likes the **welcome** note.',
      favoriteNote: 'welcome',
      heroImage: '',
    },
  ],
};
