const express = require('express');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const k8s = require('@kubernetes/client-node');
const { generateEnv, generateDiscord, generateTelegram, generateFeatures } = require('../genenv');
const auth = require('../middlewares/auth');
const User = require('../schemas/user');
const Bot = require('../schemas/bot');
const listPods = require('../etc/listPods');
const path = require('path');
const yaml = require('js-yaml');

require('dotenv').config();

const kc = new k8s.KubeConfig();
//kc.loadFromDefault();
kc.loadFromFile(path.resolve('kubeconfig.yaml'));

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);

const KubeconfigRouter = express.Router();


// Create a deployment with environment variables in a ConfigMap
KubeconfigRouter.post('/deploy', auth, async (req, res) => {

    const user = await User.findOne({ '_id': req.user._id });
	const botname = req.body.data.bot_name;
	const namespace = (req.body.type == "discord") ? process.env.DISCORD_NAMESPACE : process.env.TELEGRAM_NAMESPACE;
	const image = (req.body.type == "discord") ? process.env.DISCORD_IMAGE : process.env.TELEGRAM_IMAGE;
	// TODO : Handle username case sensitivity
	// TODO : botname and name is the same ?

	// Check if bot name exists
	const bot = await Bot.findOne( { $and: [{'name': botname}, {'owner': user.username}] } );

	if (bot != null)
		return res.status(404).send('Bot exists')

    const { name, configMap } = generateEnv(req.body.data);
	const podname = `${name}-${user.username}`.toLowerCase();

	// TODO : Check if bot name is available
	// TODO : deal with crashes


	// Create the features yaml if telegram bot
	if (req.body.type == 'telegram' && req.body.features.length != 0) {

		// Turn JSON into the right format for the yaml features file
		const newFeatures = []

		req.body.features.map((e) => {
			const { channel_id, ...featuresData} = e
			temp = {}
			temp[e['channel_id']] = featuresData
			newFeatures.push(temp)
		})

		// Create the configmap		
		const featuresYaml = yaml.dump(newFeatures);
		const featuresConfigMap = generateFeatures(featuresYaml, podname);

		await k8sApi.createNamespacedConfigMap(`${namespace}`, featuresConfigMap);
	}

    // Create and deploy the ConfigMap
    let configMapYaml = k8s.dumpYaml({
        metadata: { name: `${podname}-configmap` },
        data: configMap,
    });
    configMapYaml = k8s.loadYaml(configMapYaml);

    let resp = await k8sApi.createNamespacedConfigMap(`${namespace}`, configMapYaml);

	

    // Deploy the pod
    let podYaml = (req.body.type == 'discord') ? generateDiscord(podname, image) : generateTelegram(podname, image);
  
      const createDeploymentResponse = await k8sAppsApi.createNamespacedDeployment(
        `${namespace}`,
        podYaml
      );

	// Save the bot in the database
	const newBot = new Bot({
        name: botname,
        owner: user.username,
		label: podname,
        type: req.body.type,
    });

    await newBot.save();

    res.sendStatus(200);
});


// Get list of bots
KubeconfigRouter.get('/bots', auth, async (req, res) => {

	const user = await User.findOne({ '_id': req.user._id });

	const discordBots = await Bot.find({ 'owner': user.username, 'type': 'discord' });
	const telegramBots = await Bot.find({ 'owner': user.username, 'type': 'telegram' });
	const discordLabels = discordBots.map((e) => `${e.name}-${user.username}`.toLowerCase());
	const telegramLabels = telegramBots.map((e) => `${e.name}-${user.username}`.toLowerCase());
	
	const [ discordData, telegramData ] = await Promise.all([
		listPods(discordBots, discordLabels, process.env.DISCORD_NAMESPACE),
		listPods(telegramBots, telegramLabels, process.env.TELEGRAM_NAMESPACE),
	]);

	const botData = [ ...discordData, ...telegramData ];

	res.status(200).json(botData)
});

