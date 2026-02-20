#!/usr/bin/env node

/**
 * Claude Telegram Bot
 * 
 * A Telegram bot that provides access to Claude Code CLI
 * with voice message support and session persistence.
 * 
 * Supports multiple repos via different Telegram groups.
 */

import { Bot, GrammyError, HttpError } from 'grammy';
import { config, validateConfig } from './config.js';
import { executeClaudeCode, createSessionId } from './claude.js';
import { processVoiceMessage } from './whisper.js';
import { 
  loadRepoMappings, 
  setRepoForChat, 
  getRepoForChat, 
  getRepoInfo,
  removeRepoForChat,
  hashRepoPath,
  listDirectory
} from './repos.js';
import { loadSessionMappings, resetSession, getSessionInfo } from './sessions.js';

// Validate configuration before starting
validateConfig();

// Load repo and session mappings
loadRepoMappings();
loadSessionMappings();

// Create bot instance
const bot = new Bot(config.telegramToken);

// Track processing state per user
const processingUsers = new Set();

/**
 * Check if user is allowed to use the bot
 */
function isUserAllowed(userId) {
  if (config.allowedUsers.length === 0) {
    return true; // No restrictions
  }
  return config.allowedUsers.includes(userId);
}

/**
 * Split long messages for Telegram (max 4096 chars)
 */
function splitMessage(text, maxLength = 4000) {
  if (text.length <= maxLength) {
    return [text];
  }
  
  const parts = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }
    
    // Try to split at a newline
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // No good newline, split at space
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // No good space, hard split
      splitIndex = maxLength;
    }
    
    parts.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }
  
  return parts;
}

/**
 * Send response with proper formatting
 */
async function sendResponse(ctx, text) {
  const parts = splitMessage(text);
  
  for (const part of parts) {
    try {
      // Try to send as Markdown first
      await ctx.reply(part, { parse_mode: 'Markdown' });
    } catch (e) {
      // Fall back to plain text if Markdown fails
      await ctx.reply(part);
    }
  }
}

/**
 * Get session ID that includes chat ID AND repo path hash
 * This ensures each repo has its own session context
 */
function getSessionId(ctx) {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const repoPath = getRepoForChat(chatId, config.workingDirectory);
  const repoHash = hashRepoPath(repoPath);
  
  // Session ID includes repo hash so switching repos = different session
  // But switching back to same repo = same session restored!
  if (ctx.chat?.type === 'private') {
    return `${config.sessionPrefix}-${userId}-${repoHash}`;
  } else {
    return `${config.sessionPrefix}-group-${chatId}-${repoHash}`;
  }
}

// Help text - used by /start and /help
const helpText = `🤖 *Claude Code Telegram Bot*

Ich bin deine Brücke zu Claude Code!

*Nachrichten:*
• Textnachricht → Claude Code antwortet
• Sprachnachricht → Transkription + Claude

*Befehle:*
• \`/help\` - Diese Hilfe anzeigen
• \`/setrepo /pfad\` - Repo für diesen Chat setzen
• \`/repo\` - Aktuelles Repo anzeigen
• \`/ls\` - Dateien im Repo auflisten
• \`/status\` - Session-Info anzeigen
• \`/reset\` - Neue Session starten
• \`/clearrepo\` - Repo-Zuordnung entfernen`;

// /help command
bot.command('help', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!isUserAllowed(userId)) {
    return;
  }
  
  await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

// /start command
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!isUserAllowed(userId)) {
    await ctx.reply('⛔ Du bist nicht berechtigt, diesen Bot zu verwenden.');
    return;
  }
  
  const chatId = ctx.chat?.id;
  const repoInfo = getRepoInfo(chatId);
  const repoPath = getRepoForChat(chatId, config.workingDirectory);
  
  await ctx.reply(
    helpText + `\n\n*Aktuelles Repo:* \`${repoPath}\`\n*Session:* \`${getSessionId(ctx)}\``,
    { parse_mode: 'Markdown' }
  );
});

