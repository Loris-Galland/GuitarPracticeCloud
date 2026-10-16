import { Pipe, PipeTransform } from '@angular/core';

/** Formats a size in bytes (as returned by the API) into Ko or Mo. */
@Pipe({ name: 'fileSize' })
export class FileSizePipe implements PipeTransform {
  transform(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  }
}
