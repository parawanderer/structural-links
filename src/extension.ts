/* eslint-disable curly */
import * as vscode from 'vscode';
import { parseDocument, isMap, isSeq, isScalar, Document, Node } from 'yaml';
import { minimatch } from 'minimatch';
import { jsonPathToRegex } from './pathMatcher';

interface LinkRule {
    filePattern?: string;
    jsonPath?: string;
    jsonPathValuePattern?: string; // optional regex to match the value at the JSONPath
    textPattern?: string;
    linkPattern: {
        capture?: string;
        target: string;
        text?: string;
    };
}

const FILE_SELECTORS: vscode.DocumentSelector = [
    { language: 'yaml' },
    { language: 'json' }
];

let currentProvider: vscode.Disposable | undefined;
const regexCache = new Map<string, RegExp>();

export function activate(context: vscode.ExtensionContext) {

    const reloadProvider = () => {
        regexCache.clear();
        // Kill the old one if it exists
        if (currentProvider) {
            currentProvider.dispose();
        }

        // Register a new one (This forces VS Code to query for links immediately)
        currentProvider = vscode.languages.registerDocumentLinkProvider(
            FILE_SELECTORS,
            {
                provideDocumentLinks(document) {
                    return getLinks(document);
                }
            }
        );
    };

    // Initial Load
    reloadProvider();

    // Watch for changes and Nuke/Rebuild
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('structuralLinks')) {
            reloadProvider();
        }
    }));
}

export function deactivate() {
    if (currentProvider) {
        currentProvider.dispose();
    }
}

// utils:

function getLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const config = vscode.workspace.getConfiguration('structuralLinks');
    const allRules = config.get<LinkRule[]>('rules') || [];

    if (allRules.length === 0) return [];

    // Filter by File Pattern
    const docPath = vscode.workspace.asRelativePath(document.uri);
    const activeRules = allRules.filter(r => minimatch(docPath, r.filePattern || '**/*'));

    if (activeRules.length === 0) return [];

    const text = document.getText();
    const links: vscode.DocumentLink[] = [];


    // --- STRATEGY A: STRUCTURAL (JSON/YAML) ---
    // Only parse AST if we have at least one JSONPath rule
    const jsonPathRules: LinkRule[] = activeRules.filter(r => !!r.jsonPath);
    if (jsonPathRules.length > 0) {
        try {
            const yamlDoc = parseDocument(text);

            const visit = (node: any, currentPath: string[]) => {
                if (!node) return;

                if (isScalar(node)) {
                    // SLOP FIX: Join with Null Byte to preserve dots in keys
                    // path: ['.vars', 'foo'] -> "\x00.vars\x00foo"
                    const pathString = '\x00' + currentPath.join('\x00');

                    for (const rule of jsonPathRules) {
                        try {

                            let ruleRegex = regexCache.get(rule.jsonPath!);
                            if (!ruleRegex) {
                                ruleRegex = jsonPathToRegex(rule.jsonPath!);
                                regexCache.set(rule.jsonPath!, ruleRegex);
                            }

                            if (ruleRegex.test(pathString) && typeof node.value === 'string') {

                                if (rule.jsonPathValuePattern) {
                                    const valueRegex = new RegExp(rule.jsonPathValuePattern);
                                    const match = valueRegex.exec(String(node.value));

                                    if (!match) {
                                        continue; // Skip this rule if value doesn't match
                                    }
                                }

                                const targetContent: string = node.value as string;
                                const range = new vscode.Range(
                                    document.positionAt(node.range![0]),
                                    document.positionAt(node.range![1])
                                );

                                createLink(targetContent, range, rule, document, links);
                            }
                        } catch (e) { /* ignore invalid regex */ }
                    }
                    return;
                }

                if (isMap(node)) {
                        node.items.forEach((pair: any) => {
                            const keyName = pair.key && isScalar(pair.key) ? String(pair.key.value) : '';
                            // Don't skip empty keys, they are valid in YAML!
                            visit(pair.value, [...currentPath, keyName]);
                        });
                    }

                if (isSeq(node)) {
                    node.items.forEach((item: any, index: number) => {
                        visit(item, [...currentPath, String(index)]);
                    });
                }
            };

            visit(yamlDoc.contents, []);

        } catch (e) {
            console.error("Parse error", e);
        }
    }

    // --- STRATEGY B: TEXT (REGEX ANYWHERE) ---
    // Runs on the raw text, ignores structure. Good for comments/weird files.
    const textPatternRules: LinkRule[] = activeRules.filter(r => !!r.textPattern);
    textPatternRules.forEach(rule => {
        try {
            const globalRegex = new RegExp(rule.textPattern!, 'g'); // Ensure global flag

            let match: RegExpExecArray | null;
            while ((match = globalRegex.exec(text)) !== null) {
                // Construct a fake "Node" object to reuse createLink
                // match.index is the start, match[0].length is the length
                const startPos = match.index;
                const endPos = match.index + match[0].length;

                // We create a fake node with a range property
                // We need to map offset to line/col manually here since we don't have AST
                const range = new vscode.Range(
                    document.positionAt(startPos),
                    document.positionAt(endPos)
                );

                createLink(match[0], range, rule, document, links);
            }
        } catch (e) {
            console.log("Text pattern error", e);
        }
    });

    return links;
}

function createLink(matchedValue: string, targetRange: vscode.Range, rule: LinkRule, doc: vscode.TextDocument, links: vscode.DocumentLink[]) {
    const value = String(matchedValue);
    const pattern = rule.linkPattern; // Access the new nested object

    try {
        const regex = new RegExp(pattern.capture || '(.*)');
        const match = regex.exec(value);

        if (match) {
            let target = pattern.target;
            let tooltip = pattern.text || "Open Link"; // Default tooltip

            // Replace $1, $2, etc. in both Target and Tooltip
            for (let i = 0; i < match.length; i++) {
                const groupVal = match[i] || '';
                target = target.replace(new RegExp(`\\$${i}`, 'g'), groupVal);
                tooltip = tooltip.replace(new RegExp(`\\$${i}`, 'g'), groupVal);
            }

            // Workspace Folder expansion
            if (target.includes('${workspaceFolder}')) {
                const ws = vscode.workspace.getWorkspaceFolder(doc.uri);
                const wsPath = ws ? ws.uri.toString() : '';
                target = target.replace('${workspaceFolder}', wsPath);
            }

            const link = new vscode.DocumentLink(targetRange, vscode.Uri.parse(target));
            link.tooltip = tooltip; // VS Code native tooltip (simple text)
            links.push(link);
        }
    } catch (e) {
        console.log(`Regex failed for rule ${rule.jsonPath}:`, e);
    }
}