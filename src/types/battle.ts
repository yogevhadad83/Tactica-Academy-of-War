import type { Position } from '.';

export type DemoState = 'idle' | 'countdown' | 'running' | 'finished';

export type AttackType = 'melee' | 'ranged';

export interface HitEvent {
	id: string;
	attackerId: string;
	attackerTeam: 'player' | 'enemy';
	attackerPosition: Position;
	targetId?: string;
	targetPosition: Position;
	attackType: AttackType;
	didKill: boolean;
}