// /setrepo command - Set working directory for this chat
bot.command('setrepo', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!isUserAllowed(userId)) {
    await ctx.reply('⛔ Du bist nicht berechtigt, diesen Bot zu verwenden.');
    return;
  }
  
  const chatId = ctx.chat?.id;
  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
  
  if (!args) {
    await ctx.reply(
      '📂 *Repo setzen*\n\n' +
      'Verwendung: `/setrepo /absoluter/pfad/zum/repo`\n\n' +
      'Beispiel:\n' +
      '`/setrepo /home/user/projects/my-app`',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  try {
    setRepoForChat(chatId, args);
    await ctx.reply(
      `✅ *Repo gesetzt!*\n\n` +
      `Dieser Chat arbeitet jetzt in:\n` +
      `\`${args}\`\n\n` +
      `Alle Claude Code Befehle werden in diesem Verzeichnis ausgeführt.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    await ctx.reply(
      `❌ *Fehler beim Setzen des Repos*\n\n` +
      `${error.message}\n\n` +
      `Stelle sicher, dass der Pfad existiert und ein Verzeichnis ist.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// /repo command - Show current repo
bot.command('repo', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!isUserAllowed(userId)) {
    return;
  }
  
  const chatId = ctx.chat?.id;
  const repoInfo = getRepoInfo(chatId);
  const repoPath = getRepoForChat(chatId, config.workingDirectory);
  
  if (repoInfo) {
    await ctx.reply(
      `📂 *Aktuelles Repo*\n\n` +
      `Pfad: \`${repoInfo.path}\`\n` +
      `Gesetzt am: ${new Date(repoInfo.setAt).toLocaleString('de-DE')}\n\n` +
      `Ändern mit: \`/setrepo /neuer/pfad\``,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(
      `📂 *Kein Repo gesetzt*\n\n` +
      `Dieser Chat verwendet das Standard-Verzeichnis:\n` +
      `\`${repoPath}\`\n\n` +
      `Setze ein Repo mit: \`/setrepo /pfad/zum/repo\``,
      { parse_mode: 'Markdown' }
    );
  }
});

// /clearrepo command - Remove repo mapping
bot.command('clearrepo', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!isUserAllowed(userId)) {
    return;
  }
  
  const chatId = ctx.chat?.id;
  removeRepoForChat(chatId);
  
  await ctx.reply(
    `🗑️ *Repo-Zuordnung entfernt*\n\n` +
    `Dieser Chat verwendet jetzt wieder das Standard-Verzeichnis:\n` +
    `\`${config.workingDirectory}\``,
    { parse_mode: 'Markdown' }
  );
});

// /ls command - List files in current repo
bot.command('ls', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!isUserAllowed(userId)) {
    return;
  }
  
  const chatId = ctx.chat?.id;
  const repoPath = getRepoForChat(chatId, config.workingDirectory);
  
  try {
    const { dirs, files } = listDirectory(repoPath);
    
    let response = `📂 *${repoPath}*\n\n`;
    
    if (dirs.length > 0) {
      response += `*Ordner:*\n`;
      response += dirs.map(d => `📁 \`${d}\``).join('\n');
      response += '\n\n';
    }
    
    if (files.length > 0) {
      response += `*Dateien:*\n`;
      response += files.map(f => `📄 \`${f}\``).join('\n');
    }
    
    if (dirs.length === 0 && files.length === 0) {
      response += '_(Verzeichnis ist leer)_';
    }
    
    await ctx.reply(response, { parse_mode: 'Markdown' });
  } catch (error) {
    await ctx.reply(`❌ Fehler: ${error.message}`);
  }
});

// /status command
bot.command('status', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!isUserAllowed(userId)) {
    return;
  }
  
  const chatId = ctx.chat?.id;
  const sessionId = getSessionId(ctx);
  const repoPath = getRepoForChat(chatId, config.workingDirectory);
  const chatType = ctx.chat?.type;
  
  const modelDisplay = config.claudeModel || 'auto (Opus → Sonnet fallback)';
  
  await ctx.reply(
    `📊 *Status*\n\n` +
    `• Chat-Typ: \`${chatType}\`\n` +
    `• Chat-ID: \`${chatId}\`\n` +
    `• Session: \`${sessionId}\`\n` +
    `• Repo: \`${repoPath}\`\n` +
    `• Model: \`${modelDisplay}\`\n` +
    `• Voice Refinement: ${config.refineTranscripts ? '✅' : '❌'}`,
    { parse_mode: 'Markdown' }
  );
});

// /reset command - Start fresh session
bot.command('reset', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!isUserAllowed(userId)) {
    return;
  }
  
  const sessionName = getSessionId(ctx);
  const newUUID = resetSession(sessionName);
  
  await ctx.reply(
    `🔄 *Neue Session gestartet*\n\n` +
    `Session: \`${sessionName}\`\n` +
    `Neue UUID: \`${newUUID.substring(0, 8)}...\`\n\n` +
    `Claude Code hat jetzt keine Erinnerung mehr an vorherige Nachrichten.`,
    { parse_mode: 'Markdown' }
  );
});

