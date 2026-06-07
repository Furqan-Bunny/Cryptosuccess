import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-09-30.clover',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = headers().get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe signature' },
        { status: 400 }
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    const db = createServiceClient();

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId || session.client_reference_id;

        if (userId) {
          await db
            .from('profiles')
            .update({
              subscription_status: 'pro',
              customer_id: session.customer as string,
              plan_id: session.subscription as string,
              current_period_end: null, // set by subscription.updated
              signals_used_today: 0,
              last_reset_date: new Date().toISOString(),
            })
            .eq('id', userId);
          console.log(`Subscription activated for user: ${userId}`);
        } else {
          console.error('No userId found in checkout session metadata');
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (userId) {
          const status = subscription.status === 'active' ? 'pro' : 'free';
          await db
            .from('profiles')
            .update({
              subscription_status: status,
              current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
            })
            .eq('id', userId);
          console.log(`Subscription updated for user: ${userId}, status: ${status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (userId) {
          await db
            .from('profiles')
            .update({ subscription_status: 'free', plan_id: null, current_period_end: null })
            .eq('id', userId);
          console.log(`Subscription cancelled for user: ${userId}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data } = await db.from('profiles').select('id').eq('customer_id', customerId).limit(1);
        if (data && data.length > 0) {
          console.log(`Payment failed for user: ${data[0].id}, customer: ${customerId}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
