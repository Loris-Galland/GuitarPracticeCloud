import express from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { User } from "./models/User.js";
import { Track } from "./models/Track.js";
import {
  cleanText,
  detectImageType,
  lookupCover,
  MAX_COVER_SIZE,
  parseFileName,
  readTags,
  saveCoverBuffer,
} from "./metadata.js";

// Les fichiers audio restent sur le disque du serveur dans ce TP.
// MongoDB ne conserve que leurs métadonnées : titre, nom, taille, etc.
const UPLOADS = path.resolve("data/uploads");

try {
  // mkdirSync est utilisé au démarrage : l'application doit disposer de ce
  // dossier avant de pouvoir accepter le premier upload.
  fs.mkdirSync(UPLOADS, { recursive: true });
  console.log(`[startup] Dossier des uploads prêt : ${UPLOADS}`);
} catch (error) {
  console.error("[startup] Impossible de créer le dossier des uploads", error);
  throw error;
}

// Ce secret reste côté serveur. Il ne doit jamais être copié dans Angular.
const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

// La taille maximale d'un fichier audio est de 25 Mo. Les fichiers plus gros
// sont refusés par Multer avant d'être écrits sur le disque.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Les types MIME autorisés correspondent aux formats demandés dans le sujet.
const allowed = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);

/**
 * Crée un jeton JWT contenant uniquement l'identité nécessaire à l'API.
 * Le mot de passe n'est jamais placé dans le token. `sub` signifie subject
 * et contient l'identifiant MongoDB de l'utilisateur.
 */
function token(user) {
  console.log(`[auth] Création d'un token pour l'utilisateur ${user.id}`);
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, {
    expiresIn: "2h",
  });
}

/** Middleware Express qui protège les routes privées. */
function auth(req, res, next) {
  const raw = req.headers.authorization;

  // Le token est transmis dans l'en-tête Authorization sous la forme
    // "Authorization: Bearer <token>". Le préfixe "Bearer " est obligatoire pour que
    // le middleware sache qu'il s'agit d'un JWT et non d'un autre type de jeton.
  if (!raw?.startsWith("Bearer ")) {
    console.warn(`[auth] Authorization absente pour ${req.method} ${req.path}`);
    return res.status(401).json({ message: "Authentification requise" });
  }

  try {
    // jwt.verify vérifie la signature et la date d'expiration du token.
    // On ne logue jamais sa valeur, car un JWT permettrait une usurpation.
    req.auth = jwt.verify(raw.slice(7), SECRET);
    console.log(`[auth] Token accepté pour ${req.auth.sub}`);
    next();
  } catch (error) {
    console.error("[auth] Token invalide ou expiré", error);
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }
}

/*
 * Multer transforme une requête HTTP multipart/form-data en données exploitables
 * par Express et traite les fichiers envoyés par un formulaire HTML.
 * Documentation officielle : https://github.com/expressjs/multer
 *
 * diskStorage indique que Multer écrit directement le fichier sur disque.
 * Chaque callback doit appeler cb(error, value) : null signifie qu'il n'y a
 * pas d'erreur. Le nom aléatoire évite les collisions entre utilisateurs.
 */
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    console.debug(`[multer] Destination sélectionnée : ${UPLOADS}`);
    callback(null, UPLOADS);
  },
  filename: (_request, file, callback) => {
    const filename =
      crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    console.log(`[multer] Nom de stockage généré pour ${file.originalname}`);
    callback(null, filename);
  },
});

/*
 * limits.fileSize protège le serveur contre les fichiers trop volumineux.
 * fileFilter est appelé avant l'enregistrement : accepter le fichier appelle
 * callback(null, true), le refuser transmet une vraie Error à Express.
 */
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_request, file, callback) => {
    // Seuls les types MIME audio demandés dans le sujet sont acceptés.
    if (allowed.has(file.mimetype)) {
      console.log(`[multer] Type accepté : ${file.mimetype}`);
      return callback(null, true);
    }

    const error = new Error("Format audio non accepté");
    console.error(`[multer] Type refusé : ${file.mimetype}`, error);
    return callback(error);
  },
});

// Images de couverture : 2 Mo maximum, JPEG, PNG ou WebP uniquement.
// Le SVG est volontairement exclu : il peut contenir du JavaScript.
const allowedCovers = new Set(["image/jpeg", "image/png", "image/webp"]);

