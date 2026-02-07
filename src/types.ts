export interface LinkRule {
    filePattern?: string;
    jsonPath?: string;
    jsonPathValuePattern?: string; // optional regex to match the value at the JSONPath
    textPattern?: string;
    linkPattern: {
        capture?: string;
        target: string;
        transforms?: (LinkRuleTransformRegex|LinkRuleTransformCommand)[];
        text?: string;
    };
}

export interface LinkRuleTransformRegex {
    search: string;
    replace: string;
    applyTo?: string;
}

export interface LinkRuleTransformCommand {
    command: string;
    applyTo?: string;
}

export interface LinkDetails {
    target: string;
    tooltip: string;
}