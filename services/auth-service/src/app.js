// app.js
const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const session = require("express-session");
const passport = require("passport");
require("./config/passport");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/routes");

// ✅ Performance monitoring
const performanceMonitor = (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;

    res.send = function (data) {
        const duration = Date.now() - startTime;
        const isSlow = duration > 50; // SLA: 50ms
        
        if (isSlow) {
            console.warn(`[SLOW] ${req.method} ${req.path} took ${duration}ms`);
        }
        
        res.set('X-Response-Time', `${duration}ms`);
        return originalSend.call(this, data);
    };

    next();
};

// --------------------------------------
// EXPRESS APP
// --------------------------------------
const app = express();


// ✅ Add performance monitoring first
app.use(performanceMonitor);

// --------------------------------------
// HELMET (RELAXED FOR DEV)
// --------------------------------------
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: false,
    })
);

// --------------------------------------
// MIDDLEWARE
// --------------------------------------
// ✅ Trust proxy - Required for rate limiting behind API gateway
app.set('trust proxy', true);

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));

// --------------------------------------
// SESSION (REQUIRED FOR PASSPORT)
// Refresh token goes inside HttpOnly cookie, not session.
// --------------------------------------
app.use(
    session({
        secret: process.env.SESSION_SECRET || "change-me-in-prod",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
        },
    })
);

// --------------------------------------
// PASSPORT
// --------------------------------------
app.use(passport.initialize());
app.use(passport.session());

// --------------------------------------
// ROUTES
// --------------------------------------
app.use("/auth", authRoutes);

// --------------------------------------
// HEALTH CHECK
// --------------------------------------
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --------------------------------------
// 404
// --------------------------------------
app.use((req, res) => {
    res.status(404).json({ ok: false, message: "Route not found" });
});

// --------------------------------------
// ERROR HANDLER
// --------------------------------------
app.use((err, req, res, next) => {
    console.error("🔥 Global Error:", err.message);
    res.status(500).json({
        ok: false,
        message: err.message || "Internal server error",
    });
});

module.exports = app;