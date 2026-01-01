import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import express from 'express';
import { randomUUID } from 'crypto';
import { ClientToServer, ServerToClient, ArmyConfig, PreviewChange } from './types';
import { runServerBattle, mirrorTimelineForPlayerB } from './runBattle';
import { buildGddUnit, GDD_UNIT_IDS, type GddUnitId } from '../../shared/gddUnits';

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

// Create an Express app for HTTP (needed for CORS preflight)
const app = express();
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);

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
      // Build a new unit from catalog (simplified: just replace type info)
      const newUnitDef = buildGddUnit(change.newPlayerUnitId);
      if (!newUnitDef) {
        throw new Error(`Unit definition ${change.newPlayerUnitId} not found`);
      }
      // Keep position and instanceId, but update unit properties
      Object.assign(unit, newUnitDef);
      unit.instanceId = change.unitInstanceId; // Preserve instance ID
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
