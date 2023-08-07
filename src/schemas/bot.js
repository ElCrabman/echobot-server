const mongoose = require('mongoose');

const botSchema = new mongoose.Schema({
    name: String,
    label: String,
    owner: String,
    type: String,
},  { minimize: false });

const Bot = mongoose.model('Bot', botSchema);

module.exports = Bot;