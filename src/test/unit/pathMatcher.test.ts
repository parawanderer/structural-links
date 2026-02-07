import * as assert from 'assert';

import { matchesPath } from '../../pathMatcher';

suite('Path Matcher Test Suite', () => {

    const testCases: [string, string[], boolean][] = [
        // [jsonPath, currentPath, expectedResult]
        ['$.store.book', ['store', 'book'], true],
        ['$.store.book', ['store', 'magazine'], false],
        ['$..author', ['store', 'book', '0', 'author'], true],
        ['$..author', ['author'], true], // Matches root author
        ['$.myConfig["path.with.dots"]', ['myConfig', 'path.with.dots'], true],
        ['$.items[*].id', ['items', '5', 'id'], true],

        // 1. Recursive descent array index ($..book[0])
        // Means: Any 'book' array anywhere, give me the 0th item
        ['$..book[0]', ['store', 'book', '0'], true],
        ['$..book[0]', ['library', 'archive', 'book', '0'], true],
        ['$..book[0]', ['store', 'book', '1'], false], // Wrong index

        // 2. Recursive descent inside a specific key ($.store..price)
        // Means: Anything inside 'store' that ends in 'price'
        ['$.store..price', ['store', 'book', '0', 'price'], true],
        ['$.store..price', ['store', 'bicycle', 'price'], true],
        ['$.store..price', ['other', 'price'], false], // Not inside store

        // 3. Short Recursive (just to be safe)
        ['$..price', ['price'], true],
        ['$..price', ['store', 'price'], true],

        // 4. Wildcard Children ($.store.*)
        // Means: Any direct child of store
        ['$.store.*', ['store', 'bicycle'], true],
        ['$.store.*', ['store', 'book'], true],
        // Note: This usually matches the *object* at store.book, not the children of that object
        // But for a path matcher, "store.book.0" is NOT matched by "store.*" (that would be store.*.*)
        ['$.store.*', ['store', 'book', '0'], false],

        // 5. Recursive Wildcard ($..*)
        // Means: absolutely everything
        ['$..*', ['store', 'book'], true],
        ['$..*', ['a', 'b', 'c', 'd'], true],

        // --- SPECIAL CHARACTERS & ENCODING STRESS TESTS ---

        // 1. Spaces in Keys (The "Helm Chart Label" Special)
        // Matches: my-app['kubernetes.io/created-by']
        ['$.my-app["kubernetes.io/created-by"]', ['my-app', 'kubernetes.io/created-by'], true],
        ['$.my-app["Key With Spaces"]', ['my-app', 'Key With Spaces'], true],

        // 2. Unicode / International Characters
        // "Hât" (French), "数据" (Chinese), "Данные" (Russian)
        ['$.config["café"].price', ['config', 'café', 'price'], true],
        ['$.users["José"].id', ['users', 'José', 'id'], true],
        ['$.data["数据"].value', ['data', '数据', 'value'], true],
        ['$..["Данные"]', ['system', 'core', 'Данные'], true], // Recursive + Cyrillic

        // 3. The "Quote In A Quote" Nightmare
        // Keys like: `item's_name` or `"quoted"_key`
        // JSONPath: $['item\'s_name'] (escaped single quote)
        ['$["item\'s_name"]', ["item's_name"], true],
        ['$["key_with_\"quotes\"_inside"]', ['key_with_"quotes"_inside'], true],

        // 4. Brackets inside keys (The "It looks like an array but isn't" trap)
        // Key name is literally "user[0]" (not an array index)
        ['$.group["user[0]"].name', ['group', 'user[0]', 'name'], true],
        // Ensure it DOESN'T match the actual array index 0
        ['$.group["user[0]"].name', ['group', 'user', '0', 'name'], false],

        // 5. Special Regex Characters in Keys (The "Plus/Star" trap)
        // Keys with +, ?, *, $ inside them (e.g., "C++", "Question?")
        ['$.langs["C++"].version', ['langs', 'C++', 'version'], true],
        ['$.questions["What?"].answer', ['questions', 'What?', 'answer'], true],

        // 6. Deeply Nested Arrays with Wildcards
        ['$.store.book[*].author[*]', ['store', 'book', '5', 'author', '1'], true],

        // 7. Emojis (Because someone, somewhere, is using them as keys)
        ['$.["🚀"].status', ['🚀', 'status'], true]
    ];

    testCases.forEach(([expression, path, expected]) => {
        test(`Expr: ${expression} | Path: ${path.join(' -> ')} = ${expected}`, () => {
            const result = matchesPath(expression, path);
            assert.strictEqual(result, expected, `Failed: ${expression} against ${path}`);
        });
    });
});