import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PlacedUnit } from '../types';
import type { BattleTickResult } from '../engine/battleEngine';

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

function getWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:4000';
  }

  const { protocol, host, hostname } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//localhost:4000`;
  }

  if (host.includes('.github.dev')) {
    const wsHost = host.replace('-5173', '-4000');
    return `wss://${wsHost}`;
  }

  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${hostname}:4000`;
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

  // WebSocket connection effect
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

    setStatus('connecting');
    let destroyed = false;
    let connectTimeout: number | null = null;

    const establishConnection = () => {
      if (destroyed) {
        return;
      }
      const ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
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
        setStatus('disconnected');
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setStatus('disconnected');
        setUsers([]);
        setUserId(null);
        setCurrentMatchId(null);
        setCurrentRole(null);
      };
    };

    connectTimeout = window.setTimeout(establishConnection, 0);

    return () => {
      destroyed = true;
      if (connectTimeout !== null) {
        window.clearTimeout(connectTimeout);
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
