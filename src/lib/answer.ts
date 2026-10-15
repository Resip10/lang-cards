// Comparing typed answers. Exact (ignoring case and punctuation) is correct;
// matching only once diacritics are stripped counts as "almost" — the word is known,
// the spelling isn't yet.

export type Verdict = 'correct' | 'almost' | 'wrong';

const EXTRA: Record<string, string> = { ł: 'l', Ł: 'L', ø: 'o', ß: 'ss', đ: 'd' };

export const stripMarks = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łŁøßđ]/g, (ch) => EXTRA[ch] ?? ch);

/** Removes grammar notation like "+ D." that is shown on the card but never typed. */
export const cleanTerm = (s: string) => s.replace(/\s*\+\s*[A-ZŁŚŻ][a-ząćęłńóśźż]*\.?/g, '').trim();

function normalize(s: string) {
  return cleanTerm(s)
    .toLowerCase()
    .replace(/[.!?¿¡«»"„”'’()]/g, '')
    .split(/\s*[\/,;]\s*/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' / ');
}

export function accepted(card: { front: string; answers?: string[] }) {
  return card.answers?.length ? card.answers : [card.front];
}

export function check(input: string, answers: string[]): { verdict: Verdict; target: string } {
  const typed = normalize(input);
  for (const a of answers) if (normalize(a) === typed) return { verdict: 'correct', target: a };
  for (const a of answers) {
    if (stripMarks(normalize(a)) === stripMarks(typed)) return { verdict: 'almost', target: a };
  }
  return { verdict: 'wrong', target: answers[0] };
}

export interface DiffPart {
  text: string;
  ok: boolean;
}

/** Marks which characters of `target` the user got right (LCS, case-insensitive). */
export function diff(input: string, target: string): DiffPart[] {
  const a = input.toLowerCase();
  const b = target;
  const bl = b.toLowerCase();
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(bl.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = bl.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === bl[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const marks: boolean[] = [];
  let i = 0;
  let j = 0;
  while (j < bl.length) {
    if (i < a.length && a[i] === bl[j]) {
      marks.push(true);
      i++;
      j++;
    } else if (i < a.length && dp[i + 1][j] >= dp[i][j + 1]) i++;
    else {
      marks.push(false);
      j++;
    }
  }
  const parts: DiffPart[] = [];
  for (let k = 0; k < b.length; k++) {
    const ok = marks[k] || b[k] === ' ';
    const last = parts[parts.length - 1];
    if (last && last.ok === ok) last.text += b[k];
    else parts.push({ text: b[k], ok });
  }
  return parts;
}
