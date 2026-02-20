#!/usr/bin/env node

/**
 * Claude Telegram Bot
 * 
 * A Telegram bot that provides access to Claude Code CLI
 * with voice message support and session persistence.
 */

import { Bot, GrammyError, HttpError } from 'grammy';
import { config, validateConfig } from './config.js';
import { executeClaudeCode, createSessionId } from './claude.js';
import { processVoiceMessage } from './whisper.js';

// Validate configuration before starting
validateConfig();

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

// /start command
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!isUserAllowed(userId)) {
    await ctx.reply('⛔ Du bist nicht berechtigt, diesen Bot zu verwenden.');
    return;
  }
  
  await ctx.reply(
    `🤖 *Claude Code Telegram Bot*\n\n` +
    `Ich bin deine Brücke zu Claude Code!\n\n` +
    `*Befehle:*\n` +
    `• Schick mir eine Textnachricht → Claude Code antwortet\n` +
    `• Schick mir eine Sprachnachricht → Wird transkribiert und an Claude gesendet\n` +
    `• /status - Zeigt Session-Info\n` +
    `• /reset - Startet neue Session\n\n` +
    `*Session:* \`${createSessionId(userId)}\``,
    { parse_mode: 'Markdown' }
  );
});

// /status command
bot.command('status', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!isUserAllowed(userId)) {
    return;
  }
  
  const sessionId = createSessionId(userId);
  
  await ctx.reply(
    `📊 *Status*\n\n` +
    `• Session: \`${sessionId}\`\n` +
    `• Model: \`${config.claudeModel}\`\n` +
    `• Working Dir: \`${config.workingDirectory}\`\n` +
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
  
  // Note: Claude Code doesn't have a delete session command,
  // but we can use a new session ID with a timestamp
  const newSessionId = `${config.sessionPrefix}-${userId}-${Date.now()}`;
  
  await ctx.reply(
    `🔄 *Neue Session gestartet*\n\n` +
    `Die vorherige Session bleibt erhalten, aber du startest jetzt mit einer neuen.\n\n` +
    `Neue Session: \`${newSessionId}\``,
    { parse_mode: 'Markdown' }
  );
});

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
  
  // Prevent concurrent requests from same user
  if (processingUsers.has(userId)) {
    await ctx.reply('⏳ Bitte warte, bis die vorherige Anfrage abgeschlossen ist...');
    return;
  }
  
  processingUsers.add(userId);
  
  try {
    // Send typing indicator
    await ctx.replyWithChatAction('typing');
    
    const sessionId = createSessionId(userId);
    console.log(`📨 User ${userId} (${sessionId}): ${text.substring(0, 100)}...`);
    
    // Execute Claude Code
    const response = await executeClaudeCode(sessionId, text);
    
    // Send response
    await sendResponse(ctx, response);
    
  } catch (error) {
    console.error('Error processing text message:', error);
    await ctx.reply(`❌ Fehler: ${error.message}`);
  } finally {
    processingUsers.delete(userId);
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
  
  // Prevent concurrent requests
  if (processingUsers.has(userId)) {
    await ctx.reply('⏳ Bitte warte, bis die vorherige Anfrage abgeschlossen ist...');
    return;
  }
  
  processingUsers.add(userId);
  
  try {
    // Send typing indicator
    await ctx.replyWithChatAction('typing');
    
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
    
    const sessionId = createSessionId(userId);
    console.log(`🎤 User ${userId} (${sessionId}): ${refined.substring(0, 100)}...`);
    
    // Execute Claude Code with refined transcript
    const response = await executeClaudeCode(sessionId, refined);
    
    // Delete status message
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
    
    // Send response
    await sendResponse(ctx, response);
    
  } catch (error) {
    console.error('Error processing voice message:', error);
    await ctx.reply(`❌ Fehler: ${error.message}`);
  } finally {
    processingUsers.delete(userId);
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
console.log(`📁 Working directory: ${config.workingDirectory}`);
console.log(`🤖 Model: ${config.claudeModel}`);
console.log(`🔒 Allowed users: ${config.allowedUsers.length === 0 ? 'ALL' : config.allowedUsers.join(', ')}`);

bot.start();
