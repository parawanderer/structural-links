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
    ];

    testCases.forEach(([expression, path, expected]) => {
        test(`Expr: ${expression} | Path: ${path.join(' -> ')} = ${expected}`, () => {
            const result = matchesPath(expression, path);
            assert.strictEqual(result, expected, `Failed: ${expression} against ${path}`);
        });
    });
});