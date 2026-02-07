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
                    const searchRegex = new RegExp(t.search, 'g');
                    const applyTo = t.applyTo || 'all';

                    if (applyTo.startsWith('$')) {
                        const key = applyTo.slice(1); // strip the $

                        // Check if it's a named group
                        if (transformedNamedGroups[key] !== undefined) {
                            transformedNamedGroups[key] = transformedNamedGroups[key].replace(searchRegex, t.replace);
                        }
                        // Or a positional group
                        else {
                            const idx = parseInt(key);
                            if (!isNaN(idx) && transformedGroups[idx]) {
                                transformedGroups[idx] = transformedGroups[idx].replace(searchRegex, t.replace);
                            }
                        }
                    }
                }
            }

            let target = pattern.target;
            let tooltip = pattern.text || "Open Link";

            // inject positional groups and named groups in one pass
            const replacer = (placeholder: string, name: string) => {
                // 1. Try Named Groups first
                if (transformedNamedGroups[name] !== undefined) {
                    return transformedNamedGroups[name];
                }
                // 2. Try Positional Indices
                const idx = parseInt(name);
                if (!isNaN(idx) && transformedGroups[idx] !== undefined) {
                    return transformedGroups[idx];
                }
                // 3. Fallback to original if no match
                return placeholder;
            };

            const replacementRegex = /\$(\w+)/g;
            target = target.replace(replacementRegex, replacer);
            tooltip = tooltip.replace(replacementRegex, replacer);

            const linkDetails: LinkDetails = { target, tooltip };
            return linkDetails;
        }
    } catch (e) {
        console.log(`Link creation failed:`, e);
    }

    return null;
}