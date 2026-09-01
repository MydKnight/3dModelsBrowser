// A small data/raw/models.json-shaped sample (scan-nas.mjs output shape) for
// build-filter-index tests. Deliberately unsorted and with overlapping tags.
export const rawModels = [
  {
    id: 'drakanchor-1a2b3c4d',
    name: 'Drakanchor',
    subscription: 'Rescale',
    release: 'Molten Hearts',
    tags: ['huge', 'dragon', 'cr14'],
    relPath: 'Rescale/Molten Hearts/enemies/Drakanchor_Supports',
    sourceImage: '\\\\nas\\...\\render_01.jpg',
    addedTs: 1741641956152,
    firstSeenTs: 1756000000000,
  },
  {
    id: 'sir-roland-55aa55aa',
    name: 'Sir Roland',
    subscription: 'Loot Studios',
    release: 'A Light in the Shadow',
    tags: ['large', 'humanoid'],
    relPath: 'Loot Studios/A Light in the Shadow/Organized/heroes/Sir Roland',
    sourceImage: '\\\\nas\\...\\FN2012AC20.png',
    addedTs: 1740000000000,
    firstSeenTs: 1758000000000, // newest
  },
  {
    id: 'ascendant-greatwolf-99ff99ff',
    name: 'Ascendant Greatwolf',
    subscription: 'Witchsong Miniatures',
    release: null, // sits directly under the subscription
    tags: ['huge', 'monstrosity', 'cr9'],
    relPath: 'Witchsong Miniatures/Ascendant Greatwolf',
    sourceImage: '\\\\nas\\...\\Ascendant Greatwolf.png',
    addedTs: 1741000000000,
    firstSeenTs: 1757000000000,
  },
  {
    id: 'goblin-warband-abcdabcd',
    name: 'Goblin Warband',
    subscription: 'Grinning God',
    release: 'May Release',
    tags: [], // untagged
    relPath: 'Grinning God/May Release/Enemies/Goblin Warband',
    sourceImage: '\\\\nas\\...\\goblin.jpg',
    addedTs: 1755000000000,
    firstSeenTs: undefined, // falls back to addedTs (oldest here)
  },
];
