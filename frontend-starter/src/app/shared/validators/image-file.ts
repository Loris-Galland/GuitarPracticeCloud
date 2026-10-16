/** Same rules as the backend (backend/src/app.js: `allowedCovers` and MAX_COVER_SIZE). */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

/** Returns an error message for an invalid cover image, or null when it can be sent. */
export function validateImageFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return `Format d'image non accepté (${file.type || 'inconnu'}) : choisissez un JPEG, PNG ou WebP.`;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    return `Image trop volumineuse (${sizeMb} Mo) : la limite est de 2 Mo.`;
  }
  return null;
}
