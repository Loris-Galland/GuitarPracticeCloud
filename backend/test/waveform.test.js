import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { computeWaveform, peaksFromSamples } from "../src/waveform.js";

const MP3 = path.resolve("../frontend-starter/fichiers-audio-de-test/song1.mp3");

/** Fabrique un WAV 16 bits mono : en-tête RIFF de 44 octets puis les échantillons. */
function wav(samples, rate = 8000) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(s, i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test("peaksFromSamples garde le pic absolu de chaque tranche, entre 0 et 1", () => {
  const samples = new Int16Array([0, 16384, -32768, 100, 0, -8192]);
  assert.deepEqual(peaksFromSamples(samples, 3), [0.5, 1, 0.25]);
});

test("peaksFromSamples renvoie toujours le nombre de points demandé", () => {
  assert.equal(peaksFromSamples(new Int16Array(10_000).fill(1000), 800).length, 800);
  // Fichier plus court que le nombre de points : chaque tranche a quand même un échantillon.
  assert.equal(peaksFromSamples(new Int16Array([32767, 0, 32767]), 8).length, 8);
  assert.deepEqual(peaksFromSamples(new Int16Array(0), 800), []);
});

test("computeWaveform décode un WAV avec ffmpeg : pics et durée", async () => {
  // 1 seconde de silence puis 1 seconde à mi-volume.
  const samples = [...new Array(8000).fill(0), ...new Array(8000).fill(16384)];
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "gpc-wave-")), "test.wav");
  await fs.writeFile(file, wav(samples));

  const { peaks, duration } = await computeWaveform(file, 4);
  assert.equal(duration, 2);
  assert.deepEqual(peaks, [0, 0, 0.5, 0.5]);
});

test("computeWaveform lit aussi un vrai MP3", async () => {
  const { peaks, duration } = await computeWaveform(MP3);
  assert.equal(peaks.length, 800);
  assert.ok(duration > 1, `durée trop courte : ${duration}`);
  assert.ok(peaks.every((p) => p >= 0 && p <= 1));
  assert.ok(Math.max(...peaks) > 0.1, "le morceau ne devrait pas être silencieux");
});

test("computeWaveform échoue proprement sur un fichier qui n'est pas de l'audio", async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "gpc-wave-")), "faux.mp3");
  await fs.writeFile(file, "pas du son");
  await assert.rejects(computeWaveform(file), /ffmpeg a échoué/);
});
