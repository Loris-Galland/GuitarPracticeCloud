import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("health sans dépendre de MongoDB", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("schémas Mongoose et relation", () => {
  const u = new User({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  assert.equal(u.email, "test@example.com");
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });
  
  assert.equal(t.title, "Blues");
  assert.equal(Track.schema.path("ownerId").options.ref, "User");
});

test("toPublic expose hasCover mais jamais les noms de fichiers", () => {
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });
  assert.equal(t.toPublic().hasCover, false);

  t.coverName = "y.png";
  t.coverType = "image/png";
  const pub = t.toPublic();
  assert.equal(pub.hasCover, true);
  assert.equal("coverName" in pub, false);
  assert.equal("storedName" in pub, false);
});

test("plugin aggregate-paginate branché sur Track", () => {
  assert.equal(typeof Track.aggregatePaginate, "function");
});

// --- TP3 : tests de contrat et de sécurité qui répondent avant tout accès à MongoDB ---

// Sans .env, le serveur utilise le secret de développement : on peut signer un vrai JWT.
const validToken = () =>
  jwt.sign({ sub: new mongoose.Types.ObjectId().toString() }, "tp1-development-secret", { expiresIn: "5m" });

test("401 sans JWT sur une route protégée", async () => {
  const r = await fetch(base + "/api/tracks");
  assert.equal(r.status, 401);
  assert.equal((await r.json()).message, "Authentification requise");
});

test("401 avec un JWT signé par un autre secret", async () => {
  const forged = jwt.sign({ sub: "pirate" }, "pas-le-bon-secret");
  const r = await fetch(base + "/api/tracks", { headers: { Authorization: `Bearer ${forged}` } });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).message, "Jeton invalide ou expiré");
});

test("401 avec un JWT expiré", async () => {
  const expired = jwt.sign({ sub: "x", exp: Math.floor(Date.now() / 1000) - 60 }, "tp1-development-secret");
  const r = await fetch(base + "/api/tracks", { headers: { Authorization: `Bearer ${expired}` } });
  assert.equal(r.status, 401);
});

test("400 pour un upload sans fichier", async () => {
  const body = new FormData();
  body.append("title", "Sans fichier");
  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: { Authorization: `Bearer ${validToken()}` },
    body,
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Fichier audio requis");
});

test("400 pour un type MIME refusé", async () => {
  const body = new FormData();
  body.append("audio", new Blob(["pas du son"], { type: "text/plain" }), "notes.txt");
  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: { Authorization: `Bearer ${validToken()}` },
    body,
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).message, "Format audio non accepté");
});

test("401 sans JWT sur la recherche de pochette", async () => {
  const r = await fetch(base + "/api/tracks/abc/cover/lookup", { method: "POST" });
  assert.equal(r.status, 401);
});

test("toPublic expose artiste, album et origine de la couverture", () => {
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Get Lucky",
    artist: "Daft Punk",
    album: "Random Access Memories",
    originalName: "g.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
    coverName: "y.jpg",
    coverType: "image/jpeg",
    coverSource: "web",
  });
  const pub = t.toPublic();
  assert.equal(pub.artist, "Daft Punk");
  assert.equal(pub.album, "Random Access Memories");
  assert.equal(pub.coverSource, "web");
  assert.equal("coverName" in pub, false);
});
