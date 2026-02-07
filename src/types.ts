export interface LinkRule {
    filePattern?: string;
    jsonPath?: string;
    jsonPathValuePattern?: string; // optional regex to match the value at the JSONPath
    textPattern?: string;
    linkPattern: {
        capture?: string;
        target: string;
        transforms?: LinkRuleTransform[];
        text?: string;
    };
}

export interface LinkRuleTransform {
    search: string;
    replace: string;
    applyTo?: string;
}