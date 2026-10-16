// The bot's command catalogue — one source of truth for the /help text, the
// Telegram command menu (setMyCommands) and the group-chat policy. Channel-
// neutral: a WhatsApp adapter can render the same list as plain text.

export interface BotCommand {
  command: string;
  description: string; // <= 256 chars (Telegram menu limit)
  /** Safe to answer in a group chat. Everything else is private-chat only. */
  groupSafe: boolean;
}

export const BOT_COMMANDS: BotCommand[] = [
  { command: 'start', description: 'Intro & how the honest coach works', groupSafe: true },
  { command: 'signal', description: 'Honest read on a coin, e.g. /signal BTC', groupSafe: false },
  { command: 'verify', description: 'Our provable on-chain track record', groupSafe: true },
  { command: 'link', description: 'Connect your CryptoSuccess account', groupSafe: false },
  { command: 'risk', description: 'Your risk level: /risk low | medium | high', groupSafe: false },
  { command: 'coins', description: 'Your coins, e.g. /coins BTC ETH SOL', groupSafe: false },
  { command: 'alerts', description: 'Daily read on your coins (Pro): /alerts on | off', groupSafe: false },
  { command: 'settings', description: 'Show your risk level, coins and alerts', groupSafe: false },
  { command: 'subscribe', description: 'Go Pro (unlimited signals)', groupSafe: true },
  { command: 'help', description: 'All commands', groupSafe: true },
];

const BY_NAME = new Map(BOT_COMMANDS.map(c => [c.command, c]));

/** Look up a command by its bare name ("signal", not "/signal"). */
export function findCommand(name: string): BotCommand | undefined {
  return BY_NAME.get(name);
}
