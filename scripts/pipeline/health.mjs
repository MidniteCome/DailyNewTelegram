export function mergeHealth(...lists) {
  return lists.flat().filter(Boolean);
}
