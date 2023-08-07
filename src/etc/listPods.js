const express = require('express');
const k8s = require('@kubernetes/client-node');
const Bot = require('../schemas/bot');

require('dotenv').config();

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);

async function listPods(bots, botLabels, namespace) {
    const botData = [];
	const runningBots = [];
	const errorBots = [];
	const creatingBots = [];
	let currentBot;
	const type = (namespace == process.env.DISCORD_NAMESPACE) ? "discord" : "telegram";

	const { body: podList } = await k8sApi.listNamespacedPod(namespace);

    // Get bots from cluster
    // console.log("Available pods in namespace", process.env.DISCORD_NAMESPACE);
    for (const pod of podList.items) {
		if (!botLabels.includes(pod.metadata.labels.app))
			continue;

		// TODO : handle Terminating and ContainerCreating and CrashLoopBackOff

		//console.log(pod.status)
		if (pod.status.phase != 'Running') {
			currentBot = bots.find(b => b.label == pod.metadata.labels.app)
			creatingBots.push({name: currentBot.name, id: currentBot._id});
			//errorBots.push({name: currentBot.name, id: currentBot._id});
			botLabels.splice(botLabels.indexOf(pod.metadata.labels.app), 1);
		}
		else if (pod.status.conditions.find(s => s.type == "Ready").status == "False") {
			currentBot = bots.find(b => b.label == pod.metadata.labels.app);
			errorBots.push({name: currentBot.name, id: currentBot._id});
			botLabels.splice(botLabels.indexOf(pod.metadata.labels.app), 1);
		}

		else if (pod.status.conditions.find(s => s.type == "ContainersReady").status == "False") {
			currentBot = bots.find(b => b.label == pod.metadata.labels.app)
			errorBots.push({name: currentBot.name, id: currentBot._id});
			botLabels.splice(botLabels.indexOf(pod.metadata.labels.app), 1);
		}

		else {
			currentBot = bots.find(b => b.label == pod.metadata.labels.app)
			runningBots.push({name: currentBot.name, id: currentBot._id});
			botLabels.splice(botLabels.indexOf(pod.metadata.labels.app), 1);
		}
    }

	for (const bot of runningBots) {
		botData.push({
			type: type,
			status: "Active",
			name: bot.name,
			id: bot.id
		})
	}

	for (const bot of errorBots) {
		botData.push({
			type: type,
			status: "Error",
			name: bot.name,
			id: bot.id
		})
	}

	for (const bot of creatingBots) {
		botData.push({
			type: type,
			status: "Creating",
			name: bot.name,
			id: bot.id
		})
	}

	// Add stopped bots (present in database but not in cluster)
	const stoppedBots = await Bot.find({ 'label': { "$in" :botLabels } });

	if (stoppedBots == null)
		return res.status(200).json(botData);

	for (const bot of stoppedBots) {
		botData.push({
			type: bot.type,
			status: "Stopped",
			name: bot.name,
			id: bot._id
		})
		
	}

    return botData;

}

module.exports = listPods;