/**
 * Start continuous typing indicator
 * Returns a function to stop it
 */
function startTypingIndicator(ctx) {
  // Send immediately
  ctx.replyWithChatAction('typing').catch(() => {});
  
  // Then every 4 seconds (Telegram typing expires after ~5s)
  const interval = setInterval(() => {
    ctx.replyWithChatAction('typing').catch(() => {});
  }, 4000);
  
  // Return stop function
  return () => clearInterval(interval);
}

// Handle text messages
bot.on('message:text', async (ctx) => {
  const userId = ctx.from?.id;
  const text = ctx.message.text;
  
  // Ignore commands
  if (text.startsWith('/')) {
    return;
  }
  
  if (!isUserAllowed(userId)) {
    await ctx.reply('⛔ Du bist nicht berechtigt, diesen Bot zu verwenden.');
    return;
  }
  
  const chatId = ctx.chat?.id;
  
  // Prevent concurrent requests from same chat
  const lockKey = `${chatId}`;
  if (processingUsers.has(lockKey)) {
    await ctx.reply('⏳ Bitte warte, bis die vorherige Anfrage abgeschlossen ist...');
    return;
  }
  
  processingUsers.add(lockKey);
  
  // Start continuous typing indicator
  const stopTyping = startTypingIndicator(ctx);
  
  try {
    const sessionId = getSessionId(ctx);
    const workingDir = getRepoForChat(chatId, config.workingDirectory);
    
    console.log(`📨 Chat ${chatId} (${sessionId}) in ${workingDir}: ${text.substring(0, 100)}...`);
    
    // Execute Claude Code
    const response = await executeClaudeCode(sessionId, text, {
      workingDirectory: workingDir,
    });
    
    // Send response
    await sendResponse(ctx, response);
    
  } catch (error) {
    console.error('Error processing text message:', error);
    await ctx.reply(`❌ Fehler: ${error.message}`);
  } finally {
    stopTyping();
    processingUsers.delete(lockKey);
  }
});

// Handle voice messages
bot.on('message:voice', async (ctx) => {
  const userId = ctx.from?.id;
  const voice = ctx.message.voice;
  
  if (!isUserAllowed(userId)) {
    await ctx.reply('⛔ Du bist nicht berechtigt, diesen Bot zu verwenden.');
    return;
  }
  
  const chatId = ctx.chat?.id;
  
  // Prevent concurrent requests
  const lockKey = `${chatId}`;
  if (processingUsers.has(lockKey)) {
    await ctx.reply('⏳ Bitte warte, bis die vorherige Anfrage abgeschlossen ist...');
    return;
  }
  
  processingUsers.add(lockKey);
  
  // Start continuous typing indicator
  const stopTyping = startTypingIndicator(ctx);
  
  try {
    // Acknowledge receipt
    const statusMsg = await ctx.reply('🎤 Transkribiere Sprachnachricht...');
    
    // Process voice message
    const { raw, refined } = await processVoiceMessage(ctx, voice.file_id);
    
    // Show what was understood
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `📝 *Verstanden:*\n${refined}\n\n⏳ Sende an Claude Code...`,
      { parse_mode: 'Markdown' }
    );
    
    const sessionId = getSessionId(ctx);
    const workingDir = getRepoForChat(chatId, config.workingDirectory);
    
    console.log(`🎤 Chat ${chatId} (${sessionId}) in ${workingDir}: ${refined.substring(0, 100)}...`);
    
    // Execute Claude Code with refined transcript
    const response = await executeClaudeCode(sessionId, refined, {
      workingDirectory: workingDir,
    });
    
    // Delete status message
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
    
    // Send response
    await sendResponse(ctx, response);
    
  } catch (error) {
    console.error('Error processing voice message:', error);
    await ctx.reply(`❌ Fehler: ${error.message}`);
  } finally {
    stopTyping();
    processingUsers.delete(lockKey);
  }
});

// Handle audio files (voice notes sent as audio)
bot.on('message:audio', async (ctx) => {
  await ctx.reply('ℹ️ Bitte sende Sprachnachrichten direkt (halte den Mikrofon-Button gedrückt), nicht als Audio-Datei.');
});

// Error handling
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

// Start the bot
console.log('🚀 Starting Claude Telegram Bot...');
console.log(`📁 Default working directory: ${config.workingDirectory}`);
console.log(`🤖 Model: ${config.claudeModel}`);
console.log(`🔒 Allowed users: ${config.allowedUsers.length === 0 ? 'ALL' : config.allowedUsers.join(', ')}`);

bot.start();
