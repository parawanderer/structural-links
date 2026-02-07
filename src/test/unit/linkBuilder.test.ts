import * as assert from 'assert';
import { createLink, injectSystemVariables } from '../../linkBuilder';
import { LinkRule } from '../../types';

suite('Link Creation & Transformation Tests', () => {

    suite('Basic Tests', () => {
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

    suite('Advanced Transformation & Command Tests', () => {

        test('URL Encoding Command', () => {
            const rule: LinkRule = {
                linkPattern: {
                    capture: "search-(.*)",
                    target: "https://google.com/search?q=$1",
                    transforms: [
                        { applyTo: "$1", command: "urlEncode" }
                    ]
                }
            };

            // Spaces and ampersands must be encoded
            const result = createLink("search-Research & Development", rule);

            assert.ok(result);
            assert.strictEqual(result?.target, "https://google.com/search?q=Research%20%26%20Development");
        });

        test('Case Transformation Commands', () => {
            const rule: LinkRule = {
                linkPattern: {
                    capture: "user-(.*)",
                    target: "https://github.com/$1",
                    transforms: [
                        { applyTo: "$1", command: "toLowerCase" }
                    ]
                }
            };

            const result = createLink("user-JohnDoe", rule);

            assert.ok(result);
            assert.strictEqual(result?.target, "https://github.com/johndoe");
        });

        test('Trimming Whitespace', () => {
            const rule: LinkRule = {
                linkPattern: {
                    capture: "ID:(.*)",
                    target: "https://db.com/item/$1",
                    transforms: [
                        { applyTo: "$1", command: "trim" }
                    ]
                }
            };

            // Capture group will include leading/trailing spaces from the regex match
            const result = createLink("ID:  12345  ", rule);

            assert.ok(result);
            assert.strictEqual(result?.target, "https://db.com/item/12345");
        });

        test('Global "all" Regex Transform', () => {
            const rule: LinkRule = {
                linkPattern: {
                    target: "https://internal.site/path_with_spaces",
                    transforms: [
                        // No applyTo specified, or set to 'all'
                        { search: " ", replace: "_" }
                    ]
                }
            };

            const result = createLink("ignored_input", rule);

            assert.ok(result);
            assert.strictEqual(result?.target, "https://internal.site/path_with_spaces");
        });

        test('Mixed Commands and Regex on Named Groups', () => {
            const rule: LinkRule = {
                linkPattern: {
                    capture: "env-(?<name>.*)",
                    target: "https://console.aws.com/$name",
                    transforms: [
                        { applyTo: "$name", search: "_", replace: "-" },
                        { applyTo: "$name", command: "toUpperCase" }
                    ]
                }
            };

            const result = createLink("env-prod_east_1", rule);

            assert.ok(result);
            assert.strictEqual(result?.target, "https://console.aws.com/PROD-EAST-1");
        });

        test('Safe URL Decode', () => {
            const rule: LinkRule = {
                linkPattern: {
                    capture: "path-(.*)",
                    target: "https://files.com/view/$1",
                    transforms: [
                        { applyTo: "$1", command: "urlDecode" }
                    ]
                }
            };

            const result = createLink("path-some%20file%21", rule);

            assert.ok(result);
            assert.strictEqual(result?.target, "https://files.com/view/some file!");
        });
    });

    test('Complex Pipeline: Named Groups + Regex + Commands + System Variables', () => {
        // 1. Define a complex rule for a "Data Asset" link
        const rule: LinkRule = {
            linkPattern: {
                // Captures something like: prefix__My_Namespace__Asset_Name
                capture: "prefix__(?<namespace>.*?)__(?<name>.*)",
                target: "file://${workspaceFolder}/assets/$namespace/$name",
                text: "Asset: $name ($namespace)",
                transforms: [
                    // Clean up the namespace: My_Namespace -> my.namespace
                    { applyTo: "$namespace", search: "_", replace: "." },
                    { applyTo: "$namespace", command: "toLowerCase" },
                    // Clean up the name: Asset_Name -> asset-name
                    { applyTo: "$name", search: "_", replace: "-" },
                    { applyTo: "$name", command: "toLowerCase" }
                ]
            }
        };

        // 2. Setup fake system variables (Windows style to test normalization)
        const systemVars = {
            'workspaceFolder': 'C:\\Users\\Gemini\\Project'
        };

        // 3. Step 1: Create the base link (handles groups and transforms)
        const result = createLink("prefix__My_Namespace__Asset_Name", rule);
        assert.ok(result);

        // 4. Step 2: Inject system variables (handles workspace and slash-flip)
        result!.target = injectSystemVariables(result!.target, systemVars);
        result!.tooltip = injectSystemVariables(result!.tooltip, systemVars);

        // EXPECTATIONS:
        // Target:
        //   - Namespace: My_Namespace -> my.namespace
        //   - Name: Asset_Name -> asset-name
        //   - Workspace: C:\Users... -> C:/Users...
        //   - Final: C:/Users/Gemini/Project/assets/my.namespace/asset-name
        assert.strictEqual(result?.target, "file:///C:/Users/Gemini/Project/assets/my.namespace/asset-name");

        // Tooltip:
        //   - Should have applied the same group transforms
        assert.strictEqual(result?.tooltip, "Asset: asset-name (my.namespace)");
    });
});

suite('System Variable Injection Tests', () => {

    test('Windows Path Normalization for file://', () => {
        const input = "file://${fileDirname}/script.py";
        const fakeVars = {
            'fileDirname': 'C:\\Users\\Dev\\project\\src'
        };

        const result = injectSystemVariables(input, fakeVars);

        // 1. Backslashes should become forward slashes
        // 2. file:// should become file:///
        assert.strictEqual(result, "file:///C:/Users/Dev/project/src/script.py");
    });

    test('Windows Path Normalization for https://', () => {
        const input = "https://github.com/view/${file}";
        const fakeVars = {
            'file': 'C:\\Users\\Dev\\project\\README.md'
        };

        const result = injectSystemVariables(input, fakeVars);

        // Should flip slashes but NOT add extra file:/// slashes
        assert.strictEqual(result, "https://github.com/view/C:/Users/Dev/project/README.md");
    });

    test('Non-URI strings should retain backslashes (PathSeparator test)', () => {
        // If it's not a URI, we shouldn't touch the slashes
        // because the user might be building a CLI command for Windows
        const input = "Path is: ${fileDirname}${pathSeparator}config";
        const fakeVars = {
            'fileDirname': 'C:\\project',
            'pathSeparator': '\\'
        };

        const result = injectSystemVariables(input, fakeVars);
        assert.strictEqual(result, "Path is: C:\\project\\config");
    });

    test('Relative Directory Expansion', () => {
        const input = "https://internal.docs/${relativeFileDirname}/index.html";
        const fakeVars = {
            'relativeFileDirname': 'docs/api/v1'
        };

        const result = injectSystemVariables(input, fakeVars);
        assert.strictEqual(result, "https://internal.docs/docs/api/v1/index.html");
    });

    test('Relative Directory Expansion (Root Case)', () => {
        const input = "https://internal.docs/${relativeFileDirname}/index.html";
        const fakeVars = {
            'relativeFileDirname': '' // Empty string for root
        };

        const result = injectSystemVariables(input, fakeVars);
        // Should handle the double slash if dirname is empty (common slop case)
        assert.strictEqual(result, "https://internal.docs//index.html");
    });

    test('Multiple mixed variables', () => {
        const input = "Target: ${workspaceFolderBasename} - ${fileBasenameNoExtension}";
        const fakeVars = {
            'workspaceFolderBasename': 'my-repo',
            'fileBasenameNoExtension': 'user_controller'
        };

        const result = injectSystemVariables(input, fakeVars);
        assert.strictEqual(result, "Target: my-repo - user_controller");
    });

    test('Handle $ symbols in actual path values', () => {
        // If a folder name literally has $ (e.g. $RECYCLE.BIN)
        const input = "file://${file}";
        const fakeVars = {
            'file': 'C:\\$RECYCLE.BIN\\temp'
        };

        const result = injectSystemVariables(input, fakeVars);
        // Ensure the injection doesn't treat the path's $ as a regex group
        assert.strictEqual(result, "file:///C:/$RECYCLE.BIN/temp");
    });
});