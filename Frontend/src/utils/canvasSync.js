export const elementKey = (element) =>
  `${element.version ?? 0}:${element.versionNonce ?? 0}:${element.isDeleted ? 1 : 0}`;

export const toMap = (elements) =>
  new Map(
    (elements || [])
      .filter((element) => element?.id)
      .map((element) => [element.id, element])
  );

export function mergeElements(localElements, incomingElements) {
  const merged = toMap(localElements);

  for (const incoming of incomingElements) {
    if (!incoming?.id) continue;

    const current = merged.get(incoming.id);
    if (!current) {
      merged.set(incoming.id, incoming);
      continue;
    }

    const incomingVersion = incoming.version ?? 0;
    const currentVersion = current.version ?? 0;

    if (
      incomingVersion > currentVersion ||
      (incomingVersion === currentVersion &&
        (incoming.versionNonce ?? 0) >= (current.versionNonce ?? 0))
    ) {
      merged.set(incoming.id, incoming);
    }
  }

  return Array.from(merged.values());
}

// Diffs the live scene against what the server already knows.
// Mutates sentKeys/knownElements so repeated calls only produce new deltas.
export function collectChanges(allElements, sentKeys, knownElements) {
  const seen = new Set();
  const changes = [];

  for (const element of allElements) {
    if (!element?.id) continue;
    seen.add(element.id);

    const key = elementKey(element);
    if (sentKeys.get(element.id) !== key) {
      changes.push(element);
      sentKeys.set(element.id, key);
      knownElements.set(element.id, element);
    }
  }

  for (const [id, previous] of knownElements) {
    if (seen.has(id) || previous.isDeleted) continue;

    const tombstone = {
      ...previous,
      isDeleted: true,
      version: (previous.version ?? 0) + 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
    };

    changes.push(tombstone);
    sentKeys.set(id, elementKey(tombstone));
    knownElements.set(id, tombstone);
  }

  return changes;
}
