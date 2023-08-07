const User = require('../schemas/user');

// Middleware for admin routes
async function admin(req, res, next) {

    try {
        const user = await User.findOne({ '_id': req.user._id });  
        if (user.type == "admin")
            next();
        else
            return res.status(401).send('Invalid session.');


    } catch (err) {
        console.log(err);
        return res.status(401).send('Invalid session.');
    }
}


module.exports = admin;