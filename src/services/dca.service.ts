import { supabase } from '@/lib/supabase/client';

// Simulated dollar-cost-averaging schedules. Execution (recording simulated
// buys) is handled server-side by /api/dca/run.

export type DcaCadence = 'daily' | 'weekly';

export interface DcaSchedule {
  id?: string;
  userId: string;
  symbol: string;
  amountUsd: number;
  cadence: DcaCadence;
  active: boolean;
  nextRunAt: string | Date;
  lastRunAt?: string | Date;
  createdAt: string | Date;
}

export function cadenceMs(cadence: DcaCadence): number {
  return cadence === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
}

function mapRow(row: any): DcaSchedule {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    amountUsd: Number(row.amount_usd),
    cadence: row.cadence,
    active: row.active,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at ?? undefined,
    createdAt: row.created_at,
  };
}

class DcaService {
  async createSchedule(
    userId: string,
    input: { symbol: string; amountUsd: number; cadence: DcaCadence }
  ): Promise<string> {
    const nextRunAt = new Date(Date.now() + cadenceMs(input.cadence)).toISOString();
    const { data, error } = await supabase
      .from('dca_schedules')
      .insert({
        user_id: userId,
        symbol: input.symbol.toUpperCase(),
        amount_usd: input.amountUsd,
        cadence: input.cadence,
        active: true,
        next_run_at: nextRunAt,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  async listSchedules(userId: string): Promise<DcaSchedule[]> {
    const { data, error } = await supabase
      .from('dca_schedules')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await supabase.from('dca_schedules').update({ active }).eq('id', id);
  }

  async deleteSchedule(id: string): Promise<void> {
    await supabase.from('dca_schedules').delete().eq('id', id);
  }
}

export const dcaService = new DcaService();
