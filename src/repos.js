/**
 * Repository Management
 * 
 * Maps Telegram chats to working directories (repos)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { statSync } from 'fs';
import { createHash } from 'crypto';

// Path to store chat->repo mappings
const REPOS_FILE = join(process.cwd(), 'data', 'repos.json');

// In-memory cache
let repoMappings = {};

/**
 * Load repo mappings from file
 */
export function loadRepoMappings() {
  try {
    if (existsSync(REPOS_FILE)) {
      const data = readFileSync(REPOS_FILE, 'utf-8');
      repoMappings = JSON.parse(data);
      console.log(`📂 Loaded ${Object.keys(repoMappings).length} repo mappings`);
    }
  } catch (error) {
    console.error('Error loading repo mappings:', error);
    repoMappings = {};
  }
  return repoMappings;
}

/**
 * Save repo mappings to file
 */
function saveRepoMappings() {
  try {
    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      const { mkdirSync } = require('fs');
      mkdirSync(dataDir, { recursive: true });
    }
    
    writeFileSync(REPOS_FILE, JSON.stringify(repoMappings, null, 2));
  } catch (error) {
    console.error('Error saving repo mappings:', error);
  }
}

/**
 * Set repo for a chat
 * 
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} repoPath - Absolute path to repository
 * @returns {boolean} Success
 */
export function setRepoForChat(chatId, repoPath) {
  // Validate path exists and is a directory
  try {
    const stats = statSync(repoPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }
  } catch (error) {
    throw new Error(`Invalid path: ${repoPath} - ${error.message}`);
  }
  
  repoMappings[String(chatId)] = {
    path: repoPath,
    setAt: new Date().toISOString(),
  };
  
  saveRepoMappings();
  return true;
}

/**
 * Get repo for a chat
 * 
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} defaultPath - Default path if not set
 * @returns {string} Repository path
 */
export function getRepoForChat(chatId, defaultPath = process.cwd()) {
  const mapping = repoMappings[String(chatId)];
  return mapping?.path || defaultPath;
}

/**
 * Remove repo mapping for a chat
 * 
 * @param {number|string} chatId - Telegram chat ID
 */
export function removeRepoForChat(chatId) {
  delete repoMappings[String(chatId)];
  saveRepoMappings();
}

/**
 * List all repo mappings
 * 
 * @returns {object} All mappings
 */
export function listRepoMappings() {
  return { ...repoMappings };
}

/**
 * Get repo info for display
 * 
 * @param {number|string} chatId - Telegram chat ID
 * @returns {object|null} Repo info or null
 */
export function getRepoInfo(chatId) {
  return repoMappings[String(chatId)] || null;
}

/**
 * Create a short hash of a repo path for session IDs
 * 
 * @param {string} repoPath - Repository path
 * @returns {string} Short hash (8 chars)
 */
export function hashRepoPath(repoPath) {
  return createHash('md5')
    .update(repoPath)
    .digest('hex')
    .substring(0, 8);
}

// Load mappings on module import
loadRepoMappings();
