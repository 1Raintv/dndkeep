/** v2.734 — validate drafts before writing; never truncate fractional dimensions. */
export function validateSceneDimensions(grid: number, width: number, height: number): string | null {
  for(const [label,value,min,max,unit] of [
    ['Grid size',grid,10,500,'pixels'],
    ['Width',width,1,200,'cells'],
    ['Height',height,1,200,'cells'],
  ] as const) {
    if(!Number.isInteger(value) || value<min || value>max) {
      return `${label} must be a whole number between ${min} and ${max} ${unit}.`;
    }
  }
  return null;
}
