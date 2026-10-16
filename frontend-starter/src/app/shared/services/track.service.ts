import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  /** q is optional: the backend filters by title before paginating. */
  list(page = 1, limit = 5, q = '') {
    return this.http.get<Page<Track>>('/api/tracks', {
      params: q ? { page, limit, q } : { page, limit },
    });
  }

  upload(file: File, title: string) {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    // observe: 'events' + reportProgress emits UploadProgress events, then the final Response.
    return this.http.post<Track>('/api/tracks', body, {
      observe: 'events',
      reportProgress: true,
    });
  }

  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }

  /** Adds or replaces the cover image (multipart field `cover`). */
  uploadCover(id: string, file: File) {
    const body = new FormData();
    body.append('cover', file);
    return this.http.put<Track>(`/api/tracks/${id}/cover`, body);
  }

  /** The cover is protected by the JWT, so it is fetched as a Blob like the audio. */
  cover(id: string) {
    return this.http.get(`/api/tracks/${id}/cover`, {
      responseType: 'blob',
    });
  }

  /** Asks the backend to find a cover on MusicBrainz + Cover Art Archive. */
  lookupCover(id: string, artist: string, title: string) {
    return this.http.post<Track>(`/api/tracks/${id}/cover/lookup`, { artist, title });
  }

  /** DELETE /api/tracks/:id answers 204 with no body. */
  remove(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }
}
