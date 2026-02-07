/**
 * Converts a JSONPath pattern (e.g., `$.store..book[*].title`)
 * into a Regex that matches dot-notation paths (e.g., `store.book.0.title`).
 */
export function jsonPathToRegex(jsonPath: string): RegExp {
    let pattern = jsonPath.trim();

    // 1. Strip Anchor ($)
    if (pattern.startsWith('$')) pattern = pattern.slice(1);

    const DOT_LITERAL = '\u0001';
    const RECURSIVE_TOKEN = '\u0002';

    // 2. Handle Recursive Descent '..' EARLY
    pattern = pattern.replace(/\.\./g, RECURSIVE_TOKEN);

    // 3. Strip Leading Dot (Standard Child)
    if (pattern.startsWith('.')) {
        pattern = pattern.slice(1);
    }

    // 4. Handle Quoted Keys: ['key.name'] or ["key's_name"]
    // FIX A: Use (?:[^'"]|\\.)+ to allow escaped quotes inside the key
    pattern = pattern.replace(/\[(['"])((?:(?!\1)[^]|\\.)+)\1\]/g, (match, quote, keyContent) => {
        // FIX B: Unescape quotes in the key (e.g. 'foo\'bar' -> 'foo'bar')
        // because the path string contains the raw key, not the escaped version.
        let rawKey = keyContent.replace(new RegExp('\\\\' + quote, 'g'), quote);

        let safeKey = rawKey.replace(/\./g, DOT_LITERAL);
        safeKey = safeKey.replace(/[\\\[\](){}?+*^$|]/g, '\\$&');

        // This adds a separator. If this is at the start, we handle it in Step 10.
        return '\x00' + safeKey;
    });

    // 5. Handle Numeric Indices: [0] -> \x000
    pattern = pattern.replace(/\[(\d+)\]/g, '\x00$1');

    // 6. Handle Array Wildcard '[*]' -> \x00 digits
    pattern = pattern.replace(/\[\*\]/g, '\x00\\d+');

    // 7. Handle Property Wildcard '*' -> \x00 non-nulls
    pattern = pattern.replace(/\*/g, '[^\x00]+');

    // 8. Handle Standard Dot -> Null Separator
    pattern = pattern.replace(/\./g, '\x00');

    // 9. EXPAND RECURSIVE TOKEN
    // FIX C: Collapse double separators.
    // If '..' is followed by a bracket (\x00), we don't want (?:.*\x00)?\x00
    // We just want (?:.*\x00)? (because the group consumes the trailing separator)
    pattern = pattern.replace(new RegExp(RECURSIVE_TOKEN + '\\x00', 'g'), RECURSIVE_TOKEN);

    // Expand the token
    pattern = pattern.replace(new RegExp(RECURSIVE_TOKEN, 'g'), '(?:.*\x00)?');

    // 10. Restore Literal Dots
    pattern = pattern.replace(new RegExp(DOT_LITERAL, 'g'), '\\.');

    // 11. Final Wrap (The Double Null Fix)
    // If the pattern ALREADY starts with \x00 (because of ['store'] or [0]),
    // do NOT prepend another one.
    if (pattern.startsWith('\x00')) {
        return new RegExp('^' + pattern + '$');
    }

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