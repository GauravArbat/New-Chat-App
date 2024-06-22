import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
        console.error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local file');
        return new Response('Internal Server Error', { status: 500 });
    }

    // Get headers
    const headerPayload = headers();
    const svix_id = headerPayload.get("svix-id");
    const svix_timestamp = headerPayload.get("svix-timestamp");
    const svix_signature = headerPayload.get("svix-signature");

    // If there are no headers, throw an error
    if (!svix_id || !svix_signature || !svix_timestamp) {
        console.error('Missing Svix headers');
        return new Response('Error occurred -- no svix headers', {
            status: 400,
        });
    }

    // Get the body
    let payload;
    try {
        payload = await req.json();
    } catch (err) {
        console.error('Error parsing JSON body:', err);
        return new Response('Error parsing JSON body', { status: 400 });
    }

    const body = JSON.stringify(payload);

    // Create a new Svix instance with your secret
    const wh = new Webhook(WEBHOOK_SECRET);

    let evt: WebhookEvent;

    // Verify the payload with the headers
    try {
        evt = wh.verify(body, {
            "svix-id": svix_id,
            "svix-timestamp": svix_timestamp,
            "svix-signature": svix_signature,
        }) as WebhookEvent;
    } catch (err) {
        console.error('Error verifying webhook:', err);
        return new Response('Error verifying webhook', { status: 400 });
    }

    const eventType = evt.type;
    console.log('Received event:', eventType);
    console.log('Payload data:', payload.data);

    try {
        // Handle different event types
        if (eventType === 'user.created') {
            await db.user.create({
                data: {
                    externalUserId: payload.data.id,
                    username: payload.data.username ?? '',
                    phoneNumber: payload.data.phone_numbers[0]?.phone_number ?? '',
                    profileImageUrl: payload.data.image_url ?? '',
                },
            });
        } else if (eventType === 'user.updated') {
            await db.user.update({
                where: {
                    externalUserId: payload.data.id,
                },
                data: {
                    username: payload.data.username ?? '',
                    phoneNumber: payload.data.phone_numbers[0]?.phone_number ?? '',
                    profileImageUrl: payload.data.image_url ?? '',
                },
            });
        } else if (eventType === 'user.deleted') {
            await db.user.delete({
                where: {
                    externalUserId: payload.data.id,
                },
            });
        } else {
            console.warn('Unhandled event type:', eventType);
        }

        return new Response('Webhook processed successfully', { status: 200 });
    } catch (err) {
        console.error('Error processing webhook:', err);
        return new Response('Internal Server Error', { status: 500 });
    }
}

