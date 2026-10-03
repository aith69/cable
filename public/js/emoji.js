/** Catalogo condiviso tra server e pagina. Il server usa solo gli id. */
export const CATALOG = {
  animals: { cat: '🐱', dog: '🐶', tiger: '🐯', elephant: '🐘', penguin: '🐧' },
  food: { apple: '🍎', pizza: '🍕', banana: '🍌', burger: '🍔', donut: '🍩' },
  vehicles: { car: '🚗', bicycle: '🚲', train: '🚂', helicopter: '🚁', rocket: '🚀' },
  plants: { cactus: '🌵', sunflower: '🌻', pine: '🌲', palm: '🌴', rose: '🌹' },
  objects: { key: '🔑', clock: '⏰', guitar: '🎸', camera: '📷', balloon: '🎈' },
  nature: { moon: '🌙', star: '⭐', fire: '🔥', rainbow: '🌈', wave: '🌊' },
  sport: { soccer: '⚽', basketball: '🏀', tennis: '🎾', target: '🎯', trophy: '🏆' },
};

export const CATEGORIES = Object.keys(CATALOG);
export const EMOJI = Object.fromEntries(Object.values(CATALOG).flatMap(Object.entries));

export const glyph = (id) => (Object.hasOwn(EMOJI, id) ? EMOJI[id] : '');

export function categoryOf(id) {
  return CATEGORIES.find((category) => Object.hasOwn(CATALOG[category], id));
}

/** Intero casuale in [0, max), senza distorsione. */
export function secureInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Tre emoji di tre categorie diverse; uno è quello giusto. */
export function makeChallenge(rand = secureInt) {
  const categories = shuffle([...CATEGORIES], rand).slice(0, 3);
  const options = categories.map((category) => {
    const ids = Object.keys(CATALOG[category]);
    return ids[rand(ids.length)];
  });
  return { correct: options[rand(options.length)], options };
}
