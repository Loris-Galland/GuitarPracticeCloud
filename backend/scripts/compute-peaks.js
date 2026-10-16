import path from "node:path";
import mongoose from "mongoose";
import { Track } from "../src/models/Track.js";
import { computeWaveform } from "../src/waveform.js";

/*
 * Calcule la forme d'onde des pistes envoyées avant son ajout à l'upload.
 * Lancement : npm run peaks (depuis backend/, avec le même .env que le serveur).
 * Les pistes qui ont déjà des pics sont ignorées, le script peut donc être relancé.
 */
const UPLOADS = path.resolve("data/uploads");

await mongoose.connect(process.env.MONGODB_URI);

const tracks = await Track.find({ peaks: { $exists: false } }).select("+storedName");
console.log(`[peaks] ${tracks.length} piste(s) sans forme d'onde`);

let done = 0;
for (const track of tracks) {
  try {
    const { peaks, duration } = await computeWaveform(path.join(UPLOADS, track.storedName));
    await Track.updateOne({ _id: track._id }, { peaks, duration });
    done++;
    console.log(`[peaks] ${track.title} : ${duration} s`);
  } catch (error) {
    // Fichier absent ou illisible : on passe à la suivante sans tout arrêter.
    console.error(`[peaks] Échec pour ${track.title} (${track.id})`, error.message);
  }
}

console.log(`[peaks] Terminé : ${done}/${tracks.length}`);
await mongoose.disconnect();
