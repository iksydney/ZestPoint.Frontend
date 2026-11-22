/**
 * The "same or similar name" rule for stock groups (owner's rule, 2026-11-22: lazy users must not end up with "Soft Drinks",
 * "soft drinks" and "Softdrink" side by side). The server applies the identical rule in `StockGroupService` and is the authority;
 * this copy only gives instant feedback in the new-group window. If the two ever disagree, the server wins. Keep them in step.
 *
 * Steps (mirrored exactly on the server):
 *  1. Trim, decompose (NFD) and drop the combining marks (Cafe = Cafe with an accent), lower-case, replace `&` by " and ",
 *     replace every run of characters that is not a letter or a digit (`\p{L}`, `\p{Nd}`) by one space, trim.
 *  2. Remove all spaces: that is the key K0 ("Soft Drinks", "Soft-Drinks" and "Softdrinks" all give "softdrinks").
 *  3. The singular keys are K0, K0 without one trailing "s" (only when K0 is longer than 3 characters) and K0 without a trailing
 *     "es" (only when K0 is longer than 4 characters).
 *  Two names are the same or similar when their sets of singular keys share a key, or when both K0 are at least 6 characters long
 *  and their Levenshtein distance is 1 or less. A name with nothing left after step 1 is not a name.
 */

/** Step 1 and 2: the key K0, or '' when nothing but marks and punctuation was typed. */
export function groupNameKey(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{Nd}]+/gu, ' ')
    .trim()
    .replace(/ /g, '');
}

/** Step 3. */
export function singularKeys(k0: string): readonly string[] {
  const keys = [k0];
  if (k0.length > 3 && k0.endsWith('s')) keys.push(k0.slice(0, -1));
  if (k0.length > 4 && k0.endsWith('es')) keys.push(k0.slice(0, -2));
  return keys;
}

/** Number of single-character insertions, deletions and substitutions that turn `a` into `b`. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row.push(Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    previous = row;
  }
  return previous[b.length]!;
}

/** True when the two names are the same or similar under the rule above. Two empty keys are never similar. */
export function groupNamesSimilar(a: string, b: string): boolean {
  const ka = groupNameKey(a);
  const kb = groupNameKey(b);
  if (!ka || !kb) return false;
  const keysB = singularKeys(kb);
  if (singularKeys(ka).some((k) => keysB.includes(k))) return true;
  return ka.length >= 6 && kb.length >= 6 && editDistance(ka, kb) <= 1;
}

export interface NamedGroup { readonly id: string; readonly name: string; readonly isActive: boolean }

export interface GroupNameClash<G extends NamedGroup> {
  readonly group: G;
  /** The very same name apart from capital letters and spaces at the ends (worded "already exists"), as against only looking alike. The server words it the same way. */
  readonly identical: boolean;
}

const plain = (name: string): string => name.trim().toLowerCase();

/**
 * The existing group a typed name clashes with, or null. Every group the form knows is compared (active and switched off). When several
 * clash the most obvious one is returned: an identical name before a similar one, an active group before a switched-off one.
 * `ignoreId` leaves one group out (for a rename).
 */
export function findGroupNameClash<G extends NamedGroup>(name: string, groups: readonly G[], ignoreId?: string | null): GroupNameClash<G> | null {
  if (!groupNameKey(name)) return null;
  const typed = plain(name);
  const clashes = groups
    .filter((g) => g.id !== ignoreId && groupNamesSimilar(name, g.name))
    .map((group) => ({ group, identical: plain(group.name) === typed }));
  const rank = (c: GroupNameClash<G>): number => (c.group.isActive ? 0 : 2) + (c.identical ? 0 : 1);
  return clashes.sort((x, y) => rank(x) - rank(y))[0] ?? null;
}
