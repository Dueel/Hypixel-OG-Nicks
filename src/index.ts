import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { setTimeout, setInterval, clearInterval } from 'node:timers';
import { blueBright, underline, redBright } from 'colorette';
import { createBot } from 'mineflayer';
import type { Bot } from 'mineflayer';
import { Movements, pathfinder, goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';

const LobbyRegex = /{"server":"(?<server>[^"]*)","gametype":"(?<gametype>[^"]*)","lobbyname":"(?<lobby>[^"]*)"}/;
const LimboRegex = /{"server":"(?<server>[^"]*)"}/;

let config: { discord_webhook: string; names: string[] };
let count = 0;

class NickBot {
	public bot = createBot({
		host: 'mc.hypixel.net',
		port: 25_565,
		username: 'Nick',
		auth: 'microsoft',
		hideErrors: true,
		version: '1.18.2',
		profilesFolder: './.minecraft',
		viewDistance: 'tiny',
		onMsaCode(data) {
			console.log(
				blueBright(
					`[LOGIN REQUEST] Please login to Microsoft at ${underline(data.verification_uri)} and enter the following code: ${underline(data.user_code)} within ${underline(data.interval)} minutes.`,
				),
			);
		},
	});

	private rejoin: number = 1;

	public static pause_nicking: boolean = false;

	public static pause_movement: boolean = false;

	public static nick: string = '';

	public constructor() {
		this.bot.loadPlugin(pathfinder);

		this.bot.once('login', async () => {
			console.log(blueBright('[LOGIN] Successfully logged in!'));
			this.bot.pathfinder.setMovements(new Movements(this.bot));
			this.bot.pathfinder.movements.canDig = false;
			this.bot.pathfinder.movements.maxDropDown = 99;
			this.bot.pathfinder.movements.blocksToAvoid.add(26);
			this.bot.pathfinder.movements.blocksToAvoid.add(27);

			this.bot.chat('/lobby');

			this.bot.inventory.on('updateSlot', async (oldItem, newItem) => {
				if (!newItem) return;
				if (NickBot.pause_nicking) return;

				if (newItem && newItem.name === 'written_book') {
					NickBot.pause(true, 'movement');

					// @ts-expect-error Proper NBT typings are not available
					const content = newItem.nbt?.value.pages.value.value[0];

					if (!content) return;

					const nick = NickBot.cleanText(JSON.parse(content)[2]);

					if (!nick || nick === '') return;

					console.log(redBright(`[BOOK] Received Nick: ${nick}`));

					NickBot.nick = nick;

					NickBot.pause(false, 'movement');
				}
			});

			NickBot.runNickCommand(this.bot);
			NickBot.randomMovement(this.bot);
		});

		this.bot.on('spawn', async () => {
			NickBot.pause(true, 'nicking');
			NickBot.pause(true, 'movement');

			console.log(blueBright('[SPAWN] Successfully spawned!'));

			await new Promise((resolve) => {
				setTimeout(resolve, 3_000);
			});
			this.bot.chat('/locraw');
		});

		this.bot.on('message', (message) => {
			if (LobbyRegex.test(message.toString())) {
				const result = LobbyRegex.exec(message.toString());
				if (result) {
					const [_, server, gametype, lobbyname] = result;
					console.log(blueBright(`[LOBBY] Found lobby: ${lobbyname} on server ${server} with gametype ${gametype}`));
					NickBot.pause(false, 'nicking');
					NickBot.pause(false, 'movement');
				}
			} else if (LimboRegex.test(message.toString())) {
				const result = LimboRegex.exec(message.toString());
				if (result) {
					const [_, server] = result;
					console.log(blueBright(`[LIMBO] Found limbo on server ${server}`));
					this.bot.chat(`/lobby`);
				}
			}
		});

		this.bot.on('kicked', (reason) => {
			console.log(blueBright(`[KICK] Kicked for reason: ${reason.toString()}`));
		});

		this.bot.on('end', (endReason) => {
			if (endReason === 'Nick') {
				console.log(blueBright(`[END] Good Nick Found! Exiting...`));
				process.exit(0);
			} else if (endReason === 'process.exit()') {
				console.log(blueBright(`[END] Login failed. Exiting...`));
				process.exit(0);
			}

			console.log(blueBright(`[END] Disconnected from server. Reconnecting in 5 seconds...`));
			if (this.rejoin > 5) {
				console.log(blueBright(`[END] Rejoin limit reached. Exiting...`));
				process.exit(0);
			}

			setTimeout(() => {
				this.rejoin++;
				NickBot.connect();
			}, 5_000 * this.rejoin);
		});
	}

