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
  createdAt: string;
}
