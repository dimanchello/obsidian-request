# Obsidian Postman Clone

A powerful, native Obsidian plugin that brings full-featured API testing capabilities directly into your vault. Designed to perfectly match Obsidian's native theme and workflow, this plugin allows you to build, test, and manage complex API collections seamlessly.

## 🚀 Features (v1.0.0)

*   **Native Obsidian Experience:** Adapts flawlessly to your light/dark themes, accent colors, and supports both desktop and mobile interfaces with resizable, scrollable panels.
*   **Markdown Storage:** API Collections are stored as simple JSON code blocks inside standard Obsidian Markdown notes (`.md`), ensuring they sync perfectly across all your devices using Obsidian Sync, Git, or any other service.
*   **Comprehensive Request Support:**
    *   **Methods:** `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`.
    *   **Auth:** `Basic`, `Bearer Token`, and `API Key` (header or query injection).
    *   **Body Types:** Raw JSON, XML/HTML, `x-www-form-urlencoded`, `multipart/form-data` (with full file upload support via native OS file pickers!), and raw `binary` files.
*   **Environments & Variables:** Manage multiple environments (e.g., Local, Dev, Prod) with variables. Use `{{variableName}}` anywhere in your URLs, headers, or body payloads to dynamically inject data.
*   **JSONPath Extraction:** Automatically parse API responses using [JSONPath](https://github.com/JSONPath-Plus/JSONPath) to extract tokens or IDs and save them into your active environment variables for subsequent requests.
*   **Pre-request Dependencies:** Chain requests together! Select other requests to run sequentially before your main request. View their execution logs, response bodies, and extracted variables in a dedicated UI tab.
*   **Rich Response Viewer:**
    *   View Status Codes, Time (ms), and Response Sizes.
    *   Inspect Response Headers and parsed Cookies.
    *   **Syntax Highlighting:** Automatically formats and highlights JSON and XML responses.
    *   **Preview Mode:** Render HTML responses natively in an iframe, or view binary image payloads directly inside Obsidian.
*   **Developer Quality-of-Life:**
    *   One-click **Prettify** button for raw request bodies.
    *   Live URL ↔ Query Parameter two-way synchronization.
    *   Search/filter your request list instantly.
*   **Postman Interoperability:** Import standard Postman Collections (v2.1.0 JSON format) into your Obsidian note, and Export your Obsidian API notes back out into Postman-compatible files.

## 🛠️ How to Use

### 1. Initialize a Collection
Create a new note in Obsidian. Add the following YAML frontmatter at the very top of the file:
```yaml
---
api-collection: true
---
```
When you open or click on this note, the standard text editor will immediately transform into the API Editor interface. *(You can always switch back to the raw markdown editor via the `Open as Markdown` button in the top right menu of the pane).*

### 2. Creating Requests
Click **+ Add Request** in the sidebar. You can rename the request by clicking its title at the top of the editor.

### 3. Using Environments
Click the `⚙️ Manage` icon above the environment dropdown in the sidebar to create an environment. Add a variable (e.g., `host = https://api.example.com`).
Now, type `{{host}}/users` into your request URL bar.

### 4. Running Dependency Chains (Pre-reqs)
If your request requires an authentication token from a `/login` endpoint, go to the **Pre-req** tab of your main request. Search for and add the `/login` request. Now, when you click **Send**, the plugin will first execute `/login`, extract the token (if you configured an extraction rule on it), and *then* run your main request with the newly acquired token.

## 📥 Installation

1. Copy the plugin folder into your vault's `.obsidian/plugins/` directory.
2. Ensure you have Node.js installed on your machine.
3. Open a terminal in the plugin folder and run:
   ```bash
   npm install
   npm run build
   ```
4. Restart Obsidian, go to **Settings > Community Plugins**, and enable **Postman Clone**.