// Get a single bot's configmap
KubeconfigRouter.get('/configmap/:id', async (req, res) => {

	let bot;

	try {
		bot = await Bot.findOne({ '_id': req.params.id }); 
	} catch (err) {
		return res.status(404).send('No such id');
	}

	const configMapName = `${bot.label}-configmap`;
	const namespace = (bot.type == "discord") ? process.env.DISCORD_NAMESPACE : process.env.TELEGRAM_NAMESPACE;

	try {
		// Use the `readNamespacedConfigMap` function to get the details of the specified ConfigMap
		const { body: configMap } = await k8sApi.readNamespacedConfigMap(configMapName, namespace);
		let data = { ...configMap.data };

		// If telegram bot, get the channel yaml file
		if (bot.type == "telegram"){
			const { body: yamlFeatures } = await k8sApi.readNamespacedConfigMap(`${bot.label}-features`, namespace);
			const features = yaml.load(yamlFeatures.data['features.yml'].replaceAll('-', '- '));
			const newFeatures = [];

			features.map((e) => {    
				const key = Object.keys(e)[0];
				newFeatures.push({channel_id: key, ...e[key]})
			})

			data = { ...data, config: newFeatures};
		}

		return res.status(200).send({ ...data, BOT_NAME: bot.name });
	} catch (err) {
		console.error("Error reading ConfigMap:", err.statusCode);
		return res.status(err.statusCode).send('No ConfigMap');
	}
});

// Get a single bot's configmap
/*
KubeconfigRouter.post('/configmap/:id', async (req, res) => {

	const { newConfigMap } = generateEnv(req.body)

	console.log(newConfigMap)

	let bot;

	try {
		bot = await Bot.findOne({ '_id': req.params.id }); 
	} catch (err) {
		return res.status(404).send('No such id');
	}

	// Patch the configmap
	let namespace = (bot.type == "discord") ? process.env.DISCORD_NAMESPACE : process.env.TELEGRAM_NAMESPACE;
	try {
		/*let configMapYaml = k8s.dumpYaml({
			metadata: { name: `${bot.label}-configmap` },
			data: configMap,
		});
		configMapYaml = k8s.loadYaml(configMapYaml);
		const { body: configMap } = await k8sApi.readNamespacedConfigMap(`${bot.label}-configmap`, namespace);
		// configMap.data = newConfigMap

		const { body: updatedConfigMap } = await k8sApi.patchNamespacedConfigMap(`${bot.label}-configmap`, namespace, configMap,undefined,
		undefined,
		undefined,
		undefined,
		{ headers: { 'Content-Type': 'application/strategic-merge-patch+json' } });

		console.log(`ConfigMap in namespace '${namespace}' has been updated with new data:`);
		console.log(updatedConfigMap);
  	} catch (err) {
    	console.error("Error updating ConfigMap:", err);
  	}
});
*/

// Change the ConfigMap data
// TODO : update to javascript API
// THIS IS THE FAULTY V1
/*
KubeconfigRouter.post('/configmap/:id', async (req, res) => {
	
	let bot;

	try {
		bot = await Bot.findOne({ '_id': req.params.id }); 
	} catch (err) {
		return res.status(404).send('No such id');
	}

	const namespace = "discord-test"; 
	const configMapName = `${bot.label}-configmap`;

	const { newConfigMap } = generateEnv(req.body);
	const updatedData =    JSON.stringify({ data: newConfigMap });

	const kubectlCommand = `kubectl patch configmap ${configMapName} -n ${namespace} --type merge --patch '${updatedData}'`;

  	try {
		const { stdout, stderr } = await exec(kubectlCommand);

		if (stderr) {
			console.error("Error updating ConfigMap:", stderr);
			return;
		}
		console.log("ConfigMap updated successfully.");
		console.log(stdout);
    	

		// Delete pods to trigger ConfigMap changes
		// Delete pods to trigger ConfigMap changes
		const { body: podList } = await k8sApi.listNamespacedPod(namespace);

		// Iterate through the list of pods and delete each one
		for (const pod of podList.items) {
			if (pod.metadata.labels.app != bot.label)
				continue
			const podName = pod.metadata.name;
			console.log(`Deleting pod '${podName}'...`);
			await k8sApi.deleteNamespacedPod(podName, namespace);
			console.log(`Pod '${podName}' has been deleted.`);
		} 
		
  	} catch (err) {
    	console.error("Error updating ConfigMap:", err);
  	}


});
*/

// V2 : Change the ConfigMap data
// TODO : set method to patch
KubeconfigRouter.post('/configmap/:id', async (req, res) => {
	let bot;

	try {
		bot = await Bot.findOne({ '_id': req.params.id }); 
	} catch (err) {
		return res.status(404).send('No such id');
	}
	
	const namespace = (bot.type == "discord") ? process.env.DISCORD_NAMESPACE : process.env.TELEGRAM_NAMESPACE;; 
	const configMapName = `${bot.label}-configmap`;
	const { name, configMap } = generateEnv(req.body.data);

	// delete configmap
	const deleteResponse = await k8sApi.deleteNamespacedConfigMap(configMapName, namespace);

	// create configmap
	let configMapYaml = k8s.dumpYaml({
        metadata: { name: configMapName },
        data: configMap,
    });
    configMapYaml = k8s.loadYaml(configMapYaml);

    let resp = await k8sApi.createNamespacedConfigMap(`${namespace}`, configMapYaml)

	res.sendStatus(200);
});

