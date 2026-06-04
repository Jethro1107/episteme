// ============================================================================
// Source Manager Types
// ============================================================================
// ----------------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------------
export function formatAuthors(creators) {
    if (!creators || creators.length === 0)
        return '';
    const authorNames = creators
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
    if (authorNames.length === 0)
        return '';
    if (authorNames.length === 1)
        return authorNames[0];
    if (authorNames.length === 2)
        return `${authorNames[0]} & ${authorNames[1]}`;
    return `${authorNames[0]} et al.`;
}
export function extractYear(dateStr) {
    if (!dateStr)
        return null;
    // Try to extract year from various date formats
    const match = dateStr.match(/\d{4}/);
    return match ? parseInt(match[0], 10) : null;
}
//# sourceMappingURL=types.js.map