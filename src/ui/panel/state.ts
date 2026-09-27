import { signal } from '@preact/signals';

/** Signed-in admin username, or null when signed out. */
export const session = signal<string | null>(null);
