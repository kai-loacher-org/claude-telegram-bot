/**
 * Whisper Transcription Module
 * 
 * Handles voice message transcription and optional refinement
 */
import OpenAI from 'openai';
import { createReadStream, createWriteStream, unlinkSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { config } from './config.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Download a file from Telegram
 * 
 * @param {object} ctx - Grammy context
 * @param {string} fileId - Telegram file ID
 * @returns {Promise<string>} Path to downloaded file
 */
export async function downloadVoiceFile(ctx, fileId) {
  const file = await ctx.api.getFile(fileId);
  const filePath = file.file_path;
  
  // Get the file URL
  const fileUrl = `https://api.telegram.org/file/bot${config.telegramToken}/${filePath}`;
  
  // Download to temp directory
  const tempPath = join(tmpdir(), `voice_${randomUUID()}.ogg`);
  
  const response = await fetch(fileUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(tempPath, buffer);
  
  return tempPath;
}

/**
 * Transcribe audio file using Whisper
 * 
 * @param {string} audioPath - Path to audio file
 * @param {string} language - Language hint (default: 'de' for German)
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(audioPath, language = 'de') {
  console.log(`🎤 Transcribing: ${audioPath}`);
  
  const transcription = await openai.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: 'whisper-1',
    language: language,
    response_format: 'text',
  });
  
  console.log(`📝 Raw transcription: ${transcription}`);
  
  return transcription;
}

/**
 * Refine transcript - remove filler words, stutters, and clean up
 * 
 * @param {string} transcript - Raw transcript
 * @returns {Promise<string>} Refined transcript
 */
export async function refineTranscript(transcript) {
  if (!config.refineTranscripts) {
    return transcript;
  }
  
  console.log('✨ Refining transcript...');
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Du bist ein Transkriptions-Assistent. Deine Aufgabe ist es, gesprochenen Text zu bereinigen:

1. Entferne Füllwörter (ähm, äh, also, halt, quasi, sozusagen, irgendwie)
2. Entferne Wiederholungen und Stotterer
3. Korrigiere offensichtliche Spracherkennungsfehler
4. Behalte den Inhalt und die Bedeutung exakt bei
5. Formatiere als klaren, lesbaren Text
6. KEINE Zusammenfassung - der volle Inhalt muss erhalten bleiben

Antworte NUR mit dem bereinigten Text, ohne Erklärungen.`
      },
      {
        role: 'user',
        content: transcript
      }
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });
  
  const refined = completion.choices[0]?.message?.content || transcript;
  console.log(`✅ Refined: ${refined}`);
  
  return refined;
}

/**
 * Full pipeline: Download, transcribe, and optionally refine
 * 
 * @param {object} ctx - Grammy context
 * @param {string} fileId - Telegram file ID
 * @returns {Promise<{raw: string, refined: string}>} Transcription results
 */
export async function processVoiceMessage(ctx, fileId) {
  let tempPath = null;
  
  try {
    // Download the voice file
    tempPath = await downloadVoiceFile(ctx, fileId);
    
    // Transcribe with Whisper
    const rawTranscript = await transcribeAudio(tempPath);
    
    // Refine if enabled
    const refinedTranscript = await refineTranscript(rawTranscript);
    
    return {
      raw: rawTranscript,
      refined: refinedTranscript,
    };
  } finally {
    // Clean up temp file
    if (tempPath) {
      try {
        unlinkSync(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}
