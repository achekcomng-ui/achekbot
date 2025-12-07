const isAdmin = require('../lib/isAdmin');
const isOwnerOrSudo = require('../lib/isOwner');
const settings = require('../settings');
const fs = require('fs');
const path = require('path');

// Helper functions for tagall permissions
function getTagallPermissions() {
    const dataPath = path.join(__dirname, '../data/userGroupData.json');
    try {
        if (fs.existsSync(dataPath)) {
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            return data.tagallPermissions || {};
        }
    } catch (error) {
        console.error('Error reading tagall permissions:', error);
    }
    return {};
}

function setTagallPermission(chatId, enabled) {
    const dataPath = path.join(__dirname, '../data/userGroupData.json');
    try {
        let data = {};
        if (fs.existsSync(dataPath)) {
            data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
        if (!data.tagallPermissions) {
            data.tagallPermissions = {};
        }
        data.tagallPermissions[chatId] = enabled;
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error setting tagall permission:', error);
        return false;
    }
}

// Global override controlled by bot owner: allow anyone to use .tagall across all groups
function getGlobalTagallAllowed() {
    const dataPath = path.join(__dirname, '../data/userGroupData.json');
    try {
        if (fs.existsSync(dataPath)) {
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            return !!data.globalTagallAllowed;
        }
    } catch (error) {
        console.error('Error reading global tagall setting:', error);
    }
    return false;
}

function setGlobalTagallAllowed(enabled) {
    const dataPath = path.join(__dirname, '../data/userGroupData.json');
    try {
        let data = {};
        if (fs.existsSync(dataPath)) {
            data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
        data.globalTagallAllowed = !!enabled;
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error setting global tagall permission:', error);
        return false;
    }
}

async function tagAllCommand(sock, chatId, senderId, message) {
    try {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { 
                text: '⚠️ Please make the bot an admin first.',
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: settings.channelJid || '120363402198872825@newsletter',
                        newsletterName: 'AchekBot - Achek Digital Solutions',
                        serverMessageId: -1
                    }
                }
            }, { quoted: message });
            return;
        }

        // Check if it's a permission management command
        const userMessage = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').toLowerCase().trim();
        const args = userMessage.split(' ');
        
        if (args[0] === '.tagall' && args[1]) {
            const subCommand = args[1].toLowerCase();

            // Bot owner-only: manage global override (anyone everywhere)
            if (subCommand === 'global' && args[2]) {
                const globalCmd = args[2].toLowerCase();

                if (!isOwner) {
                    await sock.sendMessage(chatId, { text: '❌ Only bot owner can manage the global tagall override.' }, { quoted: message });
                    return;
                }

                if (globalCmd === 'on' || globalCmd === 'enable') {
                    setGlobalTagallAllowed(true);
                    await sock.sendMessage(chatId, { text: '✅ Global tagall override enabled by bot owner. Now anyone in any group can use .tagall (bot must be admin).' }, { quoted: message });
                    return;
                } else if (globalCmd === 'off' || globalCmd === 'disable') {
                    setGlobalTagallAllowed(false);
                    await sock.sendMessage(chatId, { text: '🔒 Global tagall override disabled by bot owner. Group-level permissions apply again.' }, { quoted: message });
                    return;
                } else if (globalCmd === 'status') {
                    const globalAllowed = getGlobalTagallAllowed();
                    await sock.sendMessage(chatId, { text: `📊 Global Tagall Override: ${globalAllowed ? '✅ Enabled' : '🔒 Disabled'}` }, { quoted: message });
                    return;
                }
            }

            // Only group admins and bot owner can manage per-group permissions
            if (!isSenderAdmin && !isOwner) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Only group admins or bot owner can manage tagall permissions for this group.',
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: settings.channelJid || '120363402198872825@newsletter',
                            newsletterName: 'AchekBot - Achek Digital Solutions',
                            serverMessageId: -1
                        }
                    }
                }, { quoted: message });
                return;
            }

            if (subCommand === 'on' || subCommand === 'enable') {
                setTagallPermission(chatId, true);
                await sock.sendMessage(chatId, { 
                    text: '✅ Tagall has been enabled for all members in this group. Now everyone can use .tagall (bot must be admin).',
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: settings.channelJid || '120363402198872825@newsletter',
                            newsletterName: 'AchekBot - Achek Digital Solutions',
                            serverMessageId: -1
                        }
                    }
                }, { quoted: message });
                return;
            } else if (subCommand === 'off' || subCommand === 'disable') {
                setTagallPermission(chatId, false);
                await sock.sendMessage(chatId, { 
                    text: '🔒 Tagall has been disabled for regular members in this group. Only admins and bot owner can now use .tagall command.',
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: settings.channelJid || '120363402198872825@newsletter',
                            newsletterName: 'AchekBot - Achek Digital Solutions',
                            serverMessageId: -1
                        }
                    }
                }, { quoted: message });
                return;
            } else if (subCommand === 'status') {
                const permissions = getTagallPermissions();
                const isEnabled = permissions[chatId] || false;
                const globalAllowed = getGlobalTagallAllowed();
                await sock.sendMessage(chatId, { 
                    text: `📊 *Tagall Status*\n\nGroup state: ${isEnabled ? '✅ Enabled for all members' : '🔒 Only admins can use'}\nGlobal override (owner): ${globalAllowed ? '✅ Enabled (anyone can use in all groups)' : '🔒 Disabled'}\n\n*Usage:*\n.tagall on - Enable for everyone in this group\n.tagall off - Admins only\n.tagall global on/off - Bot owner can allow anyone globally`,
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: settings.channelJid || '120363402198872825@newsletter',
                            newsletterName: 'AchekBot - Achek Digital Solutions',
                            serverMessageId: -1
                        }
                    }
                }, { quoted: message });
                return;
            }
        }

        // Check permissions for regular tagall usage
        const permissions = getTagallPermissions();
        const isTagallEnabled = permissions[chatId] || false;
        const globalAllowed = getGlobalTagallAllowed();

        // Allow if: owner, admin, global allowed, or tagall is enabled for all members in the group
        if (!isOwner && !isSenderAdmin && !isTagallEnabled && !globalAllowed) {
            await sock.sendMessage(chatId, { 
                text: '❌ Tagall is currently disabled for regular members. Ask an admin to enable it with: .tagall on',
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: settings.channelJid || '120363402198872825@newsletter',
                        newsletterName: 'AchekBot - Achek Digital Solutions',
                        serverMessageId: -1
                    }
                }
            }, { quoted: message });
            return;
        }

        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants;

        if (!participants || participants.length === 0) {
            await sock.sendMessage(chatId, { text: '❌ No participants found in the group.' });
            return;
        }

        let messageText = '📢 *Attention Everyone!*\n\n';
        participants.forEach(participant => {
            messageText += `@${participant.id.split('@')[0]}\n`;
        });
        messageText += `\n_Powered by AchekBot_\n🌐 ${settings.website || 'https://achek.com.ng'}`;

        await sock.sendMessage(chatId, {
            text: messageText,
            mentions: participants.map(p => p.id),
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: settings.channelJid || '120363402198872825@newsletter',
                    newsletterName: 'AchekBot - Achek Digital Solutions',
                    serverMessageId: -1
                }
            }
        });

    } catch (error) {
        console.error('Error in tagall command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to tag all members.' });
    }
}

module.exports = tagAllCommand;
