const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');

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

// --- FONCTIONS UTILITAIRES ---

// Récupère ou crée le rôle "Muted" sur le serveur
async function getOrCreateMutedRole(guild) {
    let mutedRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');
    if (!mutedRole) {
        mutedRole = await guild.roles.create({
            name: 'Muted',
            color: '#818386',
            reason: 'Rôle Muted automatique pour la modération'
        });

        // Applique les restrictions sur tous les salons textuels et vocaux
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

// Récupère le salon pour les logs (cherche "mute-logs" en priorité, sinon "logs")
function getLogChannel(guild) {
    return guild.channels.cache.find(c => (c.name === 'mute-logs' || c.name === 'logs') && c.isTextBased());
}

// --- ÉVÉNEMENT READY ---

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} est connecté et opérationnel !`);
});

// --- GESTION DES COMMANDES ---

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ------------------------------------
    // 1. COMMANDE +MUTE
    // ------------------------------------
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

        // Vérification des permissions
        if (targetMember.permissions.has(PermissionFlagsBits.Administrator) || targetMember.roles.highest.position >= message.guild.members.me.roles.highest.position) {
            return message.reply("🛡️ Impossible de muter un Administrateur ou un membre avec un rôle supérieur !");
        }

        try {
            // A. Ajout du rôle Muted
            const mutedRole = await getOrCreateMutedRole(message.guild);
            await targetMember.roles.add(mutedRole);

            // B. Mute Vocal si le membre est connecté en vocal
            if (targetMember.voice && targetMember.voice.channel) {
                await targetMember.voice.setMute(true, `Muté par ${message.author.tag}`).catch(() => {});
            }

            // C. Timeout Discord (Textuel)
            await targetMember.timeout(durationMs, `Muté par ${message.author.tag}`).catch(() => {});

            // Confirmation dans le salon textuel
            message.channel.send(`🤐 **${targetMember.user.tag}** a été muté pendant **${durationStr}**.`);

            // Envoi dans le salon de logs (#mute-logs)
            const logChannel = getLogChannel(message.guild);
            if (logChannel) {
                logChannel.send(`🤐 **MUTE** | **Utilisateur :** ${targetMember.user.tag} | **Durée :** ${durationStr} | **Modérateur :** ${message.author.tag}`);
            }

            // Démute automatique après expiration du délai (Timer)
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
            return message.reply("❌ Une erreur est survenue lors de l'application du mute.");
        }
    }

    // ------------------------------------
    // 2. COMMANDE +UNMUTE
    // ------------------------------------
    if (command === 'unmute') {
        const targetMember = message.mentions.members.first();

        if (!targetMember) {
            return message.reply("❌ Veuillez mentionner un utilisateur à démuter. Exemple : `+unmute @user`");
        }

        try {
            // A. Retrait du rôle Muted
            const mutedRole = await getOrCreateMutedRole(message.guild);
            if (targetMember.roles.cache.has(mutedRole.id)) {
                await targetMember.roles.remove(mutedRole);
            }

            // B. Annulation du Timeout Discord (Textuel)
            if (targetMember.isCommunicationDisabled()) {
                await targetMember.timeout(null);
            }

            // C. Retrait du Mute Vocal s'il est en salon vocal
            if (targetMember.voice && targetMember.voice.channel) {
                await targetMember.voice.setMute(false);
            }

            // Confirmation dans le salon textuel
            message.channel.send(`🔊 **${targetMember.user.tag}** a été déminté avec succès !`);

            // Envoi dans le salon de logs (#mute-logs)
            const logChannel = getLogChannel(message.guild);
            if (logChannel) {
                logChannel.send(`🔊 **UNMUTE** | **Utilisateur :** ${targetMember.user.tag} | **Modérateur :** ${message.author.tag}`);
            }

        } catch (error) {
            console.error(error);
            return message.reply("❌ Impossible de démuter ce membre. Vérifiez les permissions du bot.");
        }
    }
});

// Connexion du bot via le Token d'environnement
client.once('clientReady', () => {
    console.log(`✅ ${client.user.tag} est connecté et opérationnel !`);
});
