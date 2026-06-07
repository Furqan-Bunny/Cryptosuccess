'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { FaNewspaper } from 'react-icons/fa';

interface Brief { date: string; markdown: string; }

// Strip markdown to a short plain-text teaser.
function teaser(md: string, len = 220): string {
  const text = md
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>#-]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  return text.length > len ? `${text.slice(0, len)}…` : text;
}

export default function LatestBrief() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase
      .from('briefs')
      .select('date, markdown')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (mounted && data) setBrief(data as Brief); })
      .then(() => { if (mounted) setLoaded(true); });
    return () => { mounted = false; };
  }, []);

  if (!loaded || !brief) return null;

  return (
    <Link href="/brief" className="card p-6 block hover:border-primary/50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <FaNewspaper className="mr-2 text-primary" /> Daily Market Brief
        </h3>
        <span className="text-xs text-text-secondary">{brief.date}</span>
      </div>
      <p className="text-sm text-text-secondary">{teaser(brief.markdown)}</p>
      <span className="text-primary text-sm mt-3 inline-block">Read the full brief →</span>
    </Link>
  );
}
