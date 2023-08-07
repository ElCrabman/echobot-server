const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const KubeconfigRouter = require('./src/routes/kubeconfig');
const authRouter = require('./src/routes/auth');
const MiscRouter = require('./src/routes/misc');
const app = express();

require('dotenv').config();



const port = process.env.PORT || 5000;

app.use(express.static('public'))
app.use(express.json());
app.use(cors({
  credentials: true,
  exposedHeaders: 'auth-token',
}));
app.use('/kubeconfig', KubeconfigRouter);
app.use('/auth', authRouter);
app.use('/misc', MiscRouter);



main().catch(err => console.log(err))

async function main() {
    await mongoose.connect(process.env.REMOTE_DB_ADDRESS);

    app.listen(port, () => {
        console.log("server is running!")
    })
}