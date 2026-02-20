/**
 * Claude Code CLI Wrapper
 * 
 * Executes Claude Code CLI commands and manages sessions
 */
import { spawn } from 'child_process';
import { config } from './config.js';

/**
 * Execute a Claude Code query with session persistence
 * 
 * @param {string} sessionId - Unique session identifier (e.g., "telegram-123456")
 * @param {string} query - The user's message/query
 * @param {object} options - Additional options
 * @returns {Promise<string>} Claude's response
 */
export async function executeClaudeCode(sessionId, query, options = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-r', sessionId,           // Resume session by name
      '-p', query,               // Print mode (non-interactive)
    ];
    
    // Only specify model if explicitly configured
    // Otherwise let Claude Code decide (uses Opus with automatic Sonnet fallback)
    if (config.claudeModel) {
      args.push('--model', config.claudeModel);
    }
    
    // Add working directory if specified
    if (options.workingDirectory || config.workingDirectory) {
      // Claude Code uses current directory, so we'll set cwd in spawn
    }
    
    // Add any additional flags
    if (options.appendSystemPrompt) {
      args.push('--append-system-prompt', options.appendSystemPrompt);
    }
    
    console.log(`🤖 Executing: claude ${args.join(' ')}`);
    
    const claude = spawn('claude', args, {
      cwd: options.workingDirectory || config.workingDirectory,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: config.anthropicApiKey,
      },
      // Increase buffer for long responses
      maxBuffer: 1024 * 1024 * 10, // 10MB
    });
    
    let stdout = '';
    let stderr = '';
    
    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    claude.on('close', (code) => {
      if (code === 0) {
        // Clean up the response
        const response = cleanClaudeResponse(stdout);
        resolve(response);
      } else {
        console.error(`Claude Code exited with code ${code}`);
        console.error('stderr:', stderr);
        reject(new Error(`Claude Code failed: ${stderr || 'Unknown error'}`));
      }
    });
    
    claude.on('error', (err) => {
      reject(new Error(`Failed to start Claude Code: ${err.message}`));
    });
    
    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      claude.kill();
      reject(new Error('Claude Code timed out after 5 minutes'));
    }, 5 * 60 * 1000);
    
    claude.on('close', () => clearTimeout(timeout));
  });
}

/**
 * Clean up Claude Code response
 * Remove ANSI codes, progress indicators, etc.
 */
function cleanClaudeResponse(response) {
  return response
    // Remove ANSI escape codes
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // Remove carriage returns
    .replace(/\r/g, '')
    // Remove progress spinners and status lines
    .replace(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏].*$/gm, '')
    // Remove multiple empty lines
    .replace(/\n{3,}/g, '\n\n')
    // Trim whitespace
    .trim();
}

/**
 * Create a new session for a user
 * 
 * @param {number} userId - Telegram user ID
 * @returns {string} Session ID
 */
export function createSessionId(userId) {
  return `${config.sessionPrefix}-${userId}`;
}

/**
 * List available sessions (for debugging)
 */
export async function listSessions() {
  return new Promise((resolve, reject) => {
    const claude = spawn('claude', ['-r'], {
      env: { ...process.env, ANTHROPIC_API_KEY: config.anthropicApiKey },
    });
    
    let stdout = '';
    claude.stdout.on('data', (data) => stdout += data.toString());
    claude.on('close', () => resolve(stdout));
    claude.on('error', reject);
  });
}
