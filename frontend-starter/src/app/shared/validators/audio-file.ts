/** Same rules as the backend (backend/src/app.js: `allowed` and MAX_FILE_SIZE). */
export const AUDIO_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
];
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

/** Returns an error message for an invalid file, or null when the file can be sent. */
export function validateAudioFile(file: File): string | null {
  if (!AUDIO_TYPES.includes(file.type)) {
    return `Format non accepté (${file.type || 'inconnu'}) : choisissez un fichier MP3, WAV, OGG ou M4A.`;
  }
  if (file.size > MAX_AUDIO_SIZE) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    return `Fichier trop volumineux (${sizeMb} Mo) : la limite est de 25 Mo.`;
  }
  return null;
}
