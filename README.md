# Structural Links


<video src="https://github.com/user-attachments/assets/e75a5a9e-4374-4930-934e-bf933e3f3b72"></video>



**Structural Links** is a VS Code extension that turns your static configuration files, logs, and proprietary data structures into interactive, clickable links.

Unlike standard link detectors that only catch `http://...`, this extension allows you to define **rules**. You can link specific keys in a YAML/JSON tree (using JSONPath) or arbitrary text patterns (using Regex) to dynamic targets, including external URLs, local files, or command URIs.

It includes a powerful **Transformation Engine** to clean up data (e.g., converting `My_Namespace` to `my.namespace`, or URL-encoding values) before generating the link.

## Features

### 1. Structural Linking (JSON/YAML)

Target specific nodes in your data structure. Links only appear where they belong, not everywhere the word matches.

* **Powered by JSONPath:** Target `$.database.hosts[*].name` specifically.
* **Value Filtering:** Only link values that match a specific Regex (e.g., only link filenames ending in `.py`).

### 2. Text Pattern Linking (Any File)

Use standard Regex to find patterns in any file type (Logs, Markdown, Python, etc.) and turn them into links.

* Great for Jira tickets (`PROJ-123`), UUIDs, or proprietary ID formats.

### 3. Transformation Pipeline

Raw data is rarely URL-ready. Clean it up before linking:

* **Regex Replace:** Swap `_` for `.` or remove prefixes.
* **Commands:** Built-in helpers like `urlEncode`, `toUpperCase`, `toLowerCase`, and `trim`.
* **Named Groups:** Use Python-style `(?<group>...)` regex naming for readable configurations.

### 4. Variable Injection

Construct links using context-aware variables:

* `${workspaceFolder}`, `${fileDirname}`, `${relativeFile}`, and more.

---

## Configuration Examples

Add these rules to your VS Code `settings.json` under `structuralLinks.rules`.

### Example 1: Simple JSON/YAML Property

Link a specific field in a config file to a search portal.

```json
{
  "filePattern": "**/*.yaml",
  "jsonPath": "$.myConfig.database.host",
  "linkPattern": {
    "target": "https://portal.example.com/servers/$0",
    "text": "View Server Logs for $0"
  }
}

```

### Example 2: Jira Tickets (Global Regex)

Find ticket IDs in any text file.

```json
{
  "filePattern": "**/*",
  "textPattern": "[A-Z]{2,10}-\\d+",
  "linkPattern": {
    "target": "https://jira.company.com/browse/$0",
    "text": "Open Ticket $0"
  }
}

```

### Example 3: Advanced Transforms & Named Groups

Extract data from a complex string, clean it up, and build a URL.

* **Input:** `prefix.us_east__asset_name`
* **Target:** `https://example.com/us.east?asset=ASSET-NAME`

```jsonc
{
  "jsonPath": "$.assets[*].id",
  "linkPattern": {
    "capture": "prefix\\.(?<region>.*)__(?<name>.*)",
    "target": "https://example.com/$region?asset=$name",
    "transforms": [
      // Change 'us_east' to 'us.east'
      { "applyTo": "$region", "search": "_", "replace": "." },
      // Uppercase the asset name
      { "applyTo": "$name", "command": "toUpperCase" },
      // Ensure the region is URL safe
      { "applyTo": "$region", "command": "urlEncode" }
    ],
    "text": "Go to $name in $region"
  }
}

```

### Example 4: Local Files

Link to a file relative to the current document.

```json
{
  "jsonPath": [
    "$.imports[*].path",
    "$.exports[*].path"
  ],
  "linkPattern": {
    "target": "file://${fileDirname}/$0",
    "text": "Open local file: $0"
  }
}

```

---

## Extension Settings

This extension contributes the following setting: `structuralLinks.rules`.

It is an array of rule objects. Each rule can be a **Structure Rule** (using `jsonPath`) or a **Text Rule** (using `textPattern`).

### Common Properties

| Property | Description | Default |
| --- | --- | --- |
| `filePattern` | Glob pattern to match files (e.g., `**/models/*.json`). | `**/*` |
| `linkPattern` | Defines how to construct the link (see below). | (Required) |

### Structure Rules (JSON/YAML)

| Property | Description |
| --- | --- |
| `jsonPath` | The JSONPath query (or queries) to locate nodes (e.g., `$.store.book[*]`). |
| `jsonPathValuePattern` | Optional Regex to validate the value found at the path. |

### Text Rules (Any File)

| Property | Description |
| --- | --- |
| `textPattern` | Global regex (or regexes) to find matches in the raw text. |

### Link Pattern Definition

The `linkPattern` object defines how the link is constructed.

| Property | Description |
| --- | --- |
| `capture` | Regex to extract parts of the value. Supports named groups `(?<name>...)`. Defaults to `^(.*)$`. |
| `target` | The destination URL. Supports `$1`, `$name`, and system variables (see below). |
| `text` | The tooltip text shown on hover. |
| `transforms` | An array of transformations to apply to captured groups. |

### Transforms

Transforms allow you to modify captured data before creating the URL.

**Regex Transform:**

```json
{ "applyTo": "$1", "search": "_", "replace": "-" }

```

**Command Transform:**
Supported commands: `urlEncode`, `urlDecode`, `toUpperCase`, `toLowerCase`, `trim`.

```json
{ "applyTo": "$1", "command": "urlEncode" }

```

### Supported Variables

You can use these variables in your `target` string:

* `${workspaceFolder}`: Root of the workspace.
* `${file}`: Full path of the current file.
* `${fileDirname}`: Directory of the current file.
* `${fileBasename}`: Filename (e.g. `data.yaml`).
* `${relativeFile}`: Path relative to workspace root.
* `${pathSeparator}`: OS-specific separator (`/` or `\`).

---

## Known Issues

* **URL Encoding:** Due to quirks in how VS Code parses URIs, the `urlEncode` command may behave inconsistently with complex query parameters containing `&` or `=`. Simple encoding (spaces, special chars) usually works fine.
* **Windows Paths:** While efforts have been made to normalize Windows paths (converting `\` to `/` in URIs), complex local file linking on Windows may require manual tweaking of the target pattern using `file:///`.

## Release Notes

### 0.0.4

Support having **a list of JSONPaths** under `jsonPath` and **a list of regex expressions** under `textPattern` to support reusing rules without copypaste.

### 0.0.3

VSCode package cleanups + changelog cleanups.

### 0.0.2

Added Extension Icon.

### 0.0.1

Initial release. Supports JSONPath, Regex patterns, and transformation pipelines.