	private static connect() {
		new NickBot();
	}

	private static pause(pause: boolean, type: 'movement' | 'nicking') {
		if (type === 'nicking') {
			this.pause_nicking = pause;
		} else if (type === 'movement') {
			this.pause_movement = pause;
		}
	}

	public static disconnect(bot: Bot, reason: string) {
		bot.quit(reason);
	}

	private static goTo(bot: Bot, x: number, y: number, z: number) {
		const pos = new Vec3(x, y, z);
		const block = bot.blockAt(pos);
		if (block && (block.name === 'water' || block.name === 'lava')) {
			return;
		}

		bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 2));
	}

	private static randomMovement(bot: Bot) {
		setInterval(
			async () => {
				if (this.pause_movement) return;
				this.pause(true, 'nicking');
				const x = Math.floor(Math.random() * 10 - (Math.random() * 4 + 3));
				const z = Math.floor(Math.random() * 10 - Math.random() * 4 + 3);
				const newPositon = bot.entity.position.offset(x, 0, z);

				const block = bot.blockAt(newPositon);

				if (block && (block.name === 'water' || block.name === 'lava')) {
					this.goTo(bot, bot.entity.position.x - x * 10, bot.entity.position.y, bot.entity.position.z - z * 10);
					console.log(
						blueBright(
							`[MOVEMENT] Moved to ${bot.entity.position.x - x * 10}, ${bot.entity.position.y}, ${bot.entity.position.z - z * 10}`,
						),
					);
					setTimeout(() => {
						bot.clearControlStates();
						this.pause(false, 'nicking');
					}, 1_000);
				} else {
					await bot.lookAt(newPositon);
					this.goTo(bot, newPositon.x, newPositon.y, newPositon.z);
					console.log(blueBright(`[MOVEMENT] Moved to ${newPositon.x}, ${newPositon.y}, ${newPositon.z}`));
					setTimeout(() => {
						bot.clearControlStates();
						this.pause(false, 'nicking');
					}, 1_000);
				}
			},
			Math.random() * 10_000 + 5_000,
		);
	}

	private static cleanText(text: string) {
		return text.replaceAll(/§./g, '');
	}

	private static runNickCommand(bot: Bot) {
		setInterval(async () => {
			if (this.pause_nicking) return;
			const previousNick = this.nick;

			bot.chat('/nick help setrandom');

			await new Promise((resolve) => {
				setTimeout(resolve, 3_000);
			});
			if (previousNick === this.nick) {
				return;
			}

			count++;

			if (this.isNickGood(this.nick)) {
				console.log(blueBright(`[NICK] Set nick to ${this.nick}`));
				await this.runSetNickCommand(bot, this.nick);
				this.disconnect(bot, 'Nick');
			}
		}, 7_000);
	}

	private static async runSetNickCommand(bot: Bot, nick: string) {
		bot.chat(`/nick actuallyset ${nick} respawn`);

		await fetch(config.discord_webhook, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				embeds: [
					{
						title: 'Nick Found!',
						description: `Nick: ${nick}\nTotal Nicks Processed: ${count}`,
						color: '32768',
					},
				],
			}),
		});
	}

	private static isNickGood(nick: string) {
		const vowels = ['a', 'e', 'i', 'o', 'u'];
		for (const vowel of vowels) {
			if (nick.includes(vowel.repeat(3))) {
				return true;
			}
		}

		if (config.names.includes(nick)) {
			return true;
		}

		return nick.startsWith('__') || nick.endsWith('__');
	}
}

(async () => {
	await configSetup();

	const nick = new NickBot();

	function gracefulExit() {
		NickBot.disconnect(nick.bot, 'process.exit()');
		process.exit(0);
	}

	process.on('SIGINT', gracefulExit);
	process.on('SIGTERM', gracefulExit);
})();

async function configSetup() {
	const file = await fs.open('./config.json').catch(() => null);
	if (file) {
		await file.close();
		config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
		if (!config.discord_webhook || config.discord_webhook === '') {
			console.log(redBright('[CONFIG] Discord Webhook not set. Please fill in the details.'));
			process.exit(0);
		}
	} else {
		await fs.writeFile(
			'./config.json',
			JSON.stringify({
				discord_webhook: '',
				names: [],
			}),
		);

		console.log(blueBright('[CONFIG] Config file created. Please fill in the details.'));
		process.exit(0);
	}
}
