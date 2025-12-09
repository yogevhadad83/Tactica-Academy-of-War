import type { Unit } from '../types';
import { GDD_UNITS, type GddUnitId, buildGddUnit } from '../../shared/gddUnits';

// Export canonical GDD-backed unit templates
export const units: Unit[] = GDD_UNITS as Unit[];

// Helper to fetch a single template by id (typed)
export const getUnitById = (id: GddUnitId): Unit => buildGddUnit(id) as Unit;
