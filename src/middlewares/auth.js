const jwt = require('jsonwebtoken');

//Middleware for private routes
function auth(req, res, next) {
    const token = req.header('auth-token');
    if (!token)
        return res.status(401).send('Access denied.');        

    try {
        const verified_user = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified_user;
        next();

    } catch (err) {
        console.log(err);
        return res.status(401).send('Invalid session.');
    }
}

// TODO: middleware for admin


module.exports = auth;