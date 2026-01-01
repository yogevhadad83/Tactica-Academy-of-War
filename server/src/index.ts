import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import express from 'express';
import { randomUUID } from 'crypto';
import { ClientToServer, ServerToClient, ArmyConfig, PreviewChange } from './types';
import { runServerBattle, mirrorTimelineForPlayerB } from './runBattle';
import { buildGddUnit, GDD_UNIT_IDS, type GddUnitId } from '../../shared/gddUnits';
import type { Database } from '../../src/types/supabase';
import type { PlacedUnit, Team } from './battleTypes';
import { getSupabaseClient } from './supabaseClient';

interface Client {
  socket: WebSocket;
  userId: string;
  name: string;
  army?: ArmyConfig;
}

interface PreviewMatch {
  matchId: string;
  challengerName: string;
  responderName: string;
  challengerSocket: WebSocket;
  responderSocket: WebSocket;
  boardA: ArmyConfig; // Challenger's board (copy)
  boardB: ArmyConfig; // Responder's board (copy)
  currentTurn: 'A' | 'B'; // Whose turn it is to make a change
  aCommitted: boolean;
  bCommitted: boolean;
}


const PORT = 4000;
const allowedOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const allowedOrigins: Array<string | RegExp> = [
  allowedOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  /^https:\/\/.+\.app\.github\.dev$/
];

