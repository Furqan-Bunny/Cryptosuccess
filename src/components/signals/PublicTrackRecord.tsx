'use client';

import { useEffect, useState } from 'react';
import type { TrackRecordSummary } from '@/lib/track-record-summary';
import { MIN_SAMPLE_FOR_WIN_RATE } from '@/lib/track-record-summary';

const EXPLORER = process.env.NEXT_PUBLIC_ANCHOR_EXPLORER_URL;

// Live, logged-out view of the anchored record (aggregates only), shown on
// /verify so the "check the record first" promise has something to check.
export default function PublicTrackRecord() {
  const [summary, setSummary] = useState<TrackRecordSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let mounted = true;
    fetch('/api/track-record')
      .then(r => r.json())
      .then(data => {
        if (!mounted) return;
        if (data?.available && data.summary) {
          setSummary(data.summary as TrackRecordSummary);
          setState('ready');
        } else {
          setState('error');
        }
      })
      .catch(() => { if (mounted) setState('error'); });
    return () => { mounted = false; };
  }, []);

  return (
    <section className="card p-6 mb-8" aria-labelledby="public-record-heading">
      <h2 id="public-record-heading" className="text-lg font-semibold text-white mb-1">The live record so far</h2>
      <p className="text-xs text-text-secondary mb-4">
        Every scored signal from the website and from linked Telegram accounts, once its day has
        been anchored. Wins and losses count the same way: BUY and SELL calls only (HOLD is a
        stay-out call and is not scored as a win or loss).
      </p>

      {state === 'loading' && <p className="text-text-secondary text-sm">Loading the record…</p>}
      {state === 'error' && (
        <p className="text-text-secondary text-sm">The record summary could not be loaded right now. Please try again later.</p>
      )}

      {state === 'ready' && summary && (
        summary.anchoredSignals === 0 ? (
          <p className="text-text-secondary text-sm">
            No day has been anchored yet. Signals are scored 24h after they are made, and each
            day&apos;s scored results are anchored after that day ends (UTC).
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Stat label="Anchored signals" value={summary.anchoredSignals.toLocaleString()} />
              <Stat label="Wins" value={summary.wins.toLocaleString()} />
              <Stat label="Losses" value={summary.losses.toLocaleString()} />
              <Stat
                label="Win rate"
                value={summary.winRate == null ? '—' : `${summary.winRate.toFixed(1)}%`}
              />
            </div>
            {summary.smallSample && (
              <p className="text-xs text-yellow-300/80 mb-3">
                Fewer than {MIN_SAMPLE_FOR_WIN_RATE} scored BUY/SELL calls so far. A win rate on a
                sample this small says very little.
              </p>
            )}
            <p className="text-xs text-text-secondary mb-4">
              {summary.anchoredDays} day{summary.anchoredDays === 1 ? '' : 's'} anchored
              {summary.firstDay && summary.lastDay ? ` (${summary.firstDay} to ${summary.lastDay})` : ''},{' '}
              {summary.confirmedDays} confirmed on-chain. A day whose root is stored but not yet
              sent is still provable off-chain.
            </p>

            {summary.recent.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-secondary text-xs">
                      <th className="py-1 pr-3 font-normal">Day (UTC)</th>
                      <th className="py-1 pr-3 font-normal">Signals</th>
                      <th className="py-1 font-normal">On-chain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recent.map(d => (
                      <tr key={d.day} className="border-t border-gray-800">
                        <td className="py-1 pr-3 text-white">{d.day}</td>
                        <td className="py-1 pr-3 text-white">{d.leafCount}</td>
                        <td className="py-1">
                          {d.onChain && d.txHash ? (
                            EXPLORER ? (
                              <a
                                href={`${EXPLORER}/tx/${d.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary-light"
                              >
                                Confirmed ↗
                              </a>
                            ) : (
                              <span className="text-green-400">Confirmed</span>
                            )
                          ) : (
                            <span className="text-text-secondary">Root stored, awaiting chain</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background rounded-lg p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
