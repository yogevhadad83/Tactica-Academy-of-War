import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { ClientToServer, ServerToClient, ArmyConfig } from './types';
import { runServerBattle, mirrorTimelineForPlayerB } from './runBattle';

interface Client {
  socket: WebSocket;
  userId: string;
  name: string;
  army?: ArmyConfig;
}

const PORT = 4000;

// Track connected clients
const clientsBySocket = new Map<WebSocket, Client>();
const clientsByName = new Map<string, Client>();

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

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server listening on port ${PORT}`);

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

          for (let i = 0; i < numKnights; i++) {
            let row: number, col: number, posKey: string;
            // Find an unoccupied position in "player zone" (rows 6-11) from fake Player B's perspective
            do {
              row = Math.floor(Math.random() * 6) + 6; // rows 6-11
              col = Math.floor(Math.random() * 12); // cols 0-11
              posKey = `${row}-${col}`;
            } while (usedPositions.has(posKey));
            usedPositions.add(posKey);

            fakeEnemyArmy.push({
              instanceId: `demo-knight-${i}`,
              id: 'knight',
              name: 'Knight',
              icon: '🗡️',
              cost: 85,
              hp: 190,
              damage: 32,
              defense: 16,
              speed: 8,
              range: 1,
              position: { row, col },
              team: 'enemy',
              currentHp: 190,
              behaviorOptions: [],
              upgradeOptions: [],
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

          // Send battle_start to both players
          send(challenger.socket, {
            type: 'battle_start',
            matchId,
            youAre: 'A',
            opponentName: responder.name,
          });

          send(responder.socket, {
            type: 'battle_start',
            matchId,
            youAre: 'B',
            opponentName: challenger.name,
          });

          const { winner, timeline } = runServerBattle(challengerArmy, responderArmy);
          console.log(`Battle ${matchId}: winner ${winner}`);

          // Send per-player timelines: A gets canonical, B gets mirrored
          const battleResultA: ServerToClient = {
            type: 'battle_result',
            matchId,
            winner,
            timeline,
          };
          const battleResultB: ServerToClient = {
            type: 'battle_result',
            matchId,
            winner,
            timeline: mirrorTimelineForPlayerB(timeline),
          };

          send(challenger.socket, battleResultA);
          send(responder.socket, battleResultB);
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
