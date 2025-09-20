const jwtUtils = require('../utils/jwt');

exports.generateTokens = (userId, user) => {
    const accessToken = jwtUtils.issueAccessToken(user);
    const refreshToken = jwtUtils.issueRefreshToken(user);
    return { accessToken, refreshToken };
};