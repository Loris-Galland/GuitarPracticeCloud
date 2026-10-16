import { Pipe, PipeTransform } from '@angular/core';

const LABELS: Record<string, string> = {
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'audio/x-wav': 'WAV',
  'audio/ogg': 'OGG',
  'audio/mp4': 'M4A',
  'audio/x-m4a': 'M4A',
};

/** Turns a MIME type such as audio/mpeg into a short label such as MP3. */
@Pipe({ name: 'audioFormat' })
export class AudioFormatPipe implements PipeTransform {
  transform(mimeType: string): string {
    return LABELS[mimeType] ?? mimeType;
  }
}
