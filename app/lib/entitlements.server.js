// Entitlement slot registry. Byte-identical twin of src/shared/entitlements.js in trovarcis-sender.
// Append only. Never renumber, never reuse a retired slot.
// A renumber silently regrants the wrong capability to every key already in the field.

export const ENTITLEMENTS = {
  sender: 0
};

export function toMask(names) {
  return names.reduce((mask, name) => {
    const slot = ENTITLEMENTS[name];
    if (slot === undefined) throw new Error(`unknown entitlement: ${name}`);
    return mask | (1 << slot);
  }, 0) >>> 0;
}

export function fromMask(mask) {
  return Object.entries(ENTITLEMENTS)
    .filter(([, slot]) => (mask & (1 << slot)) !== 0)
    .map(([name]) => name);
}

export function has(mask, name) {
  const slot = ENTITLEMENTS[name];
  return slot !== undefined && (mask & (1 << slot)) !== 0;
}
