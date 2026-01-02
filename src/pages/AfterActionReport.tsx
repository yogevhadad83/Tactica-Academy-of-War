import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './AfterActionReport.css';
import { fetchMatchBundle, type MatchBundle } from '../lib/pvp';
import { useMatchTimeline } from '../hooks/useMatchTimeline';
import type { WinnerSide } from '../types/supabase';

const mapWinnerLabel = (winnerSide: WinnerSide | null, bundle: MatchBundle | null) => {
  if (!winnerSide || winnerSide === 'draw') return 'Draw';
  const participant = bundle?.participants.find((p) => p.side === winnerSide);
  return participant?.display_name ?? `Side ${winnerSide}`;
};

const describeOutcome = (winnerSide: WinnerSide | null) => {
  if (!winnerSide) return 'Pending official result';
  if (winnerSide === 'draw') return 'Stalemate recorded';
  return winnerSide === 'A' ? 'Challenger prevailed' : 'Defender prevailed';
};

const AfterActionReport = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<MatchBundle | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const { timelineA, timelineB, winnerSide, loading: timelineLoading, error: timelineError, refresh } = useMatchTimeline(matchId);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    setBundleError(null);
    fetchMatchBundle(matchId)
      .then((data) => {
        if (cancelled) return;
        setBundle(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setBundleError(err instanceof Error ? err.message : 'Failed to load match.');
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const winnerLabel = useMemo(() => mapWinnerLabel(winnerSide, bundle), [bundle, winnerSide]);

  const viewerTimeline = useMemo(() => timelineA ?? timelineB ?? null, [timelineA, timelineB]);
  const roundCount = useMemo(() => Math.max(0, (viewerTimeline?.length ?? 1) - 1), [viewerTimeline]);

  const summaryLines = useMemo(() => {
    const lines: string[] = [];
    lines.push(describeOutcome(winnerSide));
    lines.push(`${roundCount} rounds recorded`);
    if (bundle?.match?.created_at) {
      lines.push(`Engagement logged ${new Date(bundle.match.created_at).toLocaleString()}`);
    }
    return lines;
  }, [bundle, roundCount, winnerSide]);

  const handleBack = () => navigate('/academy');
  const handleReplay = () => {
    if (!matchId) return;
    navigate(`/battle/${matchId}`);
  };

  return (
    <div className="aar-shell">
      <div className="aar-card" role="main">
        <p className="aar-kicker">After-Action Report</p>
        <h1>Match {matchId?.slice(0, 8)}...</h1>
        {(bundleError || timelineError) && <div className="aar-error">{bundleError ?? timelineError}</div>}
        {(timelineLoading || !viewerTimeline) && !timelineError && (
          <p className="aar-loading" aria-live="polite">Retrieving battle record...</p>
        )}

        <div className="aar-meta">
          <div className="aar-tile">
            <strong>Outcome</strong>
            <p>{winnerLabel}</p>
          </div>
          <div className="aar-tile">
            <strong>Rounds</strong>
            <p>{roundCount}</p>
          </div>
          <div className="aar-tile">
            <strong>Record</strong>
            <p>{describeOutcome(winnerSide)}</p>
          </div>
        </div>

        <div className="aar-summary" aria-label="Summary">
          <ul>
            {summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="aar-actions">
          <button type="button" className="aar-btn primary" onClick={handleReplay}>
            Review Battle Theater
          </button>
          <button type="button" className="aar-btn secondary" onClick={refresh}>
            Refresh Report
          </button>
          <button type="button" className="aar-btn" onClick={handleBack}>
            Back to Academy
          </button>
        </div>
      </div>
    </div>
  );
};

export default AfterActionReport;