const coverUpload = multer({
  storage,
  limits: { fileSize: MAX_COVER_SIZE },
  fileFilter: (_request, file, callback) => {
    if (allowedCovers.has(file.mimetype)) {
      console.log(`[multer] Image acceptée : ${file.mimetype}`);
      return callback(null, true);
    }

    const error = new Error("Format d'image non accepté");
    console.error(`[multer] Image refusée : ${file.mimetype}`, error);
    return callback(error);
  },
});

/**
 * Le type MIME est déclaré par le client et peut être faux : on vérifie donc
 * les premiers octets du fichier (la « signature » de chaque format).
 */
async function isRealImage(filePath, mimeType) {
  const handle = await fsPromises.open(filePath, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    // Même vérification que pour les pochettes lues dans les tags ID3 (voir metadata.js).
    return detectImageType(buffer.subarray(0, bytesRead)) === mimeType;
  } finally {
    await handle.close();
  }
}

/** Supprime un fichier du dossier uploads en journalisant un éventuel échec. */
async function removeUpload(filename) {
  const filePath = path.join(UPLOADS, filename);
  try {
    await fsPromises.unlink(filePath);
    console.log(`[uploads] Fichier supprimé : ${filePath}`);
  } catch (error) {
    console.error(`[uploads] Impossible de supprimer ${filePath}`, error);
  }
}

/**
 * Construit l'application Express sans ouvrir de port.
 * Cette séparation permet au serveur réel et aux tests de créer la même
 * application. Le port est ouvert uniquement dans server.js.
 */
