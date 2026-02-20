/**
 * Session Management
 * 
 * Maps logical session names to Claude Code UUIDs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// Path to store session mappings
const SESSIONS_FILE = join(process.cwd(), 'data', 'sessions.json');

// In-memory cache
let sessionMappings = {};

/**
 * Load session mappings from file
 */
export function loadSessionMappings() {
  try {
    if (existsSync(SESSIONS_FILE)) {
      const data = readFileSync(SESSIONS_FILE, 'utf-8');
      sessionMappings = JSON.parse(data);
      console.log(`📋 Loaded ${Object.keys(sessionMappings).length} session mappings`);
    }
  } catch (error) {
    console.error('Error loading session mappings:', error);
    sessionMappings = {};
  }
  return sessionMappings;
}

/**
 * Save session mappings to file
 */
function saveSessionMappings() {
  try {
    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    
    writeFileSync(SESSIONS_FILE, JSON.stringify(sessionMappings, null, 2));
  } catch (error) {
    console.error('Error saving session mappings:', error);
  }
}

/**
 * Get or create a UUID for a logical session name
 * 
 * @param {string} logicalName - Our session name (e.g., "telegram-group-123-abc123")
 * @returns {string} UUID for Claude Code
 */
export function getSessionUUID(logicalName) {
  if (sessionMappings[logicalName]) {
    return sessionMappings[logicalName].uuid;
  }
  
  // Create new UUID
  const uuid = randomUUID();
  sessionMappings[logicalName] = {
    uuid,
    createdAt: new Date().toISOString(),
  };
  
  saveSessionMappings();
  console.log(`📋 Created new session: ${logicalName} → ${uuid}`);
  
  return uuid;
}

/**
 * Reset a session (create new UUID)
 * 
 * @param {string} logicalName - Our session name
 * @returns {string} New UUID
 */
export function resetSession(logicalName) {
  const uuid = randomUUID();
  sessionMappings[logicalName] = {
    uuid,
    createdAt: new Date().toISOString(),
    previousUUID: sessionMappings[logicalName]?.uuid,
  };
  
  saveSessionMappings();
  console.log(`🔄 Reset session: ${logicalName} → ${uuid}`);
  
  return uuid;
}

/**
 * Get session info
 * 
 * @param {string} logicalName - Our session name
 * @returns {object|null} Session info or null
 */
export function getSessionInfo(logicalName) {
  return sessionMappings[logicalName] || null;
}

// Load mappings on module import
loadSessionMappings();
