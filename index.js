const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const http = require('http');
const ms = require('ms');

// Server HTTP باش Render مايديرش Port scan timeout
http.createServer((req, res) => {
    res.write("LKWAN Bot is running!");
    res.end();
}).listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const PREFIX = '+';

client.once('ready', () => {
    console.log(`✅ LKWAN est connecté en tant que : ${client.user.tag}`);
});

const activeMutes = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX) || !message.guild) return;

    // التأكد من وجود رول "Mute power" أو أدمين
    const hasMutePower = message.member.roles.cache.some(role => role.name === 'Mute power') || message.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!hasMutePower) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    async function getOrCreateMutedRole(guild) {
        let mutedRole = guild.roles.cache.find(r => r.name === 'Muted');
        if (!mutedRole) {
            mutedRole = await guild.roles.create({
                name: 'Muted',
                color: '#818386',
                permissions: []
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
        return guild.channels.cache.find(c => c.name === 'logs' && c.isTextBased());
    }

    // COMMANDE +MUTE
    if (command === 'mute') {
        const targetMember = message.mentions.members.first();
        const durationStr = args[1];

        if (!targetMember) {
            return message.reply("❌ Veuillez mentionner un utilisateur. Exemple : `+mute @user 5m`");
        }

        if (!durationStr) {
            return message.reply("❌ Veuillez spécifier une durée. Exemple : `+mute @user 5m` (s, m, h, d)");
        }

        const durationMs = ms(durationStr);
        if (!durationMs) {
            return message.reply("❌ Durée invalide ! Exemple : `5m` (5 minutes), `1h` (1 heure).");
        }

        if (targetMember.permissions.has(PermissionFlagsBits.Administrator) || targetMember.roles.highest.position >= message.guild.members.me.roles.highest.position) {
            return message.reply("🛡️ Impossible de muter un Administrateur ou un membre avec un rôle supérieur !");
        }

        const mutedRole = await getOrCreateMutedRole(message.guild);
        await targetMember.roles.add(mutedRole);

        if (targetMember.voice.channel) {
            await targetMember.voice.setMute(true, "Mute par LKWAN").catch(() => {});
        }

        const muteDate = new Date();
        message.channel.send(`🤐 **${targetMember.user.tag}** a été muté pendant **${durationStr}**.`);

        const logChannel = getLogChannel(message.guild);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle("🔇 Sanction : Mute")
                .setColor(0xFF0000)
                .addFields(
                    { name: "👤 Membre muté", value: `${targetMember.user.tag}`, inline: true },
                    { name: "🛡️ Muté par", value: `${message.author.tag}`, inline: true },
                    { name: "⏱️ Durée", value: `${durationStr}`, inline: true },
                    { name: "📅 Date & Heure", value: `<t:${Math.floor(muteDate.getTime() / 1000)}:F>`, inline: false }
                )
                .setTimestamp();
            logChannel.send({ embeds: [logEmbed] });
        }

        if (activeMutes.has(targetMember.id)) {
            clearTimeout(activeMutes.get(targetMember.id));
        }

        const timer = setTimeout(async () => {
            if (targetMember.roles.cache.has(mutedRole.id)) {
                await targetMember.roles.remove(mutedRole);
                if (targetMember.voice.channel) {
                    await targetMember.voice.setMute(false).catch(() => {});
                }
                if (logChannel) {
                    const autoUnmuteEmbed = new EmbedBuilder()
                        .setTitle("🔊 Démute Automatique")
                        .setColor(0x00FF00)
                        .setDescription(`La durée de Mute de **${targetMember.user.tag}** est expirée.`)
                        .setTimestamp();
                    logChannel.send({ embeds: [autoUnmuteEmbed] });
                }
            }
            activeMutes.delete(targetMember.id);
        }, durationMs);

        activeMutes.set(targetMember.id, timer);
    }

    // COMMANDE +UNMUTE
    if (command === 'unmute') {
        const targetMember = message.mentions.members.first();
        if (!targetMember) {
            return message.reply("❌ Veuillez mentionner un utilisateur. Exemple : `+unmute @user`");
        }

        const mutedRole = message.guild.roles.cache.find(r => r.name === 'Muted');
        if (!mutedRole || !targetMember.roles.cache.has(mutedRole.id)) {
            return message.reply("⚠️ Cet utilisateur n'est pas muté !");
        }

        await targetMember.roles.remove(mutedRole);

        if (targetMember.voice.channel) {
            await targetMember.voice.setMute(false).catch(() => {});
        }

        if (activeMutes.has(targetMember.id)) {
            clearTimeout(activeMutes.get(targetMember.id));
            activeMutes.delete(targetMember.id);
        }

        message.channel.send(`🔊 **${targetMember.user.tag}** a été démuté.`);

        const logChannel = getLogChannel(message.guild);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle("🔊 Sanction : Unmute")
                .setColor(0x00FF00)
                .addFields(
                    { name: "👤 Membre démuté", value: `${targetMember.user.tag}`, inline: true },
                    { name: "🛡️️ Démuté par", value: `${message.author.tag}`, inline: true }
                )
                .setTimestamp();
            logChannel.send({ embeds: [logEmbed] });
        }
    }
});

client.login(process.env.TOKEN).catch(err => {
    console.error("❌ ERREUR DE LOGIN DISCORD :", err);
});
