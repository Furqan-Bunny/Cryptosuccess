import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

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

    const db = getAdminDb();

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId || session.client_reference_id;

        if (userId) {
          await db.collection('users').doc(userId).update({
            'subscription.status': 'pro',
            'subscription.customerId': session.customer as string,
            'subscription.planId': session.subscription as string,
            'subscription.currentPeriodEnd': null, // Will be set by subscription.updated
            'subscription.signalsUsedToday': 0,
            'subscription.lastResetDate': FieldValue.serverTimestamp(),
          });
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
          await db.collection('users').doc(userId).update({
            'subscription.status': status,
            'subscription.currentPeriodEnd': new Date((subscription as any).current_period_end * 1000),
          });
          console.log(`Subscription updated for user: ${userId}, status: ${status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (userId) {
          await db.collection('users').doc(userId).update({
            'subscription.status': 'free',
            'subscription.planId': null,
            'subscription.currentPeriodEnd': null,
          });
          console.log(`Subscription cancelled for user: ${userId}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Find user by customerId and warn them
        const usersSnapshot = await db.collection('users')
          .where('subscription.customerId', '==', customerId)
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          console.log(`Payment failed for user: ${userDoc.id}, customer: ${customerId}`);
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
