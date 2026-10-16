import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { parseFile } from "music-metadata";

/*
 * Métadonnées des pistes : lecture des tags ID3 du fichier audio, déduction à
 * partir du nom du fichier, et recherche de pochette sur des services publics
 * (MusicBrainz pour identifier le morceau, Cover Art Archive pour l'image).
 */

// Même limite que pour une couverture envoyée à la main.
export const MAX_COVER_SIZE = 2 * 1024 * 1024;
const EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

// MusicBrainz demande un User-Agent qui identifie l'application et au plus 1 requête par seconde.
const USER_AGENT = "GuitarPracticeCloud/1.0 (projet etudiant M1 MIAGE)";
const MUSICBRAINZ = "https://musicbrainz.org/ws/2/recording";
const COVER_ART_ARCHIVE = "https://coverartarchive.org/release";

/**
 * Reconnaît le format d'une image à ses premiers octets (sa « signature »),
 * sans faire confiance au type annoncé. Renvoie null si ce n'est ni JPEG, ni PNG, ni WebP.
 */
export function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** Nettoie un texte venant d'un fichier ou d'un service externe avant de le stocker. */
export function cleanText(value) {
  if (typeof value !== "string") return undefined;
  // Retire les caractères de contrôle et limite la longueur : ces données ne sont pas fiables.
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return text || undefined;
}

/**
 * Déduit artiste et titre d'un nom de fichier du type « Artiste - Titre.mp3 ».
 * Sans tiret, seul le titre (nom sans extension) est renvoyé.
 */
export function parseFileName(originalName) {
  const base = path.parse(originalName).name.replace(/_/g, " ");
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: cleanText(parts[0]), title: cleanText(parts.slice(1).join(" - ")) };
  }
  return { title: cleanText(base) };
}

/**
 * Lit les tags (ID3v1, ID3v2.2 à 2.4, et les équivalents des autres formats).
 * Un tag illisible ne doit pas faire échouer l'upload : on renvoie alors un objet vide.
 */
export async function readTags(filePath) {
  try {
    const { common } = await parseFile(filePath, { duration: false });
    const picture = common.picture?.[0];
    return {
      title: cleanText(common.title),
      artist: cleanText(common.artist),
      album: cleanText(common.album),
      picture: picture ? Buffer.from(picture.data) : undefined,
    };
  } catch (error) {
    console.warn(`[metadata] Tags illisibles pour ${path.basename(filePath)}`, error.message);
    return {};
  }
}

/**
 * Enregistre une image reçue en mémoire (pochette ID3 ou téléchargée) avec les
 * mêmes règles qu'une couverture envoyée à la main : 2 Mo, JPEG/PNG/WebP vérifié
 * par signature. Renvoie { coverName, coverType } ou null si l'image est refusée.
 */
export async function saveCoverBuffer(buffer, uploadsDir) {
  const type = detectImageType(buffer);
  if (!type || buffer.length > MAX_COVER_SIZE) {
    console.warn(`[metadata] Image refusée (type ${type ?? "inconnu"}, ${buffer.length} octets)`);
    return null;
  }
  const coverName = crypto.randomUUID() + EXTENSIONS[type];
  await fsPromises.writeFile(path.join(uploadsDir, coverName), buffer);
  console.log(`[metadata] Pochette enregistrée : ${coverName}`);
  return { coverName, coverType: type };
}

/** Échappe les caractères spéciaux de la syntaxe de recherche (Lucene) de MusicBrainz. */
function escapeLucene(text) {
  return text.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
}

// Les appels à MusicBrainz sont mis à la file : au moins 1 seconde entre deux requêtes.
let musicBrainzQueue = Promise.resolve();
let lastMusicBrainzCall = 0;
function throttled(task) {
  const run = musicBrainzQueue.then(async () => {
    const wait = lastMusicBrainzCall + 1000 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastMusicBrainzCall = Date.now();
    return task();
  });
  musicBrainzQueue = run.catch(() => undefined);
  return run;
}

/**
 * Cherche une pochette pour (artiste, titre) :
 * 1. MusicBrainz trouve les enregistrements correspondants et leurs albums (releases) ;
 * 2. Cover Art Archive fournit l'image de face de l'album, en 250 px.
 * Renvoie { buffer, releaseId } ou null si rien n'est trouvé.
 * fetchImpl est injectable pour tester sans réseau.
 */
export async function lookupCover(artist, title, { fetchImpl = fetch, minScore = 80 } = {}) {
  const query = `recording:"${escapeLucene(title)}" AND artist:"${escapeLucene(artist)}"`;
  const url = `${MUSICBRAINZ}?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
  console.log(`[metadata] Recherche MusicBrainz : ${JSON.stringify({ artist, title })}`);

  const response = await throttled(() =>
    fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(8000) }),
  );
  if (!response.ok) throw new Error(`MusicBrainz a répondu ${response.status}`);
  const data = await response.json();

  // Seuls les résultats assez proches de la recherche sont gardés (score de 0 à 100).
  const releaseIds = (data.recordings ?? [])
    .filter((recording) => (recording.score ?? 0) >= minScore)
    .flatMap((recording) => (recording.releases ?? []).map((release) => release.id))
    .filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id));

  // Quelques albums au maximum : beaucoup n'ont pas de pochette sur Cover Art Archive.
  for (const releaseId of [...new Set(releaseIds)].slice(0, 4)) {
    const image = await fetchImpl(`${COVER_ART_ARCHIVE}/${releaseId}/front-250`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!image.ok) continue;
    const buffer = Buffer.from(await image.arrayBuffer());
    if (buffer.length <= MAX_COVER_SIZE && detectImageType(buffer)) {
      console.log(`[metadata] Pochette trouvée sur Cover Art Archive (release ${releaseId})`);
      return { buffer, releaseId };
    }
  }
  console.log("[metadata] Aucune pochette trouvée");
  return null;
}
