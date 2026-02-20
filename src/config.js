/**
 * Configuration for Claude Telegram Bot
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

export const config = {
  // Telegram Bot Token (from @BotFather)
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  
  // OpenAI API Key (for Whisper transcription)
  openaiApiKey: process.env.OPENAI_API_KEY,
  
  // Anthropic API Key (for Claude Code)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  
  // Allowed Telegram User IDs (comma-separated in env)
  // Leave empty to allow all users
  allowedUsers: process.env.ALLOWED_USERS 
    ? process.env.ALLOWED_USERS.split(',').map(id => parseInt(id.trim()))
    : [],
  
  // Working directory for Claude Code
  workingDirectory: process.env.WORKING_DIRECTORY || process.cwd(),
  
  // Claude Code model (leave empty to let Claude Code decide - uses Opus with Sonnet fallback)
  claudeModel: process.env.CLAUDE_MODEL || '',
  
  // Session prefix for naming
  sessionPrefix: process.env.SESSION_PREFIX || 'telegram',
  
  // Enable voice message refinement (remove stutters, filler words)
  refineTranscripts: process.env.REFINE_TRANSCRIPTS !== 'false',
  
  // Max tokens for Claude Code response
  maxResponseLength: parseInt(process.env.MAX_RESPONSE_LENGTH) || 4000,
};

// Validate required config
export function validateConfig() {
  const required = ['telegramToken', 'openaiApiKey', 'anthropicApiKey'];
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => {
      const envName = key.replace(/([A-Z])/g, '_$1').toUpperCase();
      console.error(`   - ${envName}`);
    });
    process.exit(1);
  }
  
  console.log('✅ Configuration validated');
  return true;
}
