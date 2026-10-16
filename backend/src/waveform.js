import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/*
 * Forme d'onde pré-calculée. ffmpeg décode le fichier (MP3, WAV, OGG ou M4A)
 * en échantillons bruts, puis on garde le pic de chaque tranche. Le front n'a
 * plus qu'à dessiner ce tableau, sans décoder tout le fichier dans le navigateur.
 */

// Assez de points pour un écran large, assez peu pour rester léger en base (~5 Ko).
export const PEAK_COUNT = 800;
// Mono à 8 kHz : largement suffisant pour une forme d'onde et 6 fois moins de données qu'à 48 kHz.
const SAMPLE_RATE = 8000;
const TIMEOUT_MS = 30_000;

/**
 * Découpe les échantillons en `count` tranches et garde la valeur absolue
 * maximale de chacune, ramenée entre 0 et 1 (arrondie à 2 décimales).
 */
export function peaksFromSamples(samples, count = PEAK_COUNT) {
  if (samples.length === 0) return [];
  const size = samples.length / count;
  const peaks = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor(i * size);
    // Au moins un échantillon par tranche, même pour un fichier très court.
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    let max = 0;
    for (let j = from; j < to && j < samples.length; j++) {
      const value = Math.abs(samples[j]);
      if (value > max) max = value;
    }
    peaks.push(Math.round((max / 32768) * 100) / 100);
  }
  return peaks;
}

/** Lance ffmpeg et renvoie les échantillons 16 bits mono du fichier. */
function decode(filePath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      "-v", "error",
      "-i", filePath,
      "-ac", "1",
      "-ar", String(SAMPLE_RATE),
      "-f", "s16le",
      "-",
    ]);
    const chunks = [];
    let stderr = "";
    const timer = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      reject(new Error("ffmpeg trop long"));
    }, TIMEOUT_MS);

    ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk) => (stderr += chunk));
    ffmpeg.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    ffmpeg.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffmpeg a échoué (${code}) : ${stderr.trim()}`));
      const buffer = Buffer.concat(chunks);
      // Copie alignée : un Int16Array exige un décalage pair dans le buffer.
      const samples = new Int16Array(buffer.length >> 1);
      for (let i = 0; i < samples.length; i++) samples[i] = buffer.readInt16LE(i * 2);
      resolve(samples);
    });
  });
}

/** Calcule les pics et la durée (en secondes) d'un fichier audio. */
export async function computeWaveform(filePath, count = PEAK_COUNT) {
  const samples = await decode(filePath);
  return {
    peaks: peaksFromSamples(samples, count),
    duration: Math.round((samples.length / SAMPLE_RATE) * 100) / 100,
  };
}
