import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

// Seasoned-analyst persona + honesty rules. Kept stable so it can be prompt-cached.
const SYSTEM_PROMPT = `You are a seasoned cryptocurrency trading analyst. You are given a structured snapshot of one coin: its quantitative signal, technical indicators, market regime, market sentiment, key levels, and a risk/reward plan. Reason over ALL of it the way a disciplined human analyst would and return a single structured judgement via the emit_analysis tool.

Hard rules:
- You are NOT a price oracle. Short-term crypto direction is close to unpredictable; even good analysts are right ~50-55% of the time and make money through risk management, not accuracy. Calibrate accordingly.
- NEVER use words like "guaranteed", "will", "certain", "definitely", or promise profit. Use measured language ("leans", "suggests", "favors").
- Weigh the evidence; you MAY disagree with the quantitative signal — set agreesWithQuant accordingly and explain why.
- conviction reflects how aligned the evidence is (low = mixed/conflicting, high = strongly aligned). Default to low/medium when signals conflict or the regime is choppy.
- Be specific and concise. thesis: 2-3 sentences. bullish/bearish: short factual bullet strings (may be empty). risk: one sentence on position sizing / what to watch. invalidation: the price level or condition that would prove the idea wrong.
- This is analysis, not financial advice.`;

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'emit_analysis',
  description: 'Return your structured analysis of this trade setup.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
      conviction: { type: 'string', enum: ['low', 'medium', 'high'] },
      agreesWithQuant: { type: 'boolean' },
      thesis: { type: 'string' },
      bullish: { type: 'array', items: { type: 'string' } },
      bearish: { type: 'array', items: { type: 'string' } },
      risk: { type: 'string' },
      invalidation: { type: 'string' },
    },
    required: ['verdict', 'conviction', 'agreesWithQuant', 'thesis', 'bullish', 'bearish', 'risk', 'invalidation'],
  },
};

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Graceful: the client shows the quant report without the analyst layer.
    return NextResponse.json({ available: false, reason: 'not_configured' });
  }

  try {
    const data = await request.json();
    const userContent = JSON.stringify(data, null, 2);

    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: 'tool', name: 'emit_analysis' },
      messages: [
        {
          role: 'user',
          content: `Analyze this trade setup and call emit_analysis:\n\n${userContent}`,
        },
      ],
    });

    const block = response.content.find(b => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      return NextResponse.json({ available: false, reason: 'no_output' }, { status: 502 });
    }

    return NextResponse.json({ available: true, analysis: block.input });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`AI analyst API error ${error.status}:`, error.message);
    } else {
      console.error('AI analyst error:', error);
    }
    return NextResponse.json({ available: false, reason: 'error' }, { status: 502 });
  }
}
