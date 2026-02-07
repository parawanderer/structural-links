import * as assert from 'assert';
import { createLink } from '../../linkBuilder';
import { LinkRule } from '../../types';

suite('Link Creation & Transformation Tests', () => {

    test('Standard Positional Mapping ($1, $2)', () => {
        const rule: LinkRule = {
            filePattern: "**/*",
            linkPattern: {
                capture: "ticket-(.*)-(.*)",
                target: "https://jira.com/$1/browse/$2",
                text: "Jira: $2 in $1"
            }
        };

        const result = createLink("ticket-PROJ-123", rule);

        assert.ok(result);
        assert.strictEqual(result?.target, "https://jira.com/PROJ/browse/123");
        assert.strictEqual(result?.tooltip, "Jira: 123 in PROJ");
    });

    test('Named Groups Mapping ($project, $id)', () => {
        const rule: LinkRule = {
            filePattern: "**/*",
            linkPattern: {
                capture: "ticket-(?<project>.*)-(?<id>.*)",
                target: "https://jira.com/$project/browse/$id",
                text: "Project: $project"
            }
        };

        const result = createLink("ticket-CORE-99", rule);

        assert.ok(result);
        assert.strictEqual(result?.target, "https://jira.com/CORE/browse/99");
        assert.strictEqual(result?.tooltip, "Project: CORE");
    });

    test('Transformations on Positional Groups (The Namespace Dot Hack)', () => {
        const rule: LinkRule = {
            filePattern: "**/*",
            linkPattern: {
                capture: "prefix\\.(.*)__(.*)",
                target: "https://portal.com/$1?v=$2",
                transforms: [
                    { applyTo: "$1", search: "__", replace: "." }
                ]
            }
        };

        // Input has double underscores in the namespace part
        const result = createLink("prefix.namespace__subdomain__asset__v2", rule);

        assert.ok(result);
        // $1 should have dots, $2 should remain untouched
        assert.strictEqual(result?.target, "https://portal.com/namespace.subdomain.asset?v=v2");
    });

    test('Transformations on Named Groups', () => {
        const rule: LinkRule = {
            filePattern: "**/*",
            linkPattern: {
                capture: "data-(?<path>.*)",
                target: "https://explorer.com/$path",
                transforms: [
                    { applyTo: "$path", search: "/", replace: ":" }
                ]
            }
        };

        const result = createLink("data-folder/subfolder/file", rule);

        assert.ok(result);
        assert.strictEqual(result?.target, "https://explorer.com/folder:subfolder:file");
    });

    test('Multiple Chained Transforms', () => {
        const rule: LinkRule = {
            filePattern: "**/*",
            linkPattern: {
                capture: "(.*)",
                target: "https://api.com/$1",
                transforms: [
                    { applyTo: "$1", search: " ", replace: "_" },
                    { applyTo: "$1", search: "!", replace: "" }
                ]
            }
        };

        const result = createLink("Hello World!", rule);

        assert.ok(result);
        assert.strictEqual(result?.target, "https://api.com/Hello_World");
    });

    test('Fallback to $0 (Entire Match)', () => {
        const rule: LinkRule = {
            filePattern: "**/*",
            linkPattern: {
                target: "https://search.com?q=$0"
            }
        };

        const result = createLink("query_term", rule);
        assert.strictEqual(result?.target, "https://search.com?q=query_term");
    });
});