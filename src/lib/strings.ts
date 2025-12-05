export function createSlug(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFD') // Decompose diacritics
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-z0-9\-]/g, '-') // Replace non-alphanumeric with hyphen
        .replace(/--+/g, '-') // Replace multiple hyphens with single hyphen
        .replace(/^-+|-+$/g, ''); // Trim hyphens from start and end
}
