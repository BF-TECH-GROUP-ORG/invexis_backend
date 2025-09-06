// sample

const { issueToken } = require('../utils/jwt');

app.post('/auth/loginn', async (req, res) => {
    const user = await findUser(req.body.email, req.body.password);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const token = issueToken(user);  // ✅ issue JWT
    res.json({ token });
});
