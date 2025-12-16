const jwt = require('jsonwebtoken');
const { hashToken } = require('../utils/hashPassword');
const Session = require('../models/Session.models');
const User = require('../models/User.models');
const redis = require('/app/shared/redis.js'); // Shared
const { publish: publishRabbitMQ, exchanges } = require('/app/shared/rabbitmq.js');
const { v4: uuidv4 } = require('uuid'); // npm i uuid

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TTL = process.env.ACCESS_TTL || 'm';
const REFRESH_TTL = process.env.REFRESH_TTL || '30d';
const CACHE_TTLS = { session: 9000 }; // 2.5h

// Sign/Verify (unchanged, but add issuer/audience)
function signAccess(payload) {
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL, issuer: 'invexis-auth', audience: 'invexis-apps' });
}

function signRefresh(payload) {
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL, issuer: 'invexis-auth', audience: 'invexis-apps' });
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

// Cached createSession
async function createSession(userId, deviceId = 'unknown', ip, location = {}) {
    const raw = require('crypto').randomBytes(64).toString('hex');
    const hashed = hashToken(raw);

    // Optimistic creation - Generate ID and object in memory
    const session = new Session({
        userId,
        refreshTokenHash: hashed,
        deviceId,
        ip,
        location
    });

    const refreshjwt = signRefresh({ sid: session._id.toString(), uid: userId.toString() });

    // Cache session - Fire and forget
    const cacheKey = `session:${session._id}`;
    redis.set(cacheKey, JSON.stringify({ ...session.toObject(), raw }), 'EX', CACHE_TTLS.session)
        .catch(err => console.error('Failed to cache session:', err.message));

    // DB Save - Fire and forget (Optimistic)
    session.save().catch(err => console.error('Failed to save session to DB:', err.message));

    // Event - Fire and forget
    publishRabbitMQ(exchanges.topic, 'auth.session.created', { sessionId: session._id, userId, deviceId, ip }, { headers: { traceId: uuidv4() } })
        .catch(err => console.error('Failed to publish auth.session.created:', err.message));

    return { refreshToken: refreshjwt, session, raw };
}

// Cached refresh
async function refreshTokens(refreshToken) {
    const payload = await verifyRefresh(refreshToken);
    const { sid, uid } = payload || {};

    if (!sid || !uid) throw new Error("Invalid refresh token");

    const cacheKey = `session:${sid}`;

    let session = await redis.get(cacheKey);
    if (session) {
        session = JSON.parse(session);
    } else {
        session = await Session.findById(sid);
        if (!session) throw new Error("Session not found");
    }

    if (session.revoked) throw new Error("Session revoked");

    session.lastActiveAt = new Date();

    await Session.findByIdAndUpdate(sid, {
        lastActiveAt: session.lastActiveAt,
    });

    await redis.set(cacheKey, JSON.stringify(session), "EX", CACHE_TTLS.session);

    const user = await User.findById(uid);
    if (!user) throw new Error("User not found");

    const accessToken = signAccess({
        sub: user._id.toString(),
        role: user.role,
        email: user.email,
        companies: user.companies,
        shops: user.shops
    });
    const newRefreshToken = signRefresh({
        sid: session._id.toString(),
        uid: user._id.toString(),
    });

    await publishRabbitMQ(
        exchanges.topic,
        "auth.session.refreshed",
        { sessionId: sid, userId: uid },
        { headers: { traceId: uuidv4() } }
    );

    return {
        accessToken,
        refreshToken: newRefreshToken,
        sessionId: sid,
        userId: uid,
    };
}


// Revoke with cache invalidation
async function revokeSessionByRefresh(refreshToken) {
    try {
        const payload = await verifyRefresh(refreshToken);
        const { sid } = payload || {};
        if (!sid) throw new Error('Invalid refresh token');

        // ✅ Revoke session immediately without waiting for user update or event
        const session = await Session.findByIdAndUpdate(sid, { revoked: true });
        if (session) {
            // ✅ Fire-and-forget: user sessions cleanup and event publishing
            User.findByIdAndUpdate(
                session.userId,
                { $pull: { sessions: sid } }, // Use MongoDB $pull operator instead of fetching+saving
                { new: false } // Don't need returned doc
            ).catch(err => console.warn(`User session cleanup failed: ${err.message}`));

            // ✅ Fire-and-forget cache invalidation
            redis.del(`session:${sid}`)
                .catch(err => console.warn(`Cache cleanup failed: ${err.message}`));

            // ✅ Fire-and-forget event (don't await broker confirmation)
            publishRabbitMQ(exchanges.topic, 'auth.session.revoked', { sessionId: sid, userId: session.userId }, { headers: { traceId: uuidv4() } })
                .catch(err => console.warn(`Event publish failed: ${err.message}`));
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