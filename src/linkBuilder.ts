import { LinkDetails, LinkRule } from "./types";

export function createLink(matchedValue: string, rule: LinkRule): LinkDetails | null {
    const value = String(matchedValue);
    const pattern = rule.linkPattern;

    try {
        const regex = new RegExp(pattern.capture || '^(.*)$');
        const match = regex.exec(value);

        if (match) {
            // Setup local copies for transformation
            let transformedGroups = [...match];
            let transformedNamedGroups: { [key: string]: string } = { ...match.groups };

            // apply Transforms to Groups
            if (pattern.transforms) {
                for (const t of pattern.transforms) {
                    const applyTo = t.applyTo || 'all';

                    // Regex transforms can apply to 'all' (handled later),
                    // but commands usually need a specific target group.
                    if (applyTo === 'all' && !('command' in t)) continue;

                    const key = applyTo.startsWith('$') ? applyTo.slice(1) : applyTo;

                    // Helper to update the group values
                    const updateGroup = (val: string): string => {
                        if ('command' in t) {
                            switch (t.command) {
                                case 'urlEncode': return encodeURIComponent(val);
                                case 'urlDecode': return decodeURIComponent(val);
                                case 'toUpperCase': return val.toUpperCase();
                                case 'toLowerCase': return val.toLowerCase();
                                case 'trim':      return val.trim();
                                default:          return val;
                            }
                        } else {
                            const searchRegex = new RegExp(t.search, 'g');
                            return val.replace(searchRegex, t.replace);
                        }
                    };

                    // Apply to named groups
                    if (transformedNamedGroups[key] !== undefined) {
                        transformedNamedGroups[key] = updateGroup(transformedNamedGroups[key]);
                    }
                    // Apply to positional groups
                    else {
                        const idx = parseInt(key);
                        if (!isNaN(idx) && transformedGroups[idx] !== undefined) {
                            transformedGroups[idx] = updateGroup(transformedGroups[idx]);
                        }
                    }
                }
            }

            let target = pattern.target;
            let tooltip = pattern.text || "Open Link";

            // inject positional groups and named groups in one pass
            const replacer = (placeholder: string, name: string) => {
                if (transformedNamedGroups[name] !== undefined) {
                    return transformedNamedGroups[name];
                }
                const idx = parseInt(name);
                if (!isNaN(idx) && transformedGroups[idx] !== undefined) {
                    return transformedGroups[idx];
                }
                return placeholder;
            };

            const replacementRegex = /\$(\w+)/g;
            target = target.replace(replacementRegex, replacer);
            tooltip = tooltip.replace(replacementRegex, replacer);

            // Final pass: Apply 'all' regex transforms to the finished strings
            if (pattern.transforms) {
                for (const t of pattern.transforms) {
                    if (!('command' in t) && (t.applyTo === 'all' || !t.applyTo)) {
                        const searchRegex = new RegExp(t.search, 'g');
                        target = target.replace(searchRegex, t.replace);
                        tooltip = tooltip.replace(searchRegex, t.replace);
                    }
                }
            }

            return { target, tooltip };
        }
    } catch (e) {
        console.log(`Link creation failed:`, e);
    }

    return null;
}


export function injectSystemVariables(input: string, vars: Record<string, string>): string {
    let result = input;

    for (const [key, val] of Object.entries(vars)) {
        // Use a global regex to replace all instances of ${key}
        // We escape the $ and { } for the regex engine
        const re = new RegExp(`\\$\\{${key}\\}`, 'g');
        result = result.replace(re, val);
    }

    // Updated normalization check
    // Flip slashes if it's a URI OR if it's an absolute Windows path
    const isUri = result.includes('://');
    const isWindowsAbsPath = /^[a-zA-Z]:[\\/]/.test(result);

    if (isUri || isWindowsAbsPath) {
        result = result.replace(/\\/g, '/');
    }

    if (result.startsWith('file://') && !result.startsWith('file:///')) {
        result = result.replace('file://', 'file:///');
    }

    return result;
}