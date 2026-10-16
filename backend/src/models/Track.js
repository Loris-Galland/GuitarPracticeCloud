import mongoose from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";

/*
 * Ce schéma conserve les métadonnées d'une piste. Le fichier audio lui-même
 * reste sur le disque ; storedName contient le nom technique utilisé côté
 * serveur et n'est jamais exposé par toPublic().
 */
const schema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true, select: false },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    // Image de couverture facultative : même principe que storedName, le nom
    // sur le disque n'est jamais exposé. coverType sert aussi à savoir s'il y en a une.
    coverName: { type: String, select: false },
    coverType: { type: String },
    // D'où vient la couverture : envoyée à la main, lue dans les tags ID3, ou trouvée
    // sur Cover Art Archive (le front affiche alors le crédit de l'image).
    coverSource: { type: String, enum: ["upload", "id3", "web"] },
    // Métadonnées facultatives lues dans les tags ID3 ou déduites du nom du fichier.
    artist: { type: String, trim: true, maxlength: 200 },
    album: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true },
);

// Cet index accélère la liste des pistes d'un utilisateur triées par date.
schema.index({ ownerId: 1, createdAt: -1 });

// Le plugin ajoute Track.aggregatePaginate(), utilisé par GET /api/tracks.
schema.plugin(aggregatePaginate);

/**
 * Convertit un document Mongoose en objet sûr pour le frontend.
 * L'identifiant MongoDB devient la propriété simple `id` attendue par Angular.
 */
schema.methods.toPublic = function () {
  console.debug(`[track-model] Préparation de la piste publique ${this.id}`);
  return {
    id: this.id,
    ownerId: String(this.ownerId),
    title: this.title,
    artist: this.artist,
    album: this.album,
    originalName: this.originalName,
    mimeType: this.mimeType,
    size: this.size,
    hasCover: Boolean(this.coverType),
    coverSource: this.coverSource,
    createdAt: this.createdAt,
  };
};

export const Track = mongoose.model("Track", schema);