// TODO : stop bot
KubeconfigRouter.delete('/stop/:id', async (req, res) => {

	let bot;

	try {
		bot = await Bot.findOne({ '_id': req.params.id }); 
	} catch (err) {
		return res.status(404).send('No such id');
	}

	const namespace = (bot.type == "discord") ? process.env.DISCORD_NAMESPACE : process.env.TELEGRAM_NAMESPACE; 
	const deploymentName = bot.label;
	try {
		// Use the `readNamespacedDeployment` function to get the details of the Deployment
		const { body: deployment } = await k8sAppsApi.readNamespacedDeployment(deploymentName, namespace);
	
		// Use the `deleteNamespacedDeployment` function to delete the Deployment
		const { body: deletedDeployment } = await k8sAppsApi.deleteNamespacedDeployment(deploymentName, namespace);

		await Bot.findOneAndUpdate({ '_id': req.params.id }, {'status': 'Stopped'}); 
		
		res.sendStatus(200);
	  } catch (err) {
		console.error("Error deleting Deployment:", err);
		res.status(500).send('Deletion failed');
	  }
});


// TODO : start pod
KubeconfigRouter.get('/start/:id', async (req, res) => {

	let bot;

	try {
		bot = await Bot.findOne({ '_id': req.params.id }); 
	} catch (err) {
		return res.status(404).send('No such id');
	}

	const namespace = (bot.type == "discord") ? process.env.DISCORD_NAMESPACE : process.env.TELEGRAM_NAMESPACE;
	const image = (bot.type == "discord") ? process.env.DISCORD_IMAGE : process.env.TELEGRAM_IMAGE;
	let podYaml = (bot.type == "discord") ? generateDiscord(bot.label, image) : generateTelegram(bot.label, image);
  
      const createDeploymentResponse = await k8sAppsApi.createNamespacedDeployment(
        `${namespace}`,
        podYaml
      );

	  res.sendStatus(200);
});



// TODO : delete pod to trigger restart
// KubeconfigRouter.delete('/pod/:id', async (req, res) => {})

// TODO : auth for delete pod
KubeconfigRouter.delete('/delete/:id', async (req, res) => {

	let bot;

	try {
		bot = await Bot.findOne({ '_id': req.params.id }); 
	} catch (err) {
		return res.status(404).send('No such id');
	}

	const namespace = (bot.type == "discord") ? process.env.DISCORD_NAMESPACE : process.env.TELEGRAM_NAMESPACE; 
	const deploymentName = bot.label;
	try {
		// Use the `readNamespacedDeployment` function to get the details of the Deployment
		await k8sAppsApi.readNamespacedDeployment(deploymentName, namespace);
	
		// Use the `deleteNamespacedDeployment` function to delete the Deployment
		await k8sAppsApi.deleteNamespacedDeployment(deploymentName, namespace);

		// Delete configmap
		await k8sApi.deleteNamespacedConfigMap(`${deploymentName}-configmap`, namespace);

		// For telegram, delete the features.yml configmap
		if (bot.type == 'telegram')
			await k8sApi.deleteNamespacedConfigMap(`${deploymentName}-features`, namespace);

		
		// Delete from database
		await Bot.findOneAndDelete({ '_id': req.params.id })

		res.sendStatus(200);
	  } catch (err) {
		console.error("Error deleting Deployment:", err);
		res.status(500).send('Deletion failed');
	  }
});

// TODO : reflect stopped state on the frontend when clicking

// Update all telegram or discord bots
KubeconfigRouter.get('/update/:type', auth, async (req, res) => {

	/* TODO
	if (req.params.type !== "discord" || req.params.type !== "telegram")
		return res.sendStatus(500);
	*/

	const user = await User.findOne({ '_id': req.user._id });

	if (req.params.type == "discord")
		user.requiresDiscordUpdate = false;

	else if (req.params.type == "telegram")
		user.requiresTelegramUpdate = false;

	await user.save();

	// Get pods to delete in selected namespace
	const namespace = (req.params.type == "discord") ? process.env.DISCORD_NAMESPACE : process.env.TELEGRAM_NAMESPACE;

	let response = await k8sApi.listNamespacedPod(namespace);
	const pods = response.body.items;

	// Delete each pod
	const deletePromises = pods.map((pod) => {
		return k8sApi.deleteNamespacedPod(pod.metadata.name, namespace);
	});

	// Wait for all pods to be deleted
	await Promise.all(deletePromises);

	res.sendStatus(200);

});

module.exports = KubeconfigRouter;