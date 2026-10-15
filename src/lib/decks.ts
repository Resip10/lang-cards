import type { Card, DeckFile, DeckNode, Language, Manifest, TreeNode } from '../types';

export async function fetchManifest(): Promise<Manifest> {
  const res = await fetch('/decks/manifest.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Не удалось загрузить список колод (${res.status})`);
  return res.json();
}

export function decksOf(nodes: TreeNode[]): DeckNode[] {
  return nodes.flatMap((n) => (n.kind === 'deck' ? [n] : decksOf(n.children)));
}

export async function fetchCards(lang: Language): Promise<Card[]> {
  const decks = decksOf(lang.tree);
  const files = await Promise.all(
    decks.map(async (d) => {
      const res = await fetch(`/${d.file}?v=${d.hash}`);
      if (!res.ok) throw new Error(`Не удалось загрузить колоду «${d.name}»`);
      return { deck: d, data: (await res.json()) as DeckFile };
    }),
  );
  let order = 0;
  return files.flatMap(({ deck, data }) =>
    data.cards.map((c) => ({ ...c, lang: lang.code, deckId: deck.id, deckName: deck.name, order: order++ })),
  );
}
