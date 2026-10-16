/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  hasCover: boolean;
  /** Where the cover comes from: manual upload, ID3 tags of the file, or Cover Art Archive. */
  coverSource?: 'upload' | 'id3' | 'web';
  /** Optional metadata read from the ID3 tags or the file name. */
  artist?: string;
  album?: string;
  /** Length in seconds, computed by ffmpeg at upload. */
  duration?: number;
  createdAt: string;
}

/** GET /api/tracks/:id also returns the precomputed waveform (empty if unavailable). */
export interface TrackDetail extends Track {
  /** One value per slice of the track, from 0 (silence) to 1 (full scale). */
  peaks: number[];
}
