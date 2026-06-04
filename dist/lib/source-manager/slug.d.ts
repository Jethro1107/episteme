/**
 * Generate a URL-safe slug from a title
 *
 * "Attention Is All You Need" → "attention-is-all-you-need"
 * "What's in a name?" → "whats-in-a-name"
 * "  Multiple   Spaces  " → "multiple-spaces"
 *
 * @param title - The source title
 * @param maxLength - Maximum slug length (default: 50)
 * @returns URL-safe slug
 */
export declare function slugify(title: string, maxLength?: number): string;
/**
 * Ensure slug is unique by appending counter if needed
 *
 * @param baseSlug - The base slug
 * @param existingSlugs - Set of existing slugs to check
 * @returns Unique slug
 */
export declare function ensureUniqueSlug(baseSlug: string, existingSlugs: Set<string>): string;
//# sourceMappingURL=slug.d.ts.map