import { useEffect, useMemo, useState } from 'react';
import { units } from '../data/units';
import { useAuth } from '../context/AuthContext';
import { useMultiplayer } from '../context/MultiplayerContext';
import { useUser } from '../context/UserContext';
import type { ArmyConfig, BattleResult } from '../hooks/useGameServer';

const DEMO_POSITIONS = [
  { id: 'knight', suffix: '1', position: { row: 11, col: 2 } },
  { id: 'knight', suffix: '2', position: { row: 11, col: 4 } },
  { id: 'archer', suffix: '1', position: { row: 10, col: 3 } },
  { id: 'horseman', suffix: '1', position: { row: 10, col: 5 } },
  { id: 'dragon', suffix: '1', position: { row: 9, col: 3 } },
];

const buildDemoArmy = (): ArmyConfig => {
  const templateMap = new Map(units.map((unit) => [unit.id, unit]));
  return DEMO_POSITIONS.map(({ id, suffix, position }, index) => {
    const template = templateMap.get(id) ?? units[index % units.length];
    return {
      ...template,
      instanceId: `demo-${id}-${suffix}`,
      team: 'player' as const,
      position: { ...position },
      currentHp: template.hp,
    };
  });
};

export default function DebugNetwork() {
  const { user, signOut } = useAuth();
  const { currentUser } = useUser();
  const [displayedResult, setDisplayedResult] = useState<BattleResult | null>(null);
  const demoArmy = useMemo(() => buildDemoArmy(), []);

  const {
    status,
    users,
    incomingChallenge,
    lastResult,
    userId,
    setArmy,
    challenge,
    respondToChallenge,
  } = useMultiplayer();

  const activeUsername = currentUser?.username ?? user?.email ?? null;

  // Update displayed result when lastResult changes
  if (lastResult && lastResult !== displayedResult) {
    setDisplayedResult(lastResult);
  }

  const handleChallenge = (opponentName: string) => {
    challenge(opponentName);
  };

  const handleAcceptChallenge = () => {
    if (incomingChallenge) {
      respondToChallenge(incomingChallenge, true);
    }
  };

  const handleDeclineChallenge = () => {
    if (incomingChallenge) {
      respondToChallenge(incomingChallenge, false);
    }
  };

  useEffect(() => {
    if (status === 'connected' && activeUsername) {
      setArmy(demoArmy);
    }
  }, [activeUsername, demoArmy, setArmy, status]);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Network Debug Page</h1>

      {/* Connection Section */}
      <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc' }}>
        <h2>Connection</h2>
        <div style={{ marginBottom: '10px' }}>
          <strong>Status:</strong>{' '}
          <span
            style={{
              color:
                status === 'connected' ? 'green' : status === 'connecting' ? 'orange' : 'red',
            }}
          >
            {status.toUpperCase()}
          </span>
        </div>

        {user ? (
          <div>
            <p>
              <strong>Commander:</strong> {currentUser?.username ?? user.email}
            </p>
            {userId && (
              <p>
                <strong>User ID:</strong> {userId}
              </p>
            )}
            <p style={{ color: '#555' }}>
              Multiplayer connects automatically when you are logged in. Launch a Demo Fight or use the
              button below to push the demo army to the server.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setArmy(demoArmy)}
                style={{ padding: '5px 15px' }}
                disabled={status !== 'connected'}
              >
                Use Demo Army
              </button>
              <button onClick={signOut} style={{ padding: '5px 15px' }}>
                Logout
              </button>
            </div>
          </div>
        ) : (
          <p style={{ color: '#666' }}>
            Login through the main UI to establish a multiplayer connection, then revisit this page to
            inspect network traffic.
          </p>
        )}
      </div>

      {/* Online Users Section */}
      {status === 'connected' && (
        <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc' }}>
          <h2>Online Users ({users.length})</h2>
          {users.length === 0 ? (
            <p style={{ color: '#666' }}>No other users online</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {users.map((user) => (
                <div
                  key={user}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px',
                    backgroundColor: user === activeUsername ? '#e8f4f8' : '#f5f5f5',
                  }}
                >
                  <span>
                    <strong>{user}</strong>
                    {user === activeUsername && ' (you)'}
                  </span>
                  {user !== activeUsername && (
                    <button
                      onClick={() => handleChallenge(user)}
                      style={{ padding: '3px 10px' }}
                    >
                      Challenge
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Incoming Challenge Modal */}
      {incomingChallenge && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: '30px',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              maxWidth: '400px',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Challenge Received!</h2>
            <p style={{ fontSize: '18px', marginBottom: '20px' }}>
              <strong>{incomingChallenge}</strong> wants to battle you!
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={handleAcceptChallenge}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >
                Accept
              </button>
              <button
                onClick={handleDeclineChallenge}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Battle Results Section */}
      {displayedResult && (
        <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid #ccc' }}>
          <h2>Last Battle Result</h2>
          <div style={{ marginBottom: '10px' }}>
            <strong>Match ID:</strong> {displayedResult.matchId}
          </div>
          <div style={{ marginBottom: '10px' }}>
            <strong>Winner:</strong>{' '}
            <span
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: displayedResult.winner === 'draw' ? 'gray' : '#4CAF50',
              }}
            >
              Player {displayedResult.winner.toUpperCase()}
            </span>
          </div>
          <div>
            <strong>Timeline:</strong>
            <pre
              style={{
                backgroundColor: '#f5f5f5',
                padding: '10px',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '300px',
              }}
            >
              {JSON.stringify(displayedResult.timeline, null, 2)}
            </pre>
          </div>
          <button
            onClick={() => setDisplayedResult(null)}
            style={{ padding: '5px 15px', marginTop: '10px' }}
          >
            Clear Result
          </button>
        </div>
      )}

      {/* Instructions */}
      <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#f9f9f9' }}>
        <h3>Instructions:</h3>
        <ol style={{ lineHeight: '1.8' }}>
          <li>Login through the main UI (use two tabs with different users to test matchmaking).</li>
          <li>Ensure the status above reads CONNECTED for each tab.</li>
          <li>Use "Save Multiplayer Army" on the Board screen or "Use Demo Army" here to upload your lineup.</li>
          <li>Both sessions will appear in the Online Users list.</li>
          <li>Click "Challenge" next to a user to send them a battle request.</li>
          <li>Accept or decline challenges via the modal and review the streamed battle results below.</li>
        </ol>
      </div>
    </div>
  );
}
