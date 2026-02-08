/* eslint-disable curly */
import * as vscode from 'vscode';
import { parseDocument, isMap, isSeq, isScalar } from 'yaml';
import { minimatch } from 'minimatch';
import { jsonPathToRegex } from './pathMatcher';
import { LinkDetails, LinkRule } from './types';
import { createLink, injectSystemVariables } from './linkBuilder';
import path from 'path';


const FILE_SELECTORS: vscode.DocumentSelector = [{ pattern: '**/*' }];

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

// --- CORE LOGIC ---

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

    // Build variables once per document
    const vars = buildSystemVariableMap(document);

    // --- STRATEGY A: STRUCTURAL (JSON/YAML) ---
    // Only run AST parsing if the language is actually data.
    if (['yaml', 'json', 'jsonc'].includes(document.languageId)) {

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
                                // multiple paths can be provided for one rule
                                const paths: string[] = Array.isArray(rule.jsonPath!) ? rule.jsonPath! : [rule.jsonPath!];
                                let found = false;

                                for (const path of paths) {

                                    let ruleRegex = regexCache.get(path);
                                    if (!ruleRegex) {
                                        ruleRegex = jsonPathToRegex(path);
                                        regexCache.set(path, ruleRegex);
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

                                        const linkDetails: LinkDetails | null = createLink(targetContent, rule);
                                        if (linkDetails){
                                            const link = new vscode.DocumentLink(
                                                range,
                                                vscode.Uri.parse(injectSystemVariables(linkDetails.target, vars))
                                            );

                                            link.tooltip = linkDetails.tooltip;
                                            links.push(link);

                                            // allow the outer loop to terminate if we found a matching rule
                                            found = true;
                                            break;
                                        }
                                    }

                                }

                                // terminate if we found a match.
                                if (found) break;

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
    }

    // --- STRATEGY B: TEXT (REGEX ANYWHERE) ---
    // Runs on ANY file type (Markdown, Python, C++, etc.)
    // Runs on the raw text, ignores structure. Good for comments/weird files.
    const textPatternRules: LinkRule[] = activeRules.filter(r => !!r.textPattern);
    textPatternRules.forEach(rule => {
        try {
            // multiple patterns can be linked to one rule.
            const patterns: string[] = Array.isArray(rule.textPattern!) ? rule.textPattern! : [rule.textPattern!];

            for (const textPattern of patterns) {

                const globalRegex = new RegExp(textPattern!, 'g'); // Ensure global flag
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

                    const linkDetails: LinkDetails | null = createLink(match[0], rule);
                    if (linkDetails){
                        const link = new vscode.DocumentLink(
                            range,
                            vscode.Uri.parse(injectSystemVariables(linkDetails.target, vars))
                        );
                        link.tooltip = linkDetails.tooltip;
                        links.push(link);
                    }
                }
            }
        } catch (e) {
            console.log("Text pattern error", e);
        }
    });

    return links;
}

// --- VARS ---
function buildSystemVariableMap(doc: vscode.TextDocument): Record<string, string> {
    const workspace = vscode.workspace.getWorkspaceFolder(doc.uri);

    const relativeFile = vscode.workspace.asRelativePath(doc.uri);
    const relativeFileDirname = path.dirname(relativeFile);

    // We use fsPath to avoid "file:///" prefixes
    const vars: Record<string, string> = {
        'workspaceFolder': workspace ? workspace.uri.fsPath : '',
        'workspaceFolderBasename': workspace ? workspace.name : '',
        'file': doc.uri.fsPath,
        'relativeFile': vscode.workspace.asRelativePath(doc.uri),
        'fileDirname': path.dirname(doc.uri.fsPath),
        'fileExtname': path.extname(doc.uri.fsPath),
        'fileBasename': path.basename(doc.uri.fsPath),
        'fileBasenameNoExtension': path.basename(doc.uri.fsPath, path.extname(doc.uri.fsPath)),
        'pathSeparator': path.sep,
        'cwd': workspace ? workspace.uri.fsPath : '', // Standard fallback
        // non-canonical vscode variants:
        'relativeFileDirname': relativeFileDirname === '.' ? '' : relativeFileDirname,
    };

    return vars;
}