// Create an Express app for HTTP (needed for CORS preflight)
const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const match = allowedOrigins.some((allowed) =>
        typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
      );
      if (match) return callback(null, true);
      return callback(new Error(`CORS blocked for origin ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

// Track connected clients
const clientsBySocket = new Map<WebSocket, Client>();
const clientsByName = new Map<string, Client>();

// Track preview matches in-memory
const previewMatchesById = new Map<string, PreviewMatch>();

/**
 * Type guard to check if a string is a valid GddUnitId
 */
function isValidGddUnitId(id: string): id is GddUnitId {
  return GDD_UNIT_IDS.includes(id as GddUnitId);
}

// Helper to send a typed message to a client
function send(socket: WebSocket, message: ServerToClient) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

// Broadcast presence to all authenticated clients
function broadcastPresence() {
  const users = Array.from(clientsByName.keys());
  const presenceMessage: ServerToClient = { type: 'presence', users };
  
  for (const client of clientsBySocket.values()) {
    if (client.name) {
      send(client.socket, presenceMessage);
    }
  }
}

/**
 * Apply a preview change to a board (deep mutation of ArmyConfig)
 */
function applyPreviewChange(board: ArmyConfig, change: PreviewChange): void {
  switch (change.type) {
    case 'move': {
      if (!change.unitInstanceId || !change.newPosition) {
        throw new Error('Move requires unitInstanceId and newPosition');
      }
      const unit = board.find((u) => u.instanceId === change.unitInstanceId);
      if (!unit) {
        throw new Error(`Unit ${change.unitInstanceId} not found`);
      }
      // Check if tile is occupied
      const occupied = board.some(
        (u) =>
          u.instanceId !== change.unitInstanceId &&
          u.position.row === change.newPosition!.row &&
          u.position.col === change.newPosition!.col
      );
      if (occupied) {
        throw new Error('Destination tile is occupied');
      }
      unit.position = { ...change.newPosition };
      break;
    }

    case 'swap': {
      if (!change.unitInstanceId || !change.targetInstanceId) {
        throw new Error('Swap requires unitInstanceId and targetInstanceId');
      }
      const unitA = board.find((u) => u.instanceId === change.unitInstanceId);
      const unitB = board.find((u) => u.instanceId === change.targetInstanceId);
      if (!unitA || !unitB) {
        throw new Error('One or both units not found');
      }
      // Swap positions
      const tempPos = { ...unitA.position };
      unitA.position = { ...unitB.position };
      unitB.position = tempPos;
      break;
    }

    case 'replace': {
      if (!change.unitInstanceId || !change.newPlayerUnitId) {
        throw new Error('Replace requires unitInstanceId and newPlayerUnitId');
      }
      const unit = board.find((u) => u.instanceId === change.unitInstanceId);
      if (!unit) {
        throw new Error(`Unit ${change.unitInstanceId} not found`);
      }
      // Validate that the unit ID is valid
      if (!isValidGddUnitId(change.newPlayerUnitId)) {
        throw new Error(`Invalid unit ID: ${change.newPlayerUnitId}`);
      }

      const newUnitDef = buildGddUnit(change.newPlayerUnitId);
      if (!newUnitDef) {
        throw new Error(`Unit definition ${change.newPlayerUnitId} not found`);
      }

      const prevPosition = { ...unit.position };
      const prevSelectedBehaviors = unit.selectedBehaviors ? [...unit.selectedBehaviors] : undefined;
      // Keep position and instanceId, but update unit properties
      Object.assign(unit, newUnitDef);
      unit.instanceId = change.unitInstanceId; // Preserve instance ID
      unit.position = prevPosition;
      if (prevSelectedBehaviors) unit.selectedBehaviors = prevSelectedBehaviors;
      break;
    }

    case 'edit_behavior': {
      if (!change.unitInstanceId || !change.newBehaviors) {
        throw new Error('Edit behavior requires unitInstanceId and newBehaviors');
      }
      const unit = board.find((u) => u.instanceId === change.unitInstanceId);
      if (!unit) {
        throw new Error(`Unit ${change.unitInstanceId} not found`);
      }
      unit.selectedBehaviors = change.newBehaviors;
      break;
    }

    default:
      throw new Error(`Unknown change type: ${(change as any).type}`);
  }
}

type MatchRow = Database['public']['Tables']['matches']['Row'];
type MatchParticipantRow = Database['public']['Tables']['match_participants']['Row'];
type MatchUnitRow = Database['public']['Tables']['match_units']['Row'];
type MatchTimelineInsert = Database['public']['Tables']['match_timelines']['Insert'];

type PreBattleMove =
  | { kind: 'MOVE'; from: { row: number; col: number }; to: { row: number; col: number }; submittedAt: string }
  | { kind: 'SKIP'; submittedAt: string };

const parsePreBattleMove = (value: unknown): PreBattleMove | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'SKIP' && typeof candidate.submittedAt === 'string') {
    return { kind: 'SKIP', submittedAt: candidate.submittedAt };
  }
  if (candidate.kind !== 'MOVE') return null;
  const from = candidate.from as { row?: number; col?: number } | undefined;
  const to = candidate.to as { row?: number; col?: number } | undefined;
  if (
    from && to &&
    typeof from.row === 'number' && typeof from.col === 'number' &&
    typeof to.row === 'number' && typeof to.col === 'number' &&
    typeof candidate.submittedAt === 'string'
  ) {
    return {
      kind: 'MOVE',
      from: { row: from.row, col: from.col },
      to: { row: to.row, col: to.col },
      submittedAt: candidate.submittedAt,
    };
  }
  return null;
};

const applyMoveIfNeeded = (unit: MatchUnitRow, move: PreBattleMove | null): { row: number; col: number } => {
  if (!move || move.kind !== 'MOVE') {
    return { row: unit.initial_row, col: unit.initial_col };
  }
  const matches = move.from.row === unit.initial_row && move.from.col === unit.initial_col;
  return matches ? { row: move.to.row, col: move.to.col } : { row: unit.initial_row, col: unit.initial_col };
};

  const toPlacedUnit = (row: MatchUnitRow, position: { row: number; col: number }, team: Team): PlacedUnit => {
    const unitId = GDD_UNIT_IDS.includes(row.unit_type_id as GddUnitId)
      ? (row.unit_type_id as GddUnitId)
      : null;
    const template = unitId ? buildGddUnit(unitId) : null;
    return {
      ...(template ?? {
        id: row.unit_type_id,
        name: row.unit_type_id,
        icon: '⚔️',
        cost: 0,
        speed: 1,
        range: 1,
        behaviorOptions: [],
        upgradeOptions: [],
        damage: row.damage,
        defense: row.defense,
        hp: row.hp,
        shield: row.shield,
      }),
      damage: row.damage,
      defense: row.defense,
      hp: row.hp,
      shield: row.shield,
      team,
      position,
      instanceId: row.id,
      currentHp: row.hp,
      currentShield: row.shield,
    } as PlacedUnit;
  };

const buildArmiesFromRows = (
  unitRows: MatchUnitRow[],
  participants: MatchParticipantRow[]
): { armyA: PlacedUnit[]; armyB: PlacedUnit[] } => {
  const participantById = new Map(participants.map((p) => [p.id, p]));

  const armyA: PlacedUnit[] = [];
  const armyB: PlacedUnit[] = [];

  for (const row of unitRows) {
    const participant = participantById.get(row.participant_id);
    if (!participant) continue;
    const move = parsePreBattleMove(participant.pre_battle_adjustments);
    const position = applyMoveIfNeeded(row, move);
    const team: Team = participant.side === 'A' ? 'player' : 'enemy';
    const placed = toPlacedUnit(row, position, team);
    if (participant.side === 'A') {
      armyA.push(placed);
    } else {
      armyB.push(placed);
    }
  }

  return { armyA, armyB };
};

const persistTimeline = async (
  matchId: string,
  winner: 'A' | 'B' | 'draw',
  timelineA: unknown,
  timelineB: unknown
) => {
    const supabase = getSupabaseClient();
    const supabaseAny = supabase as any;
  const startedAt = new Date().toISOString();
  const completedAt = startedAt;

  try {
      await supabaseAny
        .from('match_timelines')
        .upsert({
        match_id: matchId,
        winner_side: winner,
        timeline_a: timelineA,
        timeline_b: timelineB,
        started_at: startedAt,
        completed_at: completedAt,
        } as MatchTimelineInsert, { onConflict: 'match_id' });
  } catch (err) {
    console.error('Failed to persist match timeline:', err);
  }
};

const updateMatchStatusToInProgress = async (matchId: string): Promise<boolean> => {
  const supabase = getSupabaseClient();
  const supabaseAny = supabase as any;
  try {
    const { error } = await supabaseAny
      .from('matches')
      .update({ status: 'IN_PROGRESS' })
      .eq('id', matchId)
      .in('status', ['PENDING', 'PRE_BATTLE', 'IN_PROGRESS']);
    if (error) {
      console.error('Failed to update match status:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to update match status:', err);
    return false;
  }
};

// Helper to detect Supabase auth errors
const isSupabaseAuthError = (error: any): boolean => {
  if (!error) return false;
  const message = error.message || '';
  const status = error.status || 0;
  return (
    message.includes('Invalid API key') ||
    message.includes('Invalid JWT') ||
    message.includes('invalid_api_key') ||
    status === 401 ||
    status === 403
  );
};

app.post('/api/pvp/matches/:matchId/run', async (req, res) => {
  const { matchId } = req.params;
  const supabase = getSupabaseClient();
  const supabaseAny = supabase as any;

  try {
    // Step 1: Check for existing timeline (idempotency)
    const { data: existingTimeline, error: timelineErr } = await supabaseAny
      .from('match_timelines')
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle();

    // Check for auth error on timeline lookup
    if (timelineErr && isSupabaseAuthError(timelineErr)) {
      console.error('[/api/pvp/matches/:matchId/run] Auth error checking timelines:', timelineErr.message);
      return res.status(500).json({ error: 'Supabase authentication failed. Please check server configuration.' });
    }

    // If timeline exists, return it without modifying status
    if (!timelineErr && existingTimeline && existingTimeline.timeline_a && existingTimeline.timeline_b) {
      return res.json({
        matchId,
        winnerSide: existingTimeline.winner_side ?? null,
        timelineA: existingTimeline.timeline_a,
        timelineB: existingTimeline.timeline_b,
      });
    }

    // Step 2: Load match data, participants, and units
    const [matchResult, participantsResult, unitsResult] = await Promise.all([
      supabase.from('matches').select('*').eq('id', matchId).maybeSingle(),
      supabase.from('match_participants').select('*').eq('match_id', matchId),
      supabase.from('match_units').select('*').eq('match_id', matchId),
    ]);

    // Check for auth errors
    if (matchResult.error && isSupabaseAuthError(matchResult.error)) {
      console.error('[/api/pvp/matches/:matchId/run] Auth error fetching match:', matchResult.error.message);
      return res.status(500).json({ error: 'Supabase authentication failed. Please check server configuration.' });
    }
    if (participantsResult.error && isSupabaseAuthError(participantsResult.error)) {
      console.error('[/api/pvp/matches/:matchId/run] Auth error fetching participants:', participantsResult.error.message);
      return res.status(500).json({ error: 'Supabase authentication failed. Please check server configuration.' });
    }
    if (unitsResult.error && isSupabaseAuthError(unitsResult.error)) {
      console.error('[/api/pvp/matches/:matchId/run] Auth error fetching units:', unitsResult.error.message);
      return res.status(500).json({ error: 'Supabase authentication failed. Please check server configuration.' });
    }

    // Handle query errors
    if (matchResult.error || !matchResult.data) {
      return res.status(404).json({ error: `Match ${matchId} not found.` });
    }
    if (participantsResult.error) {
      return res.status(500).json({ error: `Failed to load participants: ${participantsResult.error.message}` });
    }
    if (unitsResult.error) {
      return res.status(500).json({ error: `Failed to load units: ${unitsResult.error.message}` });
    }

    const participants = participantsResult.data as MatchParticipantRow[];
    const unitRows = unitsResult.data as MatchUnitRow[];

    // Validate participants and units
    if (!participants.length) {
      return res.status(400).json({ error: `No participants found for match ${matchId}.` });
    }
    if (!unitRows.length) {
      return res.status(400).json({ error: `No units found for match ${matchId}.` });
    }

    // Step 3: Build armies and run battle
    const { armyA, armyB } = buildArmiesFromRows(unitRows, participants);

    const { winner, timeline } = runServerBattle(armyA, armyB);
    const timelineB = mirrorTimelineForPlayerB(timeline);

    // Step 4: Persist timeline first
    await persistTimeline(matchId, winner, timeline, timelineB);

    // Step 5: Then update match status
    await updateMatchStatusToInProgress(matchId);

    // Step 6: Return with stable response shape
    return res.json({
      matchId,
      winnerSide: winner,
      timelineA: timeline,
      timelineB,
    });
  } catch (error) {
    console.error('Failed to run PvP match on server:', error);
    return res.status(500).json({ error: 'Internal server error while running battle.' });
  }
});

// Validate Supabase env on startup (DEV logging)
const validateSupabaseEnv = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    console.error('[STARTUP] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return false;
  }
  
  // Extract host from URL
  let urlHost = 'unknown';
  try {
    const urlObj = new URL(url);
    urlHost = urlObj.hostname;
  } catch (e) {
    urlHost = 'invalid-url';
  }
  
  // Check if key looks like a JWT (format: header.payload.signature)
  const keyParts = key.split('.');
  const isJwtLike = keyParts.length === 3;
  const keyPreview = `${keyParts[0]?.slice(0, 8) || ''}...`;
  
  console.log(`[STARTUP] Supabase URL host: ${urlHost}`);
  console.log(`[STARTUP] Service role key shape: ${isJwtLike ? 'JWT-like' : 'NOT JWT-like'} (preview: ${keyPreview})`);
  
  return true;
};

validateSupabaseEnv();

// Create WebSocket server, attach to HTTP server
const server = app.listen(PORT, () => {
  console.log(`WebSocket + HTTP server listening on port ${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket: WebSocket) => {
  console.log('New connection established');

  socket.on('message', (data: Buffer) => {
    try {
      const message: ClientToServer = JSON.parse(data.toString());
      console.log('Received message:', message.type);

      switch (message.type) {
        case 'hello': {
          const userId = randomUUID();
          const { name } = message;

          // Check if name is already taken
          if (clientsByName.has(name)) {
            send(socket, {
              type: 'error',
              message: 'Name already taken',
            });
            socket.close();
            return;
          }

          // Register the client
          const client: Client = {
            socket,
            userId,
            name,
          };

          clientsBySocket.set(socket, client);
          clientsByName.set(name, client);

          console.log(`Client registered: ${name} (${userId})`);

          // Send acknowledgment
          send(socket, { type: 'hello_ack', userId });

          // Broadcast updated presence
          broadcastPresence();
          break;
        }

        case 'set_army': {
          const client = clientsBySocket.get(socket);
          if (!client) {
            send(socket, {
              type: 'error',
              message: 'Not authenticated. Send hello first.',
            });
            return;
          }

          client.army = message.army;
          console.log(`Army set for client: ${client.name}`);
          break;
        }

        case 'challenge': {
          const challenger = clientsBySocket.get(socket);
          if (!challenger) {
            send(socket, {
              type: 'error',
              message: 'Not authenticated. Send hello first.',
            });
            return;
          }

          const { opponentName } = message;
          const opponent = clientsByName.get(opponentName);

          if (!opponent) {
            send(socket, {
              type: 'challenge_result',
              success: false,
              message: 'Opponent not online',
            });
            return;
          }

          console.log(`Challenge: ${challenger.name} -> ${opponentName}`);

          // Notify opponent
          send(opponent.socket, {
            type: 'challenge_received',
            from: challenger.name,
          });

          // Notify challenger
          send(socket, {
            type: 'challenge_result',
            success: true,
          });
          break;
        }

        case 'demo_battle': {
          const client = clientsBySocket.get(socket);
          if (!client) {
            send(socket, {
              type: 'error',
              message: 'Not authenticated. Send hello first.',
            });
            return;
          }

          const playerArmy = message.army;
          if (!playerArmy || playerArmy.length === 0) {
            send(socket, {
              type: 'error',
              message: 'You must provide an army for the demo battle.',
            });
            return;
          }

          // Generate fake enemy army: 3-10 knights at random positions in rows 6-11
          // (This simulates Player B placing units in their "player zone" from their perspective)
          // The runServerBattle function will mirror these to rows 0-5 automatically
          const numKnights = Math.floor(Math.random() * 8) + 3; // 3 to 10
          const usedPositions = new Set<string>();
          const fakeEnemyArmy: ArmyConfig = [];
          const knightTemplate = buildGddUnit('knight');

          // Board is 12 rows x 6 cols, with player zones being rows 6-11 (6 rows)
          const BOARD_COLS = 6;
          const PLAYER_ROWS = 6;
          const PLAYER_ZONE_START = 12 - PLAYER_ROWS; // = 6

          for (let i = 0; i < numKnights; i++) {
            let row: number, col: number, posKey: string;
            // Find an unoccupied position in "player zone" (rows 6-11) from fake Player B's perspective
            do {
              row = Math.floor(Math.random() * PLAYER_ROWS) + PLAYER_ZONE_START; // rows 6-11
              col = Math.floor(Math.random() * BOARD_COLS); // cols 0-5 (6 columns total)
              posKey = `${row}-${col}`;
            } while (usedPositions.has(posKey));
            usedPositions.add(posKey);

            fakeEnemyArmy.push({
              ...knightTemplate,
              instanceId: `demo-knight-${i}`,
              position: { row, col },
              team: 'enemy',
              currentHp: knightTemplate.hp,
            });
          }

          console.log(`Demo battle: ${client.name} vs ${numKnights} AI knights`);

          const matchId = randomUUID();

          // Send battle_start to the player
          send(socket, {
            type: 'battle_start',
            matchId,
            youAre: 'A',
            opponentName: 'Demo AI',
          });

          // Run the battle - player is A, fake enemy is B
          const { winner, timeline } = runServerBattle(playerArmy, fakeEnemyArmy);
          console.log(`Demo battle ${matchId}: winner ${winner}`);

          // Send result to the player (as player A, they get canonical timeline)
          send(socket, {
            type: 'battle_result',
            matchId,
            winner,
            battleType: 'demo',
            timeline,
          });
          break;
        }

        case 'challenge_response': {
          const responder = clientsBySocket.get(socket);
          if (!responder) {
            send(socket, {
              type: 'error',
              message: 'Not authenticated. Send hello first.',
            });
            return;
          }

          const { challengerName, accepted } = message;
          const challenger = clientsByName.get(challengerName);

          if (!challenger) {
            send(socket, {
              type: 'error',
              message: 'Challenger not found',
            });
            return;
          }

          if (!accepted) {
            console.log(
              `Challenge declined: ${challengerName} <- ${responder.name}`
            );
            send(challenger.socket, {
              type: 'challenge_result',
              success: false,
              message: 'Challenge declined',
            });
            return;
          }

          const challengerArmy = challenger.army;
          const responderArmy = responder.army;

          // Check if both players have armies set
          if (!challengerArmy || !responderArmy) {
            send(socket, {
              type: 'error',
              message: 'Both players must set their armies',
            });
            send(challenger.socket, {
              type: 'error',
              message: 'Both players must set their armies',
            });
            return;
          }

          console.log(
            `Challenge accepted: ${challengerName} vs ${responder.name}`
          );

          // Generate match ID
          const matchId = randomUUID();

          // Create preview match in-memory
          const previewMatch: PreviewMatch = {
            matchId,
            challengerName: challenger.name,
            responderName: responder.name,
            challengerSocket: challenger.socket,
            responderSocket: responder.socket,
            boardA: JSON.parse(JSON.stringify(challengerArmy)), // Deep clone
            boardB: JSON.parse(JSON.stringify(responderArmy)), // Deep clone
            currentTurn: 'A', // Challenger goes first
            aCommitted: false,
            bCommitted: false,
          };
          previewMatchesById.set(matchId, previewMatch);

          // Send preview_start to both players
          send(challenger.socket, {
            type: 'preview_start',
            matchId,
            youAre: 'A',
            opponentName: responder.name,
            yourBoard: previewMatch.boardA,
            opponentBoard: previewMatch.boardB,
            turn: 'A',
          });

          send(responder.socket, {
            type: 'preview_start',
            matchId,
            youAre: 'B',
            opponentName: challenger.name,
            yourBoard: previewMatch.boardB,
            opponentBoard: previewMatch.boardA,
            turn: 'A',
          });

          console.log(`Preview match ${matchId} created: ${challengerName} (A) vs ${responder.name} (B)`);
          break;
        }

        case 'preview_change': {
          const player = clientsBySocket.get(socket);
          if (!player) {
            send(socket, {
              type: 'error',
              message: 'Not authenticated. Send hello first.',
            });
            return;
          }

          const { matchId, change } = message;
          const previewMatch = previewMatchesById.get(matchId);

          if (!previewMatch) {
            send(socket, {
              type: 'error',
              message: 'Preview match not found',
            });
            return;
          }

          // Determine if this is player A or B
          const isPlayerA = player.socket === previewMatch.challengerSocket;
          const playerRole = isPlayerA ? 'A' : 'B';

          // Check if it's this player's turn
          if (previewMatch.currentTurn !== playerRole) {
            send(socket, {
              type: 'error',
              message: 'Not your turn',
            });
            return;
          }

          // Apply the change to the appropriate board
          const boardToModify = isPlayerA ? previewMatch.boardA : previewMatch.boardB;

          try {
            applyPreviewChange(boardToModify, change);
          } catch (error) {
            console.error('Failed to apply preview change:', error);
            send(socket, {
              type: 'error',
              message: `Invalid change: ${error instanceof Error ? error.message : 'unknown error'}`,
            });
            return;
          }

          // Mark player as committed
          if (isPlayerA) {
            previewMatch.aCommitted = true;
          } else {
            previewMatch.bCommitted = true;
          }

          // Switch turn
          previewMatch.currentTurn = isPlayerA ? 'B' : 'A';

          // Notify both players of the update
          send(previewMatch.challengerSocket, {
            type: 'preview_update',
            matchId,
            turn: previewMatch.currentTurn,
            updatedBoard: isPlayerA ? previewMatch.boardA : previewMatch.boardB,
            side: isPlayerA ? 'yours' : 'opponent',
          });

          send(previewMatch.responderSocket, {
            type: 'preview_update',
            matchId,
            turn: previewMatch.currentTurn,
            updatedBoard: isPlayerA ? previewMatch.boardA : previewMatch.boardB,
            side: isPlayerA ? 'opponent' : 'yours',
          });

          // Notify of commitment
          send(previewMatch.challengerSocket, {
            type: 'preview_committed',
            matchId,
            side: isPlayerA ? 'yours' : 'opponent',
          });

          send(previewMatch.responderSocket, {
            type: 'preview_committed',
            matchId,
            side: isPlayerA ? 'opponent' : 'yours',
          });

          // Check if both have committed
          if (previewMatch.aCommitted && previewMatch.bCommitted) {
            console.log(`Preview match ${matchId} complete. Starting battle...`);

            // Remove preview match
            previewMatchesById.delete(matchId);

            // Run battle with modified boards
            const { winner, timeline } = runServerBattle(previewMatch.boardA, previewMatch.boardB);
            console.log(`Battle ${matchId}: winner ${winner}`);

            // Send battle results to both players
            const battleResultA: ServerToClient = {
              type: 'battle_result',
              matchId,
              winner,
              battleType: 'pvp',
              timeline,
            };
            const battleResultB: ServerToClient = {
              type: 'battle_result',
              matchId,
              winner,
              battleType: 'pvp',
              timeline: mirrorTimelineForPlayerB(timeline),
            };

            send(previewMatch.challengerSocket, battleResultA);
            send(previewMatch.responderSocket, battleResultB);
          }
          break;
        }

        default:
          send(socket, {
            type: 'error',
            message: 'Unknown message type',
          });
      }
    } catch (error) {
      console.error('Error processing message:', error);
      send(socket, {
        type: 'error',
        message: 'Invalid message format',
      });
    }
  });

  socket.on('close', () => {
    const client = clientsBySocket.get(socket);
    if (client) {
      console.log(`Client disconnected: ${client.name} (${client.userId})`);
      clientsBySocket.delete(socket);
      clientsByName.delete(client.name);
      broadcastPresence();
    } else {
      console.log('Unauthenticated client disconnected');
    }
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
