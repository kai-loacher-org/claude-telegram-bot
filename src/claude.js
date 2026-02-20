/**
 * Claude Code CLI Wrapper
 * 
 * Executes Claude Code CLI commands and manages sessions
 */
import { spawn } from 'child_process';
import { config } from './config.js';
import { getSessionUUID } from './sessions.js';

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
    // Get or create UUID for this logical session
    const sessionUUID = getSessionUUID(sessionId);
    
    // Escape query for shell usage (double quotes)
    const escapedQuery = query
      .replace(/\\/g, '\\\\')   // Escape backslashes first
      .replace(/"/g, '\\"')     // Escape double quotes
      .replace(/\$/g, '\\$')    // Escape dollar signs
      .replace(/`/g, '\\`');    // Escape backticks
    
    // Build command with proper quoting - use --session-id with UUID
    let cmd = `claude --session-id "${sessionUUID}" -p "${escapedQuery}" --dangerously-skip-permissions`;
    
    // Only specify model if explicitly configured
    if (config.claudeModel) {
      cmd += ` --model ${config.claudeModel}`;
    }
    
    console.log(`🤖 Executing: ${cmd.substring(0, 200)}...`);
    
    // Build environment - only include API key if explicitly set
    const spawnEnv = { ...process.env };
    if (config.anthropicApiKey) {
      spawnEnv.ANTHROPIC_API_KEY = config.anthropicApiKey;
    }
    
    // Use shell: true to properly handle quoted arguments
    const claude = spawn(cmd, [], {
      cwd: options.workingDirectory || config.workingDirectory,
      env: spawnEnv,
      shell: true,  // Use shell for proper quote handling
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
    const spawnEnv = { ...process.env };
    if (config.anthropicApiKey) {
      spawnEnv.ANTHROPIC_API_KEY = config.anthropicApiKey;
    }
    
    const claude = spawn('claude', ['-r'], { env: spawnEnv });
    
    let stdout = '';
    claude.stdout.on('data', (data) => stdout += data.toString());
    claude.on('close', () => resolve(stdout));
    claude.on('error', reject);
  });
}
