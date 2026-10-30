/**
 * Linhas de um `tx.execute(sql\`...\`)`. O tipo genérico do Drizzle não expõe
 * o formato do driver; node-postgres e PGlite devolvem ambos `{ rows }`.
 */
export const rowsOf = <T>(result: unknown) => (result as { rows: T[] }).rows
