'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { FaTelegramPlane } from 'react-icons/fa';
import { supabase } from '@/lib/supabase/client';

// Optional: the bot's @username, used for a deep link. Without it we just show
// the command to send.
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

// Mints a one-time code (POST /api/telegram/link) that the user sends to the bot
// as `/link <code>` to bind their Telegram chat to this account.
export default function TelegramLinkCard() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error('Could not generate a code');
      setCode(data.code);
      setExpiresAt(new Date(data.expiresAt));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate a code');
    } finally {
      setLoading(false);
    }
  };

  const command = code ? `/link ${code}` : '';

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center space-x-3 mb-4">
        <FaTelegramPlane className="text-primary text-xl" />
        <h2 className="text-xl font-semibold text-white">Telegram</h2>
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Link the Telegram bot to this account so your plan applies there and your Telegram signals are
        recorded in your verifiable track record. Your daily free allowance is shared between the website
        and Telegram.
      </p>

      {code ? (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Send this to {BOT_USERNAME ? `@${BOT_USERNAME}` : 'the bot'} within 15 minutes
            {expiresAt ? ` (expires ${expiresAt.toLocaleTimeString()})` : ''}:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-background border border-gray-700 rounded-lg px-3 py-2 text-white">
              {command}
            </code>
            <button
              onClick={() => navigator.clipboard?.writeText(command).then(() => toast.success('Copied'))}
              className="btn-secondary px-3 py-2 text-sm"
            >
              Copy
            </button>
          </div>
          {BOT_USERNAME && (
            <a
              href={`https://t.me/${BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-light text-sm inline-block"
            >
              Open the bot in Telegram ↗
            </a>
          )}
        </div>
      ) : (
        <button onClick={generate} disabled={loading} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {loading ? 'Generating…' : 'Generate link code'}
        </button>
      )}
    </div>
  );
}
