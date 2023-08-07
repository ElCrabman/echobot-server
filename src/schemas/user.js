const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
    username: String,
    label: String,
    email: String,
    password: String,
    type: String,
    requiresDiscordUpdate: Boolean,
    requiresTelegramUpdate: Boolean,
},  { minimize: false });

const User = mongoose.model('User', userSchema);

module.exports = User;