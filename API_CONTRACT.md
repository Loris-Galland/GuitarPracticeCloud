# Contrat HTTP - TP1

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title` | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT | `204` (bonus, supprime aussi la couverture) |
| PUT | `/tracks/:id/cover` | multipart : `cover` + JWT | `200 Track` (avancé) |
| GET | `/tracks/:id/cover` | JWT | image (avancé) |
| POST | `/tracks/:id/cover/lookup` | `{artist?,title?}` + JWT | `200 Track` (avancé, recherche Web) |

`GET /tracks` : paramètres de requête `page` (entier ≥ 1, défaut 1), `limit` (entier entre 1 et 20, défaut 5) et `q` (optionnel, texte de 100 caractères maximum : ne garde que les pistes dont le titre contient ce texte, sans tenir compte des majuscules ; `total` et `pages` sont calculés sur les pistes filtrées), JWT obligatoire, seules les pistes de l'utilisateur connecté sont renvoyées, triées de la plus récente à la plus ancienne. Erreurs : `401` sans JWT valide.

`Page<Track>` (pagination faite avec le plugin `mongoose-aggregate-paginate-v2`) contient :

```json
{
  "items": [Track],
  "total": 6,
  "limit": 5,
  "page": 2,
  "pages": 2,
  "pagingCounter": 6,
  "hasPrevPage": true,
  "hasNextPage": false,
  "prevPage": 1,
  "nextPage": null
}
```

`pages` vaut au moins 1 même sans piste, `pagingCounter` est le numéro de la première piste de la page, et `prevPage` / `nextPage` valent `null` aux bornes. Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

Chaque `Track` contient aussi `hasCover` (booléen) : `true` si la piste a une image de couverture. Le nom du fichier sur le disque n'est jamais renvoyé. Champs facultatifs : `artist` et `album` (texte, 200 caractères maximum), et `coverSource` qui vaut `"upload"` (image envoyée à la main), `"id3"` (pochette intégrée au fichier audio) ou `"web"` (trouvée sur Cover Art Archive, le front affiche alors le crédit).

`POST /tracks` lit aussi les tags du fichier audio (ID3v1, ID3v2.2 à 2.4) : le titre vient du champ `title` s'il est rempli, sinon du tag, sinon du nom du fichier ; `artist` et `album` viennent des tags, ou d'un nom de fichier de la forme `Artiste - Titre.mp3`. Si le fichier contient une pochette, elle est enregistrée comme couverture (`coverSource: "id3"`) avec les mêmes règles qu'un `PUT /tracks/:id/cover` (JPEG, PNG ou WebP vérifié par signature, 2 Mo maximum) ; une pochette refusée est simplement ignorée. Des tags illisibles ne font jamais échouer l'upload. Le contrat de la requête et des erreurs ne change pas.

`PUT /tracks/:id/cover` (image de couverture) : JWT obligatoire, corps `multipart/form-data` avec un seul champ fichier `cover`. Formats acceptés : JPEG, PNG et WebP (pas de SVG), 2 Mo maximum, et le contenu du fichier doit vraiment correspondre au format annoncé. Si la piste a déjà une couverture, elle est remplacée et l'ancien fichier est supprimé. Réponses : `200 Track` avec `hasCover: true` ; `400` si l'image manque, a un format refusé, est trop grosse ou n'est pas une vraie image ; `401` sans JWT valide ; `404` si la piste n'existe pas ou appartient à un autre utilisateur.

`POST /tracks/:id/cover/lookup` (recherche de pochette sur le Web) : JWT obligatoire, corps JSON facultatif `{ "artist": "…", "title": "…" }` pour corriger la recherche (sinon l'artiste et le titre de la piste sont utilisés). Le serveur cherche le morceau sur MusicBrainz (`musicbrainz.org/ws/2/recording`, avec un User-Agent et au plus une requête par seconde comme le demande le service), garde les résultats avec un score d'au moins 80, puis télécharge la pochette de face en 250 px sur Cover Art Archive (`coverartarchive.org/release/:mbid/front-250`). L'image est vérifiée comme un upload, remplace l'ancienne couverture, et l'artiste utilisé est gardé sur la piste. Réponses : `200 Track` avec `hasCover: true` et `coverSource: "web"` ; `400` si l'artiste ou le titre manque ; `401` sans JWT valide ; `404` si la piste n'existe pas, appartient à un autre utilisateur, ou si aucune pochette n'est trouvée ; `502` si le service externe ne répond pas ou renvoie autre chose qu'une image.

`GET /tracks/:id/cover` : JWT obligatoire. Réponses : `200` avec l'image et son `Content-Type` (plus `X-Content-Type-Options: nosniff`) ; `401` sans JWT valide ; `404` si la piste n'a pas de couverture, n'existe pas ou appartient à un autre utilisateur.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé, `502` service externe indisponible.
