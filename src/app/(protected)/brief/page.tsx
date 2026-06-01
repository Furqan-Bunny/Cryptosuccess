'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebase';
import ReactMarkdown from 'react-markdown';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { FaNewspaper } from 'react-icons/fa';

interface Brief { date: string; markdown: string; }

export default function BriefPage() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'briefs'), orderBy('date', 'desc'), limit(1)));
        if (mounted && !snap.empty) setBrief(snap.docs[0].data() as Brief);
      } catch (e) {
        console.error('Error loading brief:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <div className="bg-surface border-b border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
            <FaNewspaper className="mr-3 text-primary" /> Daily Market Brief
          </h1>
          <p className="text-text-secondary">AI-researched market overview, refreshed each morning</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {loading ? (
          <div className="flex justify-center py-20"><LoadingSpinner size="large" /></div>
        ) : !brief ? (
          <div className="card p-12 text-center">
            <FaNewspaper className="text-5xl text-gray-600 mb-4 mx-auto" />
            <p className="text-text-secondary">Today&apos;s brief isn&apos;t ready yet — it&apos;s generated automatically each morning.</p>
          </div>
        ) : (
          <div className="card p-8">
            <p className="text-sm text-text-secondary mb-4">{brief.date}</p>
            <div className="prose prose-invert max-w-none prose-headings:text-white prose-p:text-text-secondary prose-li:text-text-secondary prose-strong:text-white">
              <ReactMarkdown>{brief.markdown}</ReactMarkdown>
            </div>
            <p className="text-xs text-text-secondary mt-6 pt-4 border-t border-gray-800">
              AI-generated market commentary, not financial advice.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
