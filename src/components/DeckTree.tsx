import { useMemo, useState } from 'react';
import type { Card, GroupNode, Language, Progress, TreeNode } from '../types';
import { decksOf } from '../lib/decks';
import { isDue, keyOf, State } from '../lib/srs';

export const NONE = '__none__';

interface DeckStats {
  due: number;
  learned: number;
  total: number;
}

function useDeckStats(cards: Card[], progress: Map<string, Progress>, suspended: string[]) {
  return useMemo(() => {
    const now = new Date();
    const skip = new Set(suspended);
    const out = new Map<string, DeckStats>();
    for (const c of cards) {
      const s = out.get(c.deckId) ?? { due: 0, learned: 0, total: 0 };
      s.total++;
      const rec = progress.get(keyOf(c.id, 'recognize'));
      const cal = progress.get(keyOf(c.id, 'recall'));
      if (rec && rec.fsrs.state !== State.New) s.learned++;
      if (!skip.has(c.id) && [rec, cal].some((p) => p && p.fsrs.state !== State.New && isDue(p.fsrs, now))) s.due++;
      out.set(c.deckId, s);
    }
    return out;
  }, [cards, progress, suspended]);
}

function sum(node: TreeNode, stats: Map<string, DeckStats>): DeckStats {
  if (node.kind === 'deck') return stats.get(node.id) ?? { due: 0, learned: 0, total: node.count };
  return node.children
    .map((c) => sum(c, stats))
    .reduce((a, b) => ({ due: a.due + b.due, learned: a.learned + b.learned, total: a.total + b.total }), {
      due: 0,
      learned: 0,
      total: 0,
    });
}

export function DeckTree(props: {
  language: Language;
  cards: Card[];
  progress: Map<string, Progress>;
  suspended: string[];
  scope: string[] | undefined;
  onScope: (ids: string[]) => void;
}) {
  const { language, scope, onScope } = props;
  const allIds = useMemo(() => decksOf(language.tree).map((d) => d.id), [language]);
  const selected = useMemo(() => {
    if (!scope?.length) return new Set(allIds);
    if (scope.includes(NONE)) return new Set<string>();
    const s = new Set(scope.filter((id) => allIds.includes(id)));
    return s.size ? s : new Set(allIds);
  }, [scope, allIds]);
  const stats = useDeckStats(props.cards, props.progress, props.suspended);

  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    if (next.size === allIds.length) onScope([]);
    else if (next.size === 0) onScope([NONE]);
    else onScope([...next]);
  };

  return (
    <div className="tree" role="tree">
      {language.tree.map((n) => (
        <Node key={n.id} node={n} depth={0} selected={selected} stats={stats} toggle={toggle} />
      ))}
    </div>
  );
}

function Node(props: {
  node: TreeNode;
  depth: number;
  selected: Set<string>;
  stats: Map<string, DeckStats>;
  toggle: (ids: string[], on: boolean) => void;
}) {
  const { node, depth, selected, stats, toggle } = props;
  const [open, setOpen] = useState(depth < 1);
  const s = sum(node, stats);
  const ids = node.kind === 'deck' ? [node.id] : decksOf((node as GroupNode).children).map((d) => d.id);
  const on = ids.filter((id) => selected.has(id)).length;
  const checked = on === ids.length;
  const mixed = on > 0 && !checked;
  const pct = s.total ? Math.round((s.learned / s.total) * 100) : 0;

  return (
    <div className={`tree-node depth-${Math.min(depth, 3)}`} role="treeitem" aria-expanded={node.kind === 'group' ? open : undefined}>
      <div className="tree-row">
        <input
          type="checkbox"
          className="tick"
          checked={checked}
          ref={(el) => {
            if (el) el.indeterminate = mixed;
          }}
          onChange={() => toggle(ids, !checked)}
          aria-label={`Учить «${node.name}»`}
        />
        <button
          className="tree-label"
          onClick={() => (node.kind === 'group' ? setOpen(!open) : toggle(ids, !checked))}
        >
          {node.kind === 'group' && <span className={`caret ${open ? 'open' : ''}`} aria-hidden="true" />}
          <span className="tree-name">{node.name}</span>
          <span className="tree-meta">
            {s.due > 0 && <span className="due-pill">{s.due}</span>}
            <span className="tree-count">
              {s.learned}/{s.total}
            </span>
          </span>
        </button>
      </div>
      <div className="tree-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      {node.kind === 'group' && open && (
        <div className="tree-children">
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} selected={selected} stats={stats} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}
