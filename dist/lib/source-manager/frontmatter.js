// ============================================================================
// Frontmatter Builder
// ============================================================================
// Builds YAML frontmatter for imported sources
// ----------------------------------------------------------------------------
// Builder
// ----------------------------------------------------------------------------
/**
 * Build YAML frontmatter string
 */
export function buildFrontmatter(options) {
    const lines = ['---'];
    // Title
    lines.push(`title: "${escapeYaml(options.title)}"`);
    // Authors
    if (options.authors && options.authors.length > 0) {
        lines.push(`authors: [${options.authors.map(a => `"${escapeYaml(a)}"`).join(', ')}]`);
    }
    // Date
    if (options.date) {
        const year = typeof options.date === 'number'
            ? options.date
            : options.date.toString().substring(0, 4);
        lines.push(`date: ${year}`);
    }
    // Tags
    if (options.tags && options.tags.length > 0) {
        lines.push(`tags: [${options.tags.map(t => `"${escapeYaml(t)}"`).join(', ')}]`);
    }
    // Zotero key (only for Zotero sources)
    if (options.zoteroKey) {
        lines.push(`zoteroKey: ${options.zoteroKey}`);
    }
    // Source type
    lines.push(`sourceType: ${options.sourceType}`);
    // Imported timestamp
    lines.push(`importedAt: ${new Date(options.importedAt).toISOString()}`);
    // Original path (for Obsidian)
    if (options.originalPath) {
        lines.push(`originalPath: "${escapeYaml(options.originalPath)}"`);
    }
    // Note (if any)
    if (options.note) {
        lines.push(`note: "${escapeYaml(options.note)}"`);
    }
    lines.push('---', '');
    return lines.join('\n');
}
/**
 * Escape special YAML characters
 */
function escapeYaml(str) {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
}
/**
 * Extract tags from Zotero item
 */
export function extractTags(item) {
    return (item.data.tags || []).map(t => t.tag);
}
/**
 * Extract year from Zotero item date
 */
export function extractYear(dateStr) {
    if (!dateStr)
        return null;
    const match = dateStr.match(/\d{4}/);
    return match ? parseInt(match[0], 10) : null;
}
/**
 * Extract authors from Zotero item creators
 */
export function extractAuthors(item) {
    if (!item.data.creators)
        return [];
    return item.data.creators
        .filter(c => c.creatorType === 'author')
        .map(c => {
        if (c.name)
            return c.name;
        if (c.lastName && c.firstName)
            return `${c.lastName}, ${c.firstName}`;
        if (c.lastName)
            return c.lastName;
        return c.firstName || '';
    })
        .filter(Boolean);
}
//# sourceMappingURL=frontmatter.js.map