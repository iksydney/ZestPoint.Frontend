/**
 * How a table is worded wherever a person reads it: "Table 4". A table that is already named "Table 4" (the Tables screen's "Add several" makes them) is not given the word twice, and
 * "Table 4", "table 4" and "Table4" all read as they are. Only a name that starts with the word Table counts, so a table named "Tablet 3" reads "Table Tablet 3". The server (`TableWording`)
 * and the phone (`tableWording`) use the same rule (FND-121).
 */
export function tableWording(name: string): string {
  const n = name.trim();
  return /^table(?![a-z])/i.test(n) ? n : `Table ${n}`;
}
