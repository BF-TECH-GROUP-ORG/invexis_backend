const jwt = require('jsonwebtoken');

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTNiZGM0ZGE3NzExZWQ0ZTUyY2E1YTEiLCJyb2xlIjoiY29tcGFueV9hZG1pbiIsImVtYWlsIjoiaGFycnltY2NhbGxAZ21haWwuY29tIiwiY29tcGFuaWVzIjpbIjJiNTFjODM4LThkYzItNGMzOC1iYmUxLWZiZWRhNjdmYWUxZiJdLCJzaG9wcyI6W10sImlhdCI6MTc2NTgxNDgyMywiZXhwIjoxNzY1ODE1NzIzLCJhdWQiOiJpbnZleGlzLWFwcHMiLCJpc3MiOiJpbnZleGlzLWF1dGgifQ.i8laKiQUUrPWMe2BFft4Wrai7pLUAb6glkwTrWhDXAc";

const secret = "sdjnjkdjafd8a79d7fa76yuadsjbjahsgtd76y3498hnjf//dkjsfa";

console.log("Current Time (local system):", new Date().toISOString());
console.log("Current Epoch:", Math.floor(Date.now() / 1000));

try {
    const decoded = jwt.decode(token); // Decode first to see claims regardless of validity
    if (decoded && decoded.exp) {
        console.log("--------------------------------------------------");
        console.log("Token Expiration (exp):", new Date(decoded.exp * 1000).toLocaleString());
        console.log("Current System Time:   ", new Date().toLocaleString());
        console.log("--------------------------------------------------");
    }

    const verified = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: 'invexis-auth',
        audience: 'invexis-apps'
    });
    console.log("✅ Verification Successful! Token is VALID.");
    console.log("Decoded:", verified);
} catch (err) {
    console.error("❌ Verification Failed:", err.message);
    if (err.name === 'TokenExpiredError') {
        const expiredAt = new Date(err.expiredAt).toLocaleString();
        console.error(`Token expired at: ${expiredAt}`);
        console.error(`Status: The token is EXPIRED. Config changes do NOT affect old tokens.`);
    }
}
