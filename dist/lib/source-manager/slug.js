// ============================================================================
// Slug Generator
// ============================================================================
// Generates URL-safe slugs from source titles for filenames
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
export function slugify(title, maxLength = 50) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars, keep spaces/hyphens
        .replace(/\s+/g, '-') // Spaces to hyphens
        .replace(/-+/g, '-') // Collapse multiple hyphens
        .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens
        .substring(0, maxLength);
}
/**
 * Ensure slug is unique by appending counter if needed
 *
 * @param baseSlug - The base slug
 * @param existingSlugs - Set of existing slugs to check
 * @returns Unique slug
 */
export function ensureUniqueSlug(baseSlug, existingSlugs) {
    if (!existingSlugs.has(baseSlug))
        return baseSlug;
    let counter = 2;
    while (existingSlugs.has(`${baseSlug}-${counter}`)) {
        counter++;
    }
    return `${baseSlug}-${counter}`;
}
//# sourceMappingURL=slug.js.map