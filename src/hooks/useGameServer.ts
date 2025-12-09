import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PlacedUnit } from '../types';
import type { BattleTickResult } from '../engine/battleEngine';
import { buildWsUrl } from '../config/api';

// Types duplicated from server - will be unified later
export type ArmyConfig = PlacedUnit[];

type ClientToServer =
  | { type: 'hello'; name: string }
  | { type: 'set_army'; army: ArmyConfig }
  | { type: 'challenge'; opponentName: string }
  | { type: 'challenge_response'; challengerName: string; accepted: boolean }
  | { type: 'demo_battle'; army: ArmyConfig };

export type MatchRole = 'A' | 'B';

type ServerToClient =
  | { type: 'hello_ack'; userId: string }
  | { type: 'presence'; users: string[] }
  | { type: 'error'; message: string }
  | { type: 'challenge_received'; from: string }
  | { type: 'challenge_result'; success: boolean; message?: string }
  | {
      type: 'battle_start';
      matchId: string;
      youAre: 'A' | 'B';
      opponentName: string;
    }
  | {
      type: 'battle_result';
      matchId: string;
      winner: 'A' | 'B' | 'draw';
      timeline?: BattleTickResult[];
    };

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface BattleResult {
  matchId: string;
  winner: 'A' | 'B' | 'draw';
  timeline?: BattleTickResult[];
}

export function useGameServer(username: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [users, setUsers] = useState<string[]>([]);
  const [incomingChallenge, setIncomingChallenge] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BattleResult | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<MatchRole | null>(null);

  // Send message helper
  const sendMessage = useCallback((message: ClientToServer) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }, []);

  // API functions
  const setArmy = useCallback(
    (armyConfig: ArmyConfig) => {
      sendMessage({ type: 'set_army', army: armyConfig });
    },
    [sendMessage]
  );

  const challenge = useCallback(
    (opponentName: string) => {
      sendMessage({ type: 'challenge', opponentName });
    },
    [sendMessage]
  );

  const respondToChallenge = useCallback(
    (challengerName: string, accepted: boolean) => {
      sendMessage({ type: 'challenge_response', challengerName, accepted });
      // Clear incoming challenge after responding
      setIncomingChallenge(null);
    },
    [sendMessage]
  );

  const startDemoBattle = useCallback(
    (armyConfig: ArmyConfig) => {
      sendMessage({ type: 'demo_battle', army: armyConfig });
    },
    [sendMessage]
  );

  // WebSocket connection effect with auto-reconnect
  useEffect(() => {
    if (!username) {
      // No username, stay disconnected
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setStatus('disconnected');
      setUsers([]);
      setIncomingChallenge(null);
      setUserId(null);
      setCurrentMatchId(null);
      setCurrentRole(null);
      return;
    }

    let destroyed = false;
    let reconnectTimeout: number | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
    const INITIAL_RECONNECT_DELAY = 1000; // 1 second initial delay

    const calculateReconnectDelay = () => {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
        MAX_RECONNECT_DELAY
      );
      return delay;
    };

    const establishConnection = () => {
      if (destroyed) {
        return;
      }

      setStatus('connecting');
      console.log(`WebSocket connecting... (attempt ${reconnectAttempts + 1})`);

      const ws = new WebSocket(buildWsUrl('/'));
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0; // Reset on successful connection
        ws.send(JSON.stringify({ type: 'hello', name: username }));
      };

      ws.onmessage = (event) => {
        try {
          const message: ServerToClient = JSON.parse(event.data);
          console.log('Received message:', message);

          switch (message.type) {
            case 'hello_ack':
              setUserId(message.userId);
              setStatus('connected');
              console.log('Authenticated with userId:', message.userId);
              break;

            case 'presence':
              setUsers(message.users);
              console.log('Online users:', message.users);
              break;

            case 'error':
              console.error('Server error:', message.message);
              alert(`Server error: ${message.message}`);
              break;

            case 'challenge_received':
              setIncomingChallenge(message.from);
              console.log('Challenge received from:', message.from);
              break;

            case 'challenge_result':
              if (message.success) {
                console.log('Challenge sent successfully');
              } else {
                console.log('Challenge failed:', message.message);
                alert(`Challenge failed: ${message.message}`);
              }
              break;

            case 'battle_start':
              console.log('Battle starting:', message);
              setCurrentMatchId(message.matchId);
              setCurrentRole(message.youAre);
              // Battle starts silently - no alert
              console.log(
                `Battle starting! You are player ${message.youAre} vs ${message.opponentName}`
              );
              break;

            case 'battle_result':
              console.log('Battle result:', message);
              setLastResult(message);
              setCurrentMatchId(message.matchId);
              break;

            default:
              console.warn('Unknown message type:', message);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.code, event.reason);
        setStatus('disconnected');
        setUsers([]);
        setUserId(null);
        
        // Don't clear match state on disconnect - user might be in a battle
        // setCurrentMatchId(null);
        // setCurrentRole(null);

        // Attempt to reconnect unless the component is being destroyed
        if (!destroyed && wsRef.current === ws) {
          wsRef.current = null;
          const delay = calculateReconnectDelay();
          console.log(`Reconnecting in ${delay}ms...`);
          reconnectAttempts++;
          reconnectTimeout = window.setTimeout(establishConnection, delay);
        }
      };
    };

    // Initial connection
    establishConnection();

    return () => {
      destroyed = true;
      if (reconnectTimeout !== null) {
        window.clearTimeout(reconnectTimeout);
      }
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }
    };
  }, [username]);

  return useMemo(
    () => ({
      status,
      users,
      incomingChallenge,
      lastResult,
      userId,
      setArmy,
      challenge,
      respondToChallenge,
      startDemoBattle,
      currentMatchId,
      currentRole,
    }),
    [
      status,
      users,
      incomingChallenge,
      lastResult,
      userId,
      setArmy,
      challenge,
      respondToChallenge,
      startDemoBattle,
      currentMatchId,
      currentRole,
    ]
  );
}
