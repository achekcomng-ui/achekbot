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
        if (fs.existsSync(dataPath)) data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        if (!data.tagallPermissions) data.tagallPermissions = {};
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
        if (fs.existsSync(dataPath)) data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
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

        // Parse user message
        const userMessage = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').toLowerCase().trim();
        const args = userMessage.split(' ');

        // Permission management commands
        if (args[0] === '.tagall' && args[1]) {
            const subCommand = args[1].toLowerCase();

            // Global override (bot owner only)
            if (subCommand === 'global' && args[2]) {
                if (!isOwner) {
                    await sock.sendMessage(chatId, { text: '❌ Only bot owner can manage the global tagall override.' }, { quoted: message });
                    return;
                }
                const globalCmd = args[2].toLowerCase();
                if (globalCmd === 'on' || globalCmd === 'enable') {
                    setGlobalTagallAllowed(true);
                    await sock.sendMessage(chatId, { text: '✅ Global tagall override enabled. Anyone can use .tagall in any group (bot must be admin).' }, { quoted: message });
                    return;
                } else if (globalCmd === 'off' || globalCmd === 'disable') {
                    setGlobalTagallAllowed(false);
                    await sock.sendMessage(chatId, { text: '🔒 Global tagall override disabled. Group-level permissions now apply.' }, { quoted: message });
                    return;
                } else if (globalCmd === 'status') {
                    const globalAllowed = getGlobalTagallAllowed();
                    await sock.sendMessage(chatId, { text: `📊 Global Tagall Override: ${globalAllowed ? '✅ Enabled' : '🔒 Disabled'}` }, { quoted: message });
                    return;
                }
            }

            // Group-level management (admins + owner)
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
                    text: '✅ Tagall enabled for all members in this group (bot must be admin).',
                }, { quoted: message });
                return;
            } else if (subCommand === 'off' || subCommand === 'disable') {
                setTagallPermission(chatId, false);
                await sock.sendMessage(chatId, { 
                    text: '🔒 Tagall disabled for regular members. Only admins and bot owner can use .tagall now.',
                }, { quoted: message });
                return;
            } else if (subCommand === 'status') {
                const permissions = getTagallPermissions();
                const isEnabled = permissions[chatId] || false;
                const globalAllowed = getGlobalTagallAllowed();
                await sock.sendMessage(chatId, { 
                    text: `📊 *Tagall Status*\nGroup: ${isEnabled ? '✅ Enabled for all' : '🔒 Admins only'}\nGlobal override: ${globalAllowed ? '✅ Enabled' : '🔒 Disabled'}\n\nUsage:\n.tagall on - enable all\n.tagall off - admins only\n.tagall global on/off - owner override`,
                }, { quoted: message });
                return;
            }
        }

        // Check if user can use .tagall
        const permissions = getTagallPermissions();
        const isTagallEnabled = permissions[chatId] || false;
        const globalAllowed = getGlobalTagallAllowed();

        const canUseTagall = isOwner || isSenderAdmin || isTagallEnabled || globalAllowed;

        if (!canUseTagall) {
            await sock.sendMessage(chatId, { 
                text: '❌ Tagall is currently disabled for regular members. Ask an admin to enable it with: .tagall on',
            }, { quoted: message });
            return;
        }

        // Get participants
        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants;
        if (!participants || participants.length === 0) {
            await sock.sendMessage(chatId, { text: '❌ No participants found in the group.' });
            return;
        }

        // Compose tagall message
        let messageText = '📢 *Attention Everyone!*\n\n';
        participants.forEach(p => messageText += `@${p.id.split('@')[0]}\n`);
        messageText += `\n_Powered by AchekBot_\n🌐 ${settings.website || 'https://achek.com.ng'}`;

        await sock.sendMessage(chatId, {
            text: messageText,
            mentions: participants.map(p => p.id),
        });

    } catch (error) {
        console.error('Error in tagall command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to tag all members.' });
    }
}

module.exports = tagAllCommand;
