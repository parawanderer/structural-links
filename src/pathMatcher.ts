/**
 * Converts a JSONPath pattern (e.g., `$.store..book[*].title`)
 * into a Regex that matches dot-notation paths (e.g., `store.book.0.title`).
 */
export function jsonPathToRegex(jsonPath: string): RegExp {
    let pattern = jsonPath.trim();

    // 1. Strip Anchor ($)
    if (pattern.startsWith('$')) pattern = pattern.slice(1);

    // Placeholder constants
    // \u0001 = Literal Dot (inside quotes)
    // \u0002 = Recursive Separator (..)
    const DOT_LITERAL = '\u0001';
    const RECURSIVE_TOKEN = '\u0002';

    // 2. Handle Recursive Descent '..' EARLY
    // We replace it with a token so it doesn't get confused with single dots
    pattern = pattern.replace(/\.\./g, RECURSIVE_TOKEN);

    // 3. Strip Leading Dot (Standard Child)
    // Now safe to do blindly because '..' is already gone (turned into \u0002)
    if (pattern.startsWith('.')) {
        pattern = pattern.slice(1);
    }

    // 4. Handle Quoted Keys: ['key.name']
    pattern = pattern.replace(/\[['"]([^'"]+)['"]\]/g, (match, keyContent) => {
        let safeKey = keyContent.replace(/\./g, DOT_LITERAL);
        safeKey = safeKey.replace(/[\\\[\](){}?+*^$|]/g, '\\$&');
        return '\x00' + safeKey;
    });

    // 5. Handle Numeric Indices: [0] -> \x000
    pattern = pattern.replace(/\[(\d+)\]/g, '\x00$1');

    // 6. Handle Array Wildcard '[*]' -> \x00 digits
    pattern = pattern.replace(/\[\*\]/g, '\x00\\d+');

    // 7. Handle Property Wildcard '*' -> \x00 non-nulls
    pattern = pattern.replace(/\*/g, '[^\x00]+');

    // 8. Handle Standard Dot -> Null Separator
    // This removes all structural dots.
    pattern = pattern.replace(/\./g, '\x00');

    // 9. EXPAND RECURSIVE TOKEN
    // Now that all other dots are gone, we can safely insert the regex dot
    // \u0002 -> (?:.*\x00)?  (Match anything followed by a separator, optionally)
    pattern = pattern.replace(new RegExp(RECURSIVE_TOKEN, 'g'), '(?:.*\x00)?');

    // 10. Restore Literal Dots
    pattern = pattern.replace(new RegExp(DOT_LITERAL, 'g'), '\\.');

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