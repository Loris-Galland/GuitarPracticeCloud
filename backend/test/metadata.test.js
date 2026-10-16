import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cleanText,
  detectImageType,
  lookupCover,
  parseFileName,
  readTags,
  saveCoverBuffer,
} from "../src/metadata.js";

// Début d'un PNG : la signature suffit pour detectImageType().
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);

/** Fabrique un tag ID3v2.3 minimal : un frame = identifiant (4) + taille (4) + flags (2) + contenu. */
function id3(frames) {
  const body = Buffer.concat(
    frames.map(([id, data]) => {
      const header = Buffer.alloc(10);
      header.write(id, 0, "latin1");
      header.writeUInt32BE(data.length, 4);
      return Buffer.concat([header, data]);
    }),
  );
  // La taille du tag est en « syncsafe » : 7 bits utiles par octet.
  const size = body.length;
  const header = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (size >> 21) & 127, (size >> 14) & 127, (size >> 7) & 127, size & 127]);
  return Buffer.concat([header, body]);
}
const text = (value) => Buffer.concat([Buffer.from([0]), Buffer.from(value, "latin1")]);
// APIC : encodage, type MIME, type d'image (3 = pochette de face), description vide, puis l'image.
const apic = (image) => Buffer.concat([Buffer.from([0]), Buffer.from("image/png\0", "latin1"), Buffer.from([3, 0]), image]);

test("detectImageType reconnaît JPEG, PNG et WebP par leur signature", () => {
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectImageType(PNG), "image/png");
  assert.equal(detectImageType(Buffer.from("RIFF0000WEBPVP8 ", "ascii")), "image/webp");
  // Un SVG (du texte) ou un faux fichier est refusé, quel que soit son nom.
  assert.equal(detectImageType(Buffer.from("<svg onload=alert(1)>")), null);
});

test("cleanText retire les caractères de contrôle et limite la longueur", () => {
  assert.equal(cleanText("  Blues\u0000 en  La \n"), "Blues en La");
  assert.equal(cleanText("x".repeat(300)).length, 200);
  assert.equal(cleanText("   "), undefined);
  assert.equal(cleanText(42), undefined);
});

test("parseFileName déduit artiste et titre de « Artiste - Titre.mp3 »", () => {
  assert.deepEqual(parseFileName("Daft Punk - Get Lucky.mp3"), { artist: "Daft Punk", title: "Get Lucky" });
  assert.deepEqual(parseFileName("Beat_Keep_Rocking.mp3"), { title: "Beat Keep Rocking" });
});

test("readTags lit titre, artiste et pochette dans un tag ID3", async () => {
  const file = path.join(os.tmpdir(), `gpc-test-${Date.now()}.mp3`);
  await fs.writeFile(file, id3([["TIT2", text("Blues en La")], ["TPE1", text("Le Binome")], ["APIC", apic(PNG)]]));
  try {
    const tags = await readTags(file);
    assert.equal(tags.title, "Blues en La");
    assert.equal(tags.artist, "Le Binome");
    assert.equal(detectImageType(tags.picture), "image/png");
  } finally {
    await fs.rm(file, { force: true });
  }
});

test("readTags renvoie un objet vide pour un fichier illisible au lieu de planter", async () => {
  assert.deepEqual(await readTags(path.join(os.tmpdir(), "fichier-qui-n-existe-pas.mp3")), {});
});

test("saveCoverBuffer refuse ce qui n'est pas une vraie image", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gpc-covers-"));
  try {
    assert.equal(await saveCoverBuffer(Buffer.from("pas une image"), dir), null);
    const saved = await saveCoverBuffer(PNG, dir);
    assert.equal(saved.coverType, "image/png");
    assert.match(saved.coverName, /^[0-9a-f-]{36}\.png$/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("lookupCover : MusicBrainz puis Cover Art Archive, avec un faux fetch", async () => {
  const release = "11111111-2222-3333-4444-555555555555";
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, userAgent: options.headers["User-Agent"] });
    if (url.startsWith("https://musicbrainz.org/")) {
      return Response.json({ recordings: [{ score: 100, releases: [{ id: release }] }] });
    }
    return new Response(PNG, { status: 200 });
  };

  const found = await lookupCover("Daft Punk", "Get Lucky", { fetchImpl: fakeFetch });

  assert.equal(found.releaseId, release);
  assert.equal(detectImageType(found.buffer), "image/png");
  // La recherche contient bien titre et artiste, et MusicBrainz reçoit un User-Agent.
  assert.match(decodeURIComponent(calls[0].url), /recording:"Get Lucky" AND artist:"Daft Punk"/);
  assert.ok(calls[0].userAgent);
  assert.equal(calls[1].url, `https://coverartarchive.org/release/${release}/front-250`);
});

test("lookupCover ignore les résultats peu fiables et renvoie null", async () => {
  const fakeFetch = async () => Response.json({ recordings: [{ score: 40, releases: [{ id: "11111111-2222-3333-4444-555555555555" }] }] });
  assert.equal(await lookupCover("Inconnu", "Rien", { fetchImpl: fakeFetch }), null);
});
