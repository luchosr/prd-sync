// Managed label namespace (design §5.3, §10). `desired.ts` and `plan.ts`
// both need `ORPHAN_LABEL` to compute the union-preserving label set; kept
// here (not duplicated) so both modules read the exact same literal.
export const DEFAULT_SYNC_LABEL = "prd-sync";
export const ORPHAN_LABEL = "prd-sync:orphan";
