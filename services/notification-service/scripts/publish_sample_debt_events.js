#!/usr/bin/env node
"use strict";

/**
 * Sample publisher to emit example debt events for local testing.
 * It prefers the mono-repo shared rabbitmq client at /app/shared/rabbitmq.js
 * but will fall back to a direct AMQP connection using amqplib if not present.
 */

const amqp = require('amqplib');
const DEFAULT_RABBIT = process.env.RABBITMQ_URL || 'amqp://invexis:invexispass@localhost:5672';

async function publishViaAmqp(exchange, routingKey, payload) {
    const conn = await amqp.connect(DEFAULT_RABBIT);
    const ch = await conn.createChannel();
    await ch.assertExchange(exchange, 'topic', { durable: true });
    ch.publish(exchange, routingKey, Buffer.from(JSON.stringify(payload)), { persistent: true });
    await ch.close();
    await conn.close();
}

async function main() {
    let publishFn;
    let exchange = 'events_topic';

    try {
        const shared = require('/app/shared/rabbitmq');
        publishFn = async (routingKey, payload) => shared.publish(shared.exchanges.topic || exchange, routingKey, payload);
        exchange = shared.exchanges.topic || exchange;
        console.log('Using shared rabbitmq client');
    } catch (e) {
        console.log('Shared rabbitmq not available, falling back to amqplib');
        publishFn = async (routingKey, payload) => publishViaAmqp(exchange, routingKey, payload);
    }

    const now = new Date().toISOString();

    const samples = [
        { key: 'debt.created', payload: { debtId: 'd-1', companyId: 'c-1', shopId: 's-1', customerId: 'u-1', createdAt: now } },
        { key: 'debt.repayment.created', payload: { debtId: 'd-1', repaymentId: 'r-1', companyId: 'c-1', amountPaid: 50, paidAt: now } },
        { key: 'debt.fully_paid', payload: { debtId: 'd-2', companyId: 'c-1', paidAt: now } },
        { key: 'debt.status.updated', payload: { debtId: 'd-1', status: 'PARTIALLY_PAID', companyId: 'c-1' } },
        { key: 'debt.updated', payload: { debtId: 'd-1', companyId: 'c-1', changes: ['dueDate', 'items'] } },
        { key: 'debt.deleted', payload: { debtId: 'd-3', companyId: 'c-1', deletedAt: now } },
        { key: 'debt.overdue', payload: { debtId: 'd-4', companyId: 'c-1', overdueDays: 3 } },
        { key: 'debt.reminder.upcoming.7', payload: { debtId: 'd-5', companyId: 'c-1', daysUntilDue: 7 } },
        { key: 'debt.reminder.overdue.3', payload: { debtId: 'd-6', companyId: 'c-1', overdueDays: 3 } },
        { key: 'debt.reminder.final', payload: { debtId: 'd-7', companyId: 'c-1', overdueDays: 30 } }
    ];

    for (const s of samples) {
        try {
            await publishFn(s.key, s.payload);
            console.log(`Published ${s.key}`);
        } catch (err) {
            console.error(`Failed to publish ${s.key}:`, err.message || err);
        }
    }

    console.log('Done publishing sample debt events');
}

main().catch(err => { console.error(err); process.exit(1); });