export function createApp() {
  const app = express();

  // Journaliser la fin de chaque requête permet de suivre méthode, URL,
  // statut et durée sans exposer les corps contenant des mots de passe.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt} ms)`,
      );
    });
    next();
  });

  // CORS est nécessaire pour que le frontend Angular puisse appeler l'API.
  // C'est-à-dire que le navigateur autorise les requêtes cross-origin depuis localhost:4200.
  // Dans un vrai projet, il est recommandé de limiter les origines autorisées.
  app.use(cors());

  // Express ne gère pas nativement le JSON : ce middleware transforme le corps JSON en objet JavaScript 
  // accessible via req.body.
  // Il est placé avant les routes pour que toutes les requêtes JSON soient traitées.
  app.use(express.json());

  /** Endpoint public utilisé pour vérifier que l'API répond. */
  app.get("/api/health", (_req, res) => {
    console.log("[health] Vérification de l'API");
    res.json({ status: "ok" });
  });

  /** Requête POST pour "insertion" de donnée.
   * Inscrit un utilisateur et renvoie un token avec ses données publiques. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
   */
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { name, email, password } = req.body || {};
      console.log(`[auth] Tentative d'inscription pour ${email || "email absent"}`);

      if (!name || !email || !password || password.length < 8) {
        console.warn("[auth] Inscription refusée : données invalides ou incomplètes");
        return res.status(400).json({
          message: "Nom, email et mot de passe de 8 caractères requis",
        });
      }

      // Vérifie si l'email est déjà utilisé avant de créer un nouvel utilisateur.
      if (await User.exists({ email: String(email).toLowerCase() })) {
        console.warn(`[auth] Email déjà utilisé : ${email}`);
        return res.status(409).json({ message: "Email déjà utilisé" });
      }

      // Crée l'utilisateur et le stocke dans MongoDB. Le mot de passe est haché
      // par le hook pre('validate') défini dans le schéma Mongoose.
      const user = await User.create({ name, email, password });
      console.log(`[auth] Utilisateur créé : ${user.id}`);
      res.status(201).json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant l'inscription", error);
      next(error);
    }
  });

  /** Vérifie les identifiants et ouvre une session JWT. Les identifiants sont envoyés dans le corps de la 
   * requête par un HTTP POST. */
  app.post("/api/auth/login", async (req, res, next) => {
    try {
        // req.body est déjà un objet JavaScript grâce au middleware express.json() placé plus haut.
        // il contient les champs email et password envoyés par le frontend Angular.
      const email = String(req.body?.email || "").toLowerCase();
      console.log(`[auth] Tentative de connexion pour ${email || "email absent"}`);

      // Sélectionne le mot de passe haché pour vérifier les identifiants.
      // User est un modèle Mongoose qui correspond au schéma défini dans models/User.js.
      // on envoie les requête à MongoDB via cet objet. Le mot de passe haché est stocké dans 
      // passwordHash, mais il n'est pas renvoyé par défaut dans les requêtes pour 
      // des raisons de sécurité.
      const user = await User.findOne({ email }).select("+passwordHash");

      if (!user || !(await user.verifyPassword(req.body?.password || ""))) {
        console.warn(`[auth] Identifiants incorrects pour ${email}`);
        return res.status(401).json({ message: "Identifiants incorrects" });
      }

      console.log(`[auth] Connexion réussie : ${user.id}`);
      res.json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant la connexion", error);
      next(error);
    }
  });

  /** Retourne le profil public de l'utilisateur identifié par le JWT. 
   * Les paramètres sont :
   * @param auth - Le middleware qui vérifie le JWT et ajoute req.auth. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
  */
  app.get("/api/users/me", auth, async (req, res, next) => {
    try {
        // req.auth.sub contient l'identifiant MongoDB de l'utilisateur 
        // extrait du JWT par le middleware auth. ici req.auth est un objet ajouté par le middleware 
        // auth à la requête, et sub est la propriété qui contient l'identifiant de l'utilisateur.
      const user = await User.findById(req.auth.sub);
      if (!user) {
        console.warn(`[user] Profil introuvable : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Profil envoyé : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de lecture du profil", error);
      next(error);
    }
  });

  /** Modifie uniquement le nom de l'utilisateur connecté. */
  app.put("/api/users/me", auth, async (req, res, next) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.auth.sub,
        { $set: { name: req.body?.name } },
        { new: true, runValidators: true },
      );

      if (!user) {
        console.warn(`[user] Mise à jour impossible : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Nom mis à jour : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de mise à jour du profil", error);
      next(error);
    }
  });

  /** Retourne une page des pistes appartenant exclusivement à l'utilisateur. */
  app.get("/api/tracks", auth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
      // Filtre optionnel par titre : uniquement une chaîne, 100 caractères maximum.
      const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

      console.log(`[tracks] Lecture page=${page}, limit=${limit}, q=${JSON.stringify(q)}, user=${req.auth.sub}`);

      const match = { ownerId: new mongoose.Types.ObjectId(req.auth.sub) };
      if (q) {
        // Les caractères spéciaux sont échappés : la saisie est cherchée telle quelle,
        // l'utilisateur ne peut pas injecter sa propre expression régulière.
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        match.title = { $regex: escaped, $options: "i" };
      }

      // Pipeline d'agrégation : les pistes de l'utilisateur, les plus récentes d'abord,
      // sans les noms de fichiers sur le disque. Contrairement à find(), aggregate()
      // ne convertit pas l'id automatiquement, d'où le new mongoose.Types.ObjectId().
      // hasCover est calculé comme dans toPublic() avant de masquer les champs de couverture.
      const aggregate = Track.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $addFields: { hasCover: { $cond: [{ $ifNull: ["$coverType", false] }, true, false] } } },
        { $project: { storedName: 0, coverName: 0, coverType: 0 } },
      ]);

      // Le plugin fait le $skip/$limit et le comptage total à notre place.
      // customLabels garde les noms du contrat (items, total, pages) au lieu de
      // docs, totalDocs et totalPages, et ajoute hasPrevPage, hasNextPage, etc.
      const result = await Track.aggregatePaginate(aggregate, {
        page,
        limit,
        customLabels: { docs: "items", totalDocs: "total", totalPages: "pages" },
      });

      // L'identifiant MongoDB (_id) est converti en chaîne (id) pour le frontend.
      const publicItems = result.items.map((track) => ({
        ...track,
        id: String(track._id),
        _id: undefined,
      }));

      console.log(`[tracks] ${publicItems.length} piste(s) envoyée(s) sur ${result.total}`);

      res.json({ ...result, items: publicItems });
    } catch (error) {
      console.error("[tracks] Erreur de pagination", error);
      next(error);
    }
  });

  /**
   * Reçoit le champ multipart audio et le champ texte title.
   * upload.single("audio") traite un seul fichier et le place dans req.file,
   * tandis que req.body.title contient le champ texte associé.
   * C'est ici qu'est fait l'upload de fichiers sur le serveur. 
   * Le middleware auth vérifie le JWT avant d'accepter l'upload.
   * Le middleware upload.single("audio") traite le fichier audio envoyé dans le champ "audio" du formulaire
   * ou de l'appel depuis le frontend avec un objet FormData.
   * Si le fichier est accepté, il est stocké sur le disque et ses métadonnées sont enregistrées 
   * dans MongoDB.
   */
  app.post(
    "/api/tracks",
    auth,
    upload.single("audio"),
    async (req, res, next) => {
      let cover = null;
      try {
        if (!req.file) {
          console.warn(`[tracks] Upload sans fichier par ${req.auth.sub}`);
          return res.status(400).json({ message: "Fichier audio requis" });
        }

        // Métadonnées : titre saisi > tag ID3 > nom du fichier ; artiste et album depuis les tags,
        // sinon depuis un nom de fichier du type « Artiste - Titre.mp3 ».
        const tags = await readTags(path.join(UPLOADS, req.file.filename));
        const fromName = parseFileName(req.file.originalname);
        // La pochette intégrée au fichier passe par les mêmes contrôles qu'une image envoyée.
        cover = tags.picture ? await saveCoverBuffer(tags.picture, UPLOADS) : null;

        const track = await Track.create({
          ownerId: req.auth.sub,
          title: cleanText(req.body.title) || tags.title || fromName.title || req.file.originalname,
          artist: tags.artist || fromName.artist,
          album: tags.album,
          originalName: req.file.originalname,
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          ...(cover && { ...cover, coverSource: "id3" }),
        });

        console.log(`[tracks] Upload enregistré : ${track.id} (tags : ${tags.title ? "oui" : "non"}, pochette : ${cover ? "oui" : "non"})`);
        res.status(201).json(track.toPublic());
      } catch (error) {
        console.error("[tracks] Erreur après l'enregistrement du fichier", error);
        if (cover) await removeUpload(cover.coverName);

        // Si MongoDB échoue après l'écriture sur disque, on tente de nettoyer
        // le fichier orphelin. L'erreur de nettoyage est elle aussi loguée.
        if (req.file) {
          const uploadedPath = path.join(UPLOADS, req.file.filename);
          try {
            await fsPromises.unlink(uploadedPath);
            console.log(`[tracks] Fichier temporaire supprimé : ${uploadedPath}`);
          } catch (cleanupError) {
            console.error(
              `[tracks] Impossible de supprimer le fichier temporaire ${uploadedPath}`,
              cleanupError,
            );
          }
        }
        next(error);
      }
    },
  );

  /** Envoie le contenu binaire d'une piste après vérification de sa propriété. */
  app.get("/api/tracks/:id/audio", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        console.warn(`[tracks] Audio introuvable ou interdit : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      res.type(track.mimeType);
      // Ce callback permet de loguer le succès ou l'erreur du transfert.
      res.sendFile(audioPath, (error) => {
        if (error) {
          console.error(`[tracks] Erreur d'envoi audio ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[tracks] Audio envoyé : ${track.id}`);
      });
    } catch (error) {
      console.error("[tracks] Erreur de préparation du flux audio", error);
      next(error);
    }
  });

  /**
   * Ajoute ou remplace l'image de couverture d'une piste.
   * Flux : JWT -> Multer (type et taille) -> vérification des octets -> propriétaire
   * -> enregistrement du nouveau nom -> suppression de l'ancienne image.
   * Si une étape échoue, l'image qui vient d'être écrite est supprimée.
   */
  app.put("/api/tracks/:id/cover", auth, coverUpload.single("cover"), async (req, res, next) => {
    try {
      if (!req.file) {
        console.warn(`[covers] Envoi sans image par ${req.auth.sub}`);
        return res.status(400).json({ message: "Image de couverture requise" });
      }

      if (!(await isRealImage(path.join(UPLOADS, req.file.filename), req.file.mimetype))) {
        console.warn(`[covers] Contenu qui ne correspond pas à ${req.file.mimetype}`);
        await removeUpload(req.file.filename);
        return res.status(400).json({ message: "Le fichier n'est pas une image valide" });
      }

      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+coverName");

      if (!track) {
        console.warn(`[covers] Piste introuvable ou interdite : ${req.params.id}`);
        await removeUpload(req.file.filename);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const previousCover = track.coverName;
      track.coverName = req.file.filename;
      track.coverType = req.file.mimetype;
      track.coverSource = "upload";
      await track.save();
      console.log(`[covers] Couverture enregistrée pour ${track.id}`);

      if (previousCover) await removeUpload(previousCover);
      res.json(track.toPublic());
    } catch (error) {
      console.error("[covers] Erreur d'enregistrement de la couverture", error);
      if (req.file) await removeUpload(req.file.filename);
      next(error);
    }
  });

  /**
   * Cherche une pochette sur le Web (MusicBrainz + Cover Art Archive) et l'enregistre.
   * Corps JSON facultatif { artist, title } pour corriger la recherche ; sinon les
   * métadonnées de la piste sont utilisées. L'artiste corrigé est gardé sur la piste.
   */
  app.post("/api/tracks/:id/cover/lookup", auth, async (req, res, next) => {
    let saved = null;
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+coverName");

      if (!track) {
        console.warn(`[covers] Recherche sur une piste introuvable ou interdite : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const artist = cleanText(req.body?.artist) || track.artist;
      const title = cleanText(req.body?.title) || track.title;
      if (!artist || !title) {
        return res.status(400).json({ message: "Artiste et titre requis pour chercher une pochette" });
      }

      let found;
      try {
        found = await lookupCover(artist, title);
      } catch (error) {
        // Service externe en panne ou trop lent : ce n'est pas une erreur du client.
        console.error("[covers] Service de pochettes indisponible", error);
        return res.status(502).json({ message: "Le service de pochettes ne répond pas, réessayez plus tard" });
      }
      if (!found) {
        return res.status(404).json({ message: `Aucune pochette trouvée pour « ${title} » de ${artist}` });
      }

      saved = await saveCoverBuffer(found.buffer, UPLOADS);
      if (!saved) return res.status(502).json({ message: "La pochette reçue n'est pas une image valide" });

      const previousCover = track.coverName;
      Object.assign(track, saved, { coverSource: "web", artist });
      await track.save();
      saved = null;
      if (previousCover) await removeUpload(previousCover);

      console.log(`[covers] Pochette Web enregistrée pour ${track.id}`);
      res.json(track.toPublic());
    } catch (error) {
      console.error("[covers] Erreur de recherche de pochette", error);
      if (saved) await removeUpload(saved.coverName);
      next(error);
    }
  });

  /** Envoie l'image de couverture, uniquement à son propriétaire. */
  app.get("/api/tracks/:id/cover", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+coverName");

      if (!track?.coverName) {
        console.warn(`[covers] Couverture introuvable ou interdite : ${req.params.id}`);
        return res.status(404).json({ message: "Couverture inconnue" });
      }

      res.type(track.coverType);
      // Empêche le navigateur de deviner un autre type que celui annoncé.
      res.set("X-Content-Type-Options", "nosniff");
      res.sendFile(path.join(UPLOADS, track.coverName), (error) => {
        if (error) {
          console.error(`[covers] Erreur d'envoi de la couverture ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[covers] Couverture envoyée : ${track.id}`);
      });
    } catch (error) {
      console.error("[covers] Erreur de lecture de la couverture", error);
      next(error);
    }
  });

  /** Supprime la métadonnée et les fichiers physiques correspondants (audio et couverture). */
  app.delete("/api/tracks/:id", auth, async (req, res, next) => {
    try {
      const track = await Track.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName +coverName");

      if (!track) {
        console.warn(`[tracks] Suppression impossible : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      // Une erreur de suppression de la couverture est journalisée par removeUpload().
      if (track.coverName) await removeUpload(track.coverName);

      const audioPath = path.join(UPLOADS, track.storedName);
      try {
        await fsPromises.unlink(audioPath);
        console.log(`[tracks] Fichier supprimé : ${audioPath}`);
      } catch (error) {
        // L'exception n'est volontairement pas ignorée : l'administrateur doit
        // voir ce fichier orphelin si sa suppression échoue.
        console.error(`[tracks] Fichier audio non supprimé : ${audioPath}`, error);
        return res.status(500).json({
          message: "Métadonnée supprimée, mais fichier audio non supprimé",
        });
      }

      res.status(204).end();
    } catch (error) {
      console.error("[tracks] Erreur de suppression", error);
      next(error);
    }
  });

  /** Gestionnaire central des erreurs connues de l'application. */
  app.use((error, _req, res, next) => {
    console.error("[error] Erreur reçue par le gestionnaire central", error);

    if (
      error instanceof multer.MulterError ||
      error?.message === "Format audio non accepté" ||
      error?.message === "Format d'image non accepté"
    ) {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "CastError") {
      return res.status(404).json({ message: "Ressource inconnue" });
    }

    next(error);
  });

  return app;
}
