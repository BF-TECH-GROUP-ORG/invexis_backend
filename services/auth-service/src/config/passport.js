const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User.models');
let publishRabbitMQ;
let exchanges = { topic: 'mock.topic' };
try {
    const sharedRabbit = require('/app/shared/rabbitmq.js');
    publishRabbitMQ = sharedRabbit.publish;
    exchanges = sharedRabbit.exchanges || exchanges;
} catch (err) {
    // Shared rabbitmq not mounted (e.g., local dev). Use no-op publisher.
    publishRabbitMQ = async () => true;
}
const { v4: uuidv4 } = require('uuid');
const Preference = require('../models/Preference.models');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8001/auth/google/callback',
    passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
    console.log('Google Strategy executing with profile:', {
        id: profile.id,
        email: profile.emails?.[0]?.value,
        authType: req.session?.authType
    });
    try {
        // Check if user already exists
        const existingUser = await User.findOne({ googleId: profile.id });
        if (existingUser) {
            // Update last login
            existingUser.lastLoginAt = new Date();
            await existingUser.save();

            await publishRabbitMQ(exchanges.topic, 'user.logged_in', {
                userId: existingUser._id,
                method: 'google',
                role: existingUser.role
            }, { headers: { traceId: uuidv4() } });

            return done(null, existingUser);
        }

        // Create new user from Google profile
        const email = profile.emails[0].value;
        const firstName = profile.name.givenName;
        const lastName = profile.name.familyName;
        const profilePicture = profile.photos[0]?.value;
        const authType = req.session?.authType || 'signin';

        // Check if email is already registered
        const emailUser = await User.findOne({ email });
        if (emailUser) {
            // Link Google ID to existing account
            emailUser.googleId = profile.id;
            emailUser.lastLoginAt = new Date();
            emailUser.isEmailVerified = true; // Since Google email is verified
            if (!emailUser.profilePicture && profilePicture) {
                emailUser.profilePicture = profilePicture;
            }
            // Update name if missing
            if (!emailUser.firstName) emailUser.firstName = firstName;
            if (!emailUser.lastName) emailUser.lastName = lastName;
            await emailUser.save();

            await publishRabbitMQ(exchanges.topic, 'user.account.linked', {
                userId: emailUser._id,
                provider: 'google',
                role: 'emailUser.role'
            }, { headers: { traceId: uuidv4() } });

            return done(null, emailUser);
        }

        // Validate required fields
        if (!email || !firstName || !lastName) {
            return done(new Error('Required profile information missing from Google account'));
        }

        // Create new user
        // Only allow new user creation for signup flow
        if (authType !== 'signup') {
            return done(null, false, { message: 'No account exists. Please sign up first.' });
        }

        const newUser = new User({
            googleId: profile.id,
            email,
            firstName,
            lastName,
            profilePicture,
            isEmailVerified: true, // Google emails are verified
            role: 'customer', // Default role
            dateOfBirth: null, // Will be collected in profile completion
            password: undefined, // No password for Google users
            accountStatus: 'active',
            phone: null, // Will be collected in profile completion
            gender: 'other', // Default value
            requiresProfileCompletion: true // Flag to indicate profile needs completion
        });

        // Create default preferences
        const preferences = new Preference({
            userId: newUser._id,
            theme: 'system',
            language: 'en',
            notifications: {
                email: true,
                sms: false,
                inApp: true
            }
        });
        await preferences.save();
        newUser.preferences = preferences._id;

        await newUser.save();

        // Publish events
        await publishRabbitMQ(exchanges.topic, 'user.registered', {
            userId: newUser._id,
            method: 'google',
            role: 'customer',
            email,
            firstName,
            lastName
        }, { headers: { traceId: uuidv4() } });

        await publishRabbitMQ(exchanges.topic, 'customer.registered', {
            userId: newUser._id,
            firstName,
            lastName,
            email
        }, { headers: { traceId: uuidv4() } });

        done(null, newUser);
    } catch (err) {
        done(err, null);
    }
}));