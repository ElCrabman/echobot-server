const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); 
const dotenv = require('dotenv');
const User = require('../schemas/user');
const auth = require('../middlewares/auth');
const admin = require('../middlewares/admin');

dotenv.config();

const authRouter = express.Router();

//Simple registration
authRouter.post('/register', async (req, res) => {
    //const user = await User.findOne({ $or: [{'email': req.body.email}, {'username': req.body.usename}]});
    const user = await User.findOne( {'label': req.body.username.toLowerCase()} );

    if (user != null)
        return res.status(409).send('User already exists.');

	// Hash the password
	const hashedPass = await bcrypt.hash(req.body.password, Number(process.env.SALT_ROUNDS));

    const newUser = new User({
        username: req.body.username,
        label: req.body.username.toLowerCase(),
        password: hashedPass,
        email: req.body.email,
        type: "basic",
        requiresDiscordUpdate: false,
        requiresTelegramUpdate: false,
    });

    let data = await newUser.save();
    res.status(200).send(data);
});

// Simple Login
authRouter.post('/login', async (req, res) => {
    const user = await User.findOne({'username': req.body.username});

    if (user == null)
        return res.status(401).send('Wrong username')

    // Compare passwords
	const match = await bcrypt.compare(req.body.password, user.password);

    if (!match) 
        return res.status(401).send('Wrong password')

    const token = jwt.sign({_id: user._id}, process.env.JWT_SECRET);
    res.status(200).header('auth-token', token).send(user);

});

// Get profile info
authRouter.get('/info', auth, async (req, res) => {
	const user = await User.findOne({"_id": req.user._id});

	return res.status(200).send({ 
		username: user.username, 
		requiresDiscordUpdate: user.requiresDiscordUpdate,
		requiresTelegramUpdate: user.requiresTelegramUpdate,
	});
});

// Check si the user is an admin
authRouter.get('/isadmin', [auth, admin], async (req, res) => {

    res.sendStatus(200);
    
});


module.exports = authRouter;