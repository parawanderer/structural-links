import * as vscode from 'vscode';
import { parseDocument, isMap, isSeq, isScalar, Document, Node } from 'yaml';
import { minimatch } from 'minimatch';

interface LinkRule {
    filePattern: string;
    jsonPath: string;
    linkPattern: {
        capture: string;
        target: string;
        text?: string;
    };
}

const FILE_SELECTORS: vscode.DocumentSelector = [
    { language: 'yaml' },
    { language: 'json' }
];

let currentProvider: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext) {

    const reloadProvider = () => {
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

function getLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const config = vscode.workspace.getConfiguration('structuralLinks');
    const allRules = config.get<LinkRule[]>('rules') || [];

    if (allRules.length === 0) return [];

    // 1. FILTER: Only keep rules that apply to THIS file
    // We use workspace.asRelativePath to get a clean path for minimatch
    const docPath = vscode.workspace.asRelativePath(document.uri);
    const activeRules = allRules.filter(r => minimatch(docPath, r.filePattern || '**/*'));

    if (activeRules.length === 0) return [];

    const text = document.getText();
    const links: vscode.DocumentLink[] = [];

    try {
        const yamlDoc = parseDocument(text);

        const visit = (node: any, currentPath: string[]) => {
            if (!node) return;

            if (isScalar(node)) {
                const pathString = currentPath.join('.');

                for (const rule of activeRules) {
                    // Match the JSON Path
                    const ruleRegex = new RegExp('^' + rule.jsonPath.replace(/\./g, '\\.').replace(/\*/g, '[^.]+') + '$');

                    if (ruleRegex.test(pathString)) {
                        createLink(node, rule, document, links);
                    }
                }
                return;
            }

            if (isMap(node)) {
                node.items.forEach((pair: any) => {
                    const keyName = pair.key && isScalar(pair.key) ? String(pair.key.value) : '';
                    if (keyName) visit(pair.value, [...currentPath, keyName]);
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

    return links;
}

function createLink(node: any, rule: LinkRule, doc: vscode.TextDocument, links: vscode.DocumentLink[]) {
    const value = String(node.value);
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

            if (node.range) {
                const range = new vscode.Range(
                    doc.positionAt(node.range[0]),
                    doc.positionAt(node.range[1])
                );

                const link = new vscode.DocumentLink(range, vscode.Uri.parse(target));
                link.tooltip = tooltip; // VS Code native tooltip (simple text)
                links.push(link);
            }
        }
    } catch (e) {
        console.log(`Regex failed for rule ${rule.jsonPath}:`, e);
    }
}

export function deactivate() {
    if (currentProvider) {
        currentProvider.dispose();
    }
}