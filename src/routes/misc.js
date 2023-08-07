const express = require('express');
const auth = require('../middlewares/auth');
const admin = require('../middlewares/admin');
const User = require('../schemas/user');
const { generateSecret } = require('../genenv');
const k8s = require('@kubernetes/client-node');
const path = require('path');

require('dotenv').config();

const kc = new k8s.KubeConfig();
//kc.loadFromDefault(); // Loads configuration from the default Kubernetes config file (~/.kube/config)
kc.loadFromFile(path.resolve('kubeconfig.yaml'));

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const MiscRouter = express.Router();

MiscRouter.post('/updates', async (req, res) => {

    try {
        if (req.body.repository.name == 'echobot-discord')
            await User.updateMany({}, { $set: { requiresDiscordUpdate: true } });
        else if (req.body.repository.name == 'echobot-telegram')
            await User.updateMany({}, { $set: { requiresTelegramUpdate: true } });
    } catch (e) {
        return res.sendStatus(500);
    }

    res.sendStatus(200);
});

// Only admins can set secret kubernetes files
MiscRouter.post('/secret', [ auth, admin ], async (req, res) => {

    // Check if secret exists 
    let resp = await k8sApi.listNamespacedSecret(process.env.DISCORD_NAMESPACE);
    if (resp.body.items.length > 0)
        await Promise.all([
            k8sApi.deleteNamespacedSecret('global-values', process.env.DISCORD_NAMESPACE),
            k8sApi.deleteNamespacedSecret('global-values', process.env.TELEGRAM_NAMESPACE)
        ]);

    // Encode data in base64
    let secretData = {};
    for (let key of Object.keys(req.body)) {
        secretData[key] = Buffer.from(req.body[key]).toString('base64');
    }

    // Set the secret in the discord and telegram namespaces
    const secretManifestDiscord = generateSecret(secretData, process.env.DISCORD_NAMESPACE);
    const secretManifestTelegram = generateSecret(secretData, process.env.TELEGRAM_NAMESPACE);

    const [res1, res2] = await Promise.all([
        k8sApi.createNamespacedSecret(process.env.DISCORD_NAMESPACE, secretManifestDiscord),
        k8sApi.createNamespacedSecret(process.env.TELEGRAM_NAMESPACE, secretManifestTelegram)
    ]); 
    
    // Set the secret in the telegram env
    res.sendStatus(200);
});

module.exports = MiscRouter;