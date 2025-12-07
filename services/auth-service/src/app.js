// app.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const session = require("express-session");
const passport = require("passport");
require("./config/passport");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/routes");

// --------------------------------------
// EXPRESS APP
// --------------------------------------
const app = express();

// --------------------------------------
// FRONTEND ORIGINS (DEV + PROD)
// --------------------------------------
const allowedOrigins = [
    "http://localhost:3001",
    'http://localhost:40999',
    process.env.FRONTEND_URL,
    process.env.FRONTEND_DEV_URL,
].filter(Boolean);

// --------------------------------------
// SECURE CORS CONFIGURATION
// MUST MATCH FRONTEND withCredentials:true
// --------------------------------------
app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true); // Postman, curl, etc.

            const isAllowed = allowedOrigins.includes(origin);
            const isNgrok = origin && (origin.includes("ngrok-free.app") || origin.includes("ngrok-free.dev"));

            if (isAllowed || isNgrok) {
                return callback(null, origin); // Reflect the origin explicitly
            }

            console.error("❌ Blocked CORS Origin:", origin);
            return callback(new Error("Not allowed by CORS"));
        },

        credentials: true, // REQUIRED for cookies
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Requested-With",
            "ngrok-skip-browser-warning",
        ],
        exposedHeaders: ["Set-Cookie"],
        optionsSuccessStatus: 200,
    })
);

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
app.use(express.json({ limit: "10mb" }));
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