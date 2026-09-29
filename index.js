const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');
const express = require('express');

// --- SERVEUR WEB BACH RENDER MA-YN33ESH L-BOT ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('LKWAN Bot is Alive!');
});

app.listen(PORT, () => {
    console.log(`🌐 Serveur Web khddam f port ${PORT}`);
});

// --- BOT DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const PREFIX = '+';

async function getOrCreateMutedRole(guild) {
    let mutedRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');
    if (!mutedRole) {
        mutedRole = await guild.roles.create({
            name: 'Muted',
            color: '#818386',
            reason: 'Rôle Muted automatique'
        });

        guild.channels.cache.forEach(async (channel) => {
            await channel.permissionOverwrites.edit(mutedRole, {
                SendMessages: false,
                AddReactions: false,
                Speak: false
            }).catch(() => {});
        });
    }
    return mutedRole;
}

function getLogChannel(guild) {
    return guild.channels.cache.find(c => (c.name === 'mute-logs' || c.name === 'logs') && c.isTextBased());
}

client.once('clientReady', () => {
    console.log(`✅ ${client.user.tag} est connecté et opérationnel !`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. COMMANDE +MUTE
    if (command === 'mute') {
        const targetMember = message.mentions.members.first();
        const durationStr = args[1];

        if (!targetMember) return message.reply("❌ Veuillez mentionner un utilisateur.");
        if (!durationStr) return message.reply("❌ Veuillez spécifier une durée (ex: +mute @user 5m).");

        const durationMs = ms(durationStr);
        if (!durationMs) return message.reply("❌ Durée invalide !");

        if (targetMember.permissions.has(PermissionFlagsBits.Administrator) || targetMember.roles.highest.position >= message.guild.members.me.roles.highest.position) {
            return message.reply("🛡️ Impossible de muter cet utilisateur !");
        }

        try {
            const mutedRole = await getOrCreateMutedRole(message.guild);
            await targetMember.roles.add(mutedRole);

            if (targetMember.voice && targetMember.voice.channel) {
                await targetMember.voice.setMute(true, `Muté par ${message.author.tag}`).catch(() => {});
            }

            message.channel.send(`🤐 **${targetMember.user.tag}** a été muté pendant **${durationStr}**.`);

            const logChannel = getLogChannel(message.guild);
            if (logChannel) {
                logChannel.send(`🤐 **MUTE** | **Utilisateur :** ${targetMember.user.tag} | **Durée :** ${durationStr} | **Modérateur :** ${message.author.tag}`);
            }

            setTimeout(async () => {
                if (targetMember.roles.cache.has(mutedRole.id)) {
                    await targetMember.roles.remove(mutedRole).catch(() => {});
                }
                if (targetMember.voice && targetMember.voice.channel) {
                    await targetMember.voice.setMute(false).catch(() => {});
                }
            }, durationMs);

        } catch (error) {
            console.error(error);
            return message.reply("❌ Erreur lors de l'application du mute.");
        }
    }

    // 2. COMMANDE +UNMUTE
    if (command === 'unmute') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply("❌ Veuillez mentionner un utilisateur.");

        try {
            const mutedRole = await getOrCreateMutedRole(message.guild);
            if (targetMember.roles.cache.has(mutedRole.id)) {
                await targetMember.roles.remove(mutedRole);
            }

            if (targetMember.voice && targetMember.voice.channel) {
                await targetMember.voice.setMute(false);
            }

            message.channel.send(`🔊 **${targetMember.user.tag}** a été déminté avec succès !`);

            const logChannel = getLogChannel(message.guild);
            if (logChannel) {
                logChannel.send(`🔊 **UNMUTE** | **Utilisateur :** ${targetMember.user.tag} | **Modérateur :** ${message.author.tag}`);
            }

        } catch (error) {
            console.error(error);
            return message.reply("❌ Impossible de démuter ce membre.");
        }
    }
});

client.login(process.env.TOKEN).catch(err => console.error("❌ ERREUR TOKEN :", err));
