import clsx, { type ClassValue } from 'clsx';

export function cn(...clases: ClassValue[]): string {
  return clsx(clases);
}
