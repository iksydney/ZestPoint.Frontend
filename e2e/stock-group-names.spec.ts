import { expect, test } from '@playwright/test';
import { editDistance, findGroupNameClash, groupNameKey, groupNamesSimilar, singularKeys } from '../src/app/core/stock-group-names';

/**
 * The "same or similar name" rule for stock groups (owner's rule, 2026-11-22), as pure functions. The server applies the identical rule
 * (`StockGroupService`) and has the same two tables in its own tests: a name that is the same or looks the same is refused, a clearly
 * different one is not. These lists are the agreed table; they must not be loosened to make a change pass.
 */

const SIMILAR: readonly (readonly [string, string])[] = [
  ['Soft Drinks', 'soft drinks'], ['Soft Drinks', 'Soft-Drinks'], ['Softdrinks', 'Soft Drinks'], ['Soft Drink', 'Soft Drinks'],
  ['Food & Drinks', 'Food and Drinks'], ['Café', 'Cafe'], ['Cocktails', 'Cocktail'], ['Dishes', 'Dish'], ['Beverages', 'Beveragez'],
  [' Spirits ', 'spirits'], ['Beer', 'Beers'], ['Wine', 'Wines'], ['Bar', 'Bars']
];

const DIFFERENT: readonly (readonly [string, string])[] = [
  ['Beer', 'Beef'], ['Wine', 'Wing'], ['Spirits', 'Soft drinks'], ['Lager', 'Larger'], ['Bar', 'Barley'], ['Meat', 'Meal'], ['Cake', 'Cakes and Pies']
];

test.describe('The stock group name rule (pure checks, no browser)', () => {
  for (const [a, b] of SIMILAR) {
    test(`'${a}' and '${b}' are the same or similar, whichever way round`, () => {
      expect(groupNamesSimilar(a, b)).toBe(true);
      expect(groupNamesSimilar(b, a)).toBe(true);
    });
  }

  for (const [a, b] of DIFFERENT) {
    test(`'${a}' and '${b}' are clearly different, whichever way round`, () => {
      expect(groupNamesSimilar(a, b)).toBe(false);
      expect(groupNamesSimilar(b, a)).toBe(false);
    });
  }

  test('the key drops capitals, accents, punctuation and spaces, and says "and" for an ampersand', () => {
    expect(groupNameKey('Soft Drinks')).toBe('softdrinks');
    expect(groupNameKey('Soft-Drinks')).toBe('softdrinks');
    expect(groupNameKey('  SOFT   drinks ')).toBe('softdrinks');
    expect(groupNameKey('Café')).toBe('cafe');
    expect(groupNameKey('Food & Drinks')).toBe('foodanddrinks');
    expect(groupNameKey('Food&Drinks')).toBe('foodanddrinks');
    expect(groupNameKey('Tea (hot)')).toBe('teahot');
    expect(groupNameKey('7-Up')).toBe('7up');
  });

  test('a name with nothing left after cleaning is not a name, and is never similar to anything', () => {
    for (const empty of ['', '   ', '--', '...', '() !']) {
      expect(groupNameKey(empty), JSON.stringify(empty)).toBe('');
      expect(groupNamesSimilar(empty, empty)).toBe(false);
      expect(groupNamesSimilar(empty, 'Beer')).toBe(false);
    }
    expect(findGroupNameClash('--', [{ id: '1', name: 'Beer', isActive: true }])).toBeNull();
  });

  test('singular keys: one trailing "s" off past three letters, "es" off past four', () => {
    expect(singularKeys('bar')).toEqual(['bar']);
    expect(singularKeys('bars')).toEqual(['bars', 'bar']);
    expect(singularKeys('dishes')).toEqual(['dishes', 'dishe', 'dish']);
    expect(singularKeys('gas')).toEqual(['gas']);
    expect(singularKeys('bees')).toEqual(['bees', 'bee']);
  });

  test('edit distance counts single-letter changes', () => {
    expect(editDistance('beverages', 'beveragez')).toBe(1);
    expect(editDistance('beverages', 'beverage')).toBe(1);
    expect(editDistance('lager', 'larger')).toBe(1);
    expect(editDistance('beer', 'beef')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('same', 'same')).toBe(0);
    expect(editDistance('', 'abc')).toBe(3);
  });

  test('a one-letter slip is similar only when both names are at least six letters long', () => {
    expect(groupNamesSimilar('Spirits', 'Spirats')).toBe(true);          // 7 letters: a typo
    expect(groupNamesSimilar('Wines', 'Wanes')).toBe(false);             // 5 letters: two different words
    expect(groupNamesSimilar('Dairy', 'Daily')).toBe(false);
    expect(groupNamesSimilar('Pastries', 'Pastres')).toBe(true);
  });

  test('the clash found is the most obvious one: the same name before a similar one, a live group before a switched-off one', () => {
    const groups = [
      { id: 'a', name: 'Soft Drink', isActive: false },
      { id: 'b', name: 'Soft Drinks', isActive: true },
      { id: 'c', name: 'soft drinks', isActive: false },
      { id: 'd', name: 'Beer', isActive: true }
    ];
    const same = findGroupNameClash(' SOFT drinks ', groups);
    expect(same?.group.id).toBe('b');
    expect(same?.identical).toBe(true);
    const similar = findGroupNameClash('Softdrinks', groups);
    expect(findGroupNameClash('Soft  drinks', groups)?.identical, 'two spaces inside is not the same text, only the same group').toBe(false);
    expect(similar?.group.id).toBe('b');
    expect(similar?.identical).toBe(false);
    const off = findGroupNameClash('Soft-Drinks', groups.filter((g) => !g.isActive));
    expect(off?.group.isActive).toBe(false);
    expect(findGroupNameClash('Wine', groups)).toBeNull();
    expect(findGroupNameClash('Beers', groups)?.group.id).toBe('d');
  });

  test('renaming a group does not clash with itself', () => {
    const groups = [{ id: 'a', name: 'Soft Drinks', isActive: true }, { id: 'b', name: 'Beer', isActive: true }];
    expect(findGroupNameClash('Soft drinks', groups, 'a')).toBeNull();
    expect(findGroupNameClash('Beers', groups, 'a')?.group.id).toBe('b');
  });
});
