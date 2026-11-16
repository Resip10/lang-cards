// Scans public/decks/, validates every deck and writes public/decks/manifest.json.
// Runs before `dev` and `build`, so Vercel regenerates it on every push.
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve('public/decks');
const errors = [];

const prettify = (slug) => {
  const s = slug.replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    errors.push(`${path.relative(ROOT, file)}: invalid JSON (${e.message})`);
    return null;
  }
}

async function readOptional(file) {
  try {
    await stat(file);
  } catch {
    return null;
  }
  return readJson(file);
}

const byOrder = (a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, 'ru');

// `want` picks what this pass collects: card decks (*.json) or grammar rules (*.rule.json).
async function walk(dir, lang, ids, want) {
  const entries = (await readdir(dir)).filter((n) => !n.startsWith('.') && n !== 'manifest.json');
  const children = [];
  for (const name of entries) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if ((await stat(full)).isDirectory()) {
      const meta = (await readOptional(path.join(full, '_meta.json'))) ?? {};
      const kids = await walk(full, lang, ids, want);
      if (kids.length) {
        children.push({ kind: 'group', id: rel, name: meta.name ?? prettify(name), order: meta.order, children: kids });
      }
      continue;
    }
    if (!name.endsWith('.json') || name === '_meta.json') continue;
    const isRule = name.endsWith('.rule.json');
    if (isRule !== (want === 'rule')) continue;
    const raw = await readFile(full, 'utf8');
    const deck = await readJson(full);
    if (!deck) continue;
    const hash = createHash('sha1').update(raw).digest('hex').slice(0, 10);
    if (isRule) {
      checkRule(deck, rel);
      children.push({
        kind: 'rule',
        id: rel.replace(/\.rule\.json$/, ''),
        file: `decks/${rel}`,
        name: deck.name ?? prettify(name.replace(/\.rule\.json$/, '')),
        summary: deck.summary,
        order: deck.order,
        count: Array.isArray(deck.exercises) ? deck.exercises.length : 0,
        hash,
      });
      continue;
    }
    if (!Array.isArray(deck.cards)) {
      errors.push(`${rel}: "cards" must be an array`);
      continue;
    }
    deck.cards.forEach((c, i) => {
      const where = `${rel} card #${i + 1}`;
      if (!c.id) errors.push(`${where}: missing "id"`);
      if (!c.front) errors.push(`${where}: missing "front"`);
      if (!c.back) errors.push(`${where}: missing "back"`);
      if (c.id) {
        if (ids.has(c.id)) errors.push(`${where}: duplicate id "${c.id}" (also in ${ids.get(c.id)})`);
        ids.set(c.id, rel);
      }
    });
    children.push({
      kind: 'deck',
      id: rel.replace(/\.json$/, ''),
      file: `decks/${rel}`,
      name: deck.name ?? prettify(name.replace(/\.json$/, '')),
      order: deck.order,
      count: deck.cards.length,
      hash,
    });
  }
  return children.sort(byOrder);
}

function checkRule(rule, rel) {
  if (!rule.name) errors.push(`${rel}: missing "name"`);
  if (!Array.isArray(rule.sections) || !rule.sections.length) errors.push(`${rel}: "sections" must be a non-empty array`);
  (rule.exercises ?? []).forEach((x, i) => {
    const where = `${rel} exercise #${i + 1}`;
    if (!x.q) errors.push(`${where}: missing "q"`);
    if (x.options) {
      if (!Array.isArray(x.options) || x.options.length < 2) errors.push(`${where}: "options" needs 2+ items`);
      else if (!Number.isInteger(x.answer) || x.answer < 0 || x.answer >= x.options.length)
        errors.push(`${where}: "answer" must be an index into "options"`);
    } else if (!Array.isArray(x.answers) || !x.answers.length) {
      errors.push(`${where}: needs "options" + "answer" or non-empty "answers"`);
    }
  });
}

const languages = [];
for (const code of (await readdir(ROOT)).sort()) {
  const dir = path.join(ROOT, code);
  if (!(await stat(dir)).isDirectory()) continue;
  const meta = await readOptional(path.join(dir, '_meta.json'));
  if (!meta) {
    errors.push(`${code}/: missing _meta.json`);
    continue;
  }
  const ids = new Map();
  const tree = await walk(dir, code, ids, 'deck');
  const rules = await walk(dir, code, new Map(), 'rule');
  languages.push({
    code,
    name: meta.name ?? code,
    flag: meta.flag ?? '',
    tts: meta.tts ?? code,
    chars: meta.chars ?? '',
    order: meta.order,
    total: ids.size,
    tree,
    rules,
  });
}

if (errors.length) {
  console.error('Deck errors:\n  ' + errors.join('\n  '));
  process.exit(1);
}

languages.sort(byOrder);
const body = { languages };
const version = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 10);
await writeFile(path.join(ROOT, 'manifest.json'), JSON.stringify({ version, ...body }, null, 2) + '\n');
console.log(`manifest: ${languages.map((l) => `${l.code} (${l.total} cards)`).join(', ') || 'no languages'}`);
