export const toDbUnitTypeId = (unitTypeId: string): string => unitTypeId.toUpperCase();

export const fromDbUnitTypeId = (unitTypeId: string): string => unitTypeId.toLowerCase();

export const isKnownUnitType = (unitTypeId: string, knownIds: Set<string>): boolean =>
  knownIds.has(unitTypeId.toLowerCase());
