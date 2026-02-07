/**
 * Converts a JSONPath pattern (e.g., `$.store..book[*].title`)
 * into a Regex that matches dot-notation paths (e.g., `store.book.0.title`).
 */
export function jsonPathToRegex(jsonPath: string): RegExp {
    let pattern = jsonPath.trim();

    // 1. Strip Anchor & Leading Dot
    if (pattern.startsWith('$')) pattern = pattern.slice(1);
    if (pattern.startsWith('.')) pattern = pattern.slice(1);

    // Placeholder for literal dots inside keys so they don't get eaten later
    const DOT_PLACEHOLDER = '\u0001';

    // 2. Handle Quoted Keys: ['key.name']
    pattern = pattern.replace(/\[['"]([^'"]+)['"]\]/g, (match, keyContent) => {
        // A. Hide literal dots
        let safeKey = keyContent.replace(/\./g, DOT_PLACEHOLDER);

        // B. Escape Regex special chars (brackets, parens, etc.)
        // This fixes the "nested[weird]" bug by turning it into "nested\[weird\]"
        safeKey = safeKey.replace(/[\\\[\](){}?+*^$|]/g, '\\$&');

        return '\x00' + safeKey;
    });

    // 3. Handle Recursive Descent '..'
    pattern = pattern.replace(/\.\./g, '(?:.*\x00)?');

    // 4. Handle Array Wildcard '[*]'
    pattern = pattern.replace(/\[\*\]/g, '\x00\\d+');

    // 5. Handle Property Wildcard '*'
    pattern = pattern.replace(/\*/g, '[^\x00]+');

    // 6. Handle Standard Dot -> Null Separator
    // Now safe to do because our literal dots are hidden as \u0001
    pattern = pattern.replace(/\./g, '\x00');

    // 7. Restore Literal Dots
    // Swap the placeholder back to "\." (literal dot in regex)
    // We use split/join or replace with global regex
    pattern = pattern.replace(new RegExp(DOT_PLACEHOLDER, 'g'), '\\.');

    // Final Regex
    return new RegExp('^\x00' + pattern + '$');
}

/**
 * The pure function for your unit tests
 */
export function matchesPath(jsonPath: string, currentPath: string[]): boolean {
    const pathString = '\x00' + currentPath.join('\x00');
    const regex = jsonPathToRegex(jsonPath);
    return regex.test(pathString);
}