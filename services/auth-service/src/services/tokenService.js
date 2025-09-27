const jwt = require('jsonwebtoken');
const { hashToken } = require('../utils/hashPassword');
const Session = require('../models/Session.models');
const User = require('../models/User.models');
const amqp = require('amqplib');

// let rabbitMQChannel;
// async function setupRabbitMQ() {
//     try {
//         const conn = await amqp.connect(process.env.RABBITMQ_URI);
//         rabbitMQChannel = await conn.createChannel();
//         await rabbitMQChannel.assertQueue('auth.events', { durable: true });
//     } catch (err) {
//         console.error('RabbitMQ connection error:', err);
//     }
// }
// setupRabbitMQ();

// async function publishEvent(event, data) {
//     if (rabbitMQChannel) {
//         rabbitMQChannel.sendToQueue('auth.events', Buffer.from(JSON.stringify({ event, data })));
//     }
// }

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TTL = process.env.ACCESS_TTL;
const REFRESH_TTL = process.env.REFRESH_TTL;

function signAccess(payload) {
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefresh(payload) {
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

async function verifyAccess(token) {
    try {
        return jwt.verify(token, ACCESS_SECRET);
    } catch (err) {
        return null;
    }
}

async function verifyRefresh(token) {
    try {
        return jwt.verify(token, REFRESH_SECRET);
    } catch (err) {
        return null;
    }
}

async function createSession(userId, deviceId = 'unknown', ip, location = {}) {
    const raw = require('crypto').randomBytes(64).toString('hex');
    const hashed = hashToken(raw);
    const session = await Session.create({
        userId,
        refreshTokenHash: hashed,
        deviceId,
        ip,
        location
    });
    const refreshjwt = signRefresh({ sid: session._id.toString(), uid: userId.toString() });
    // await publishEvent('session.created', { userId, sessionId: session._id });
    return { refreshToken: refreshjwt, session, raw };
}

async function refreshTokens(refreshToken) {
    const payload = await verifyRefresh(refreshToken);
    const { sid, uid } = payload || {};
    if (!sid || !uid) {
        throw new Error('Invalid refresh token');
    }
    const session = await Session.findById(sid);
    if (!session || session.revoked) {
        throw new Error('Session not found or revoked');
    }
    session.lastActiveAt = new Date();
    await session.save();
    const user = await User.findById(uid);
    if (!user) {
        throw new Error('User not found');
    }
    const accessToken = signAccess({ sub: user._id.toString() });
    const newRefreshToken = signRefresh({ sid: session._id.toString(), uid: user._id.toString() });
    // await publishEvent('token.refreshed', { sessionId: sid, userId: uid });
    return { accessToken, refreshToken: newRefreshToken, sessionId: sid, userId: uid };
}

async function revokeSessionByRefresh(refreshToken) {
    try {
        const payload = await verifyRefresh(refreshToken);
        const { sid } = payload || {};
        if (!sid) {
            throw new Error('Invalid refresh token');
        }
        const session = await Session.findByIdAndUpdate(sid, { revoked: true });
        if (session) {
            const user = await User.findById(session.userId);
            user.sessions = user.sessions.filter(s => s.toString() !== sid);
            await user.save();
            // await publishEvent('session.revoked', { sessionId: sid });
        }
        return true;
    } catch (err) {
        return false;
    }
}

module.exports = {
    signAccess,
    signRefresh,
    verifyAccess,
    verifyRefresh,
    createSession,
    refreshTokens,
    revokeSessionByRefresh
};