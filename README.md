# Obsidian Postman Clone

A powerful, native Obsidian plugin that brings Postman-like API testing capabilities directly into your notes.

## How to use

1. **Create a Collection Note:**
   Create a new Markdown note in your Obsidian vault. To turn this note into an API Collection, add the following frontmatter at the very top of the file:
   ```yaml
   ---
   api-collection: true
   ---
   ```
   When you open this note, the standard text editor will be replaced by the Postman-like interface.

2. **Environments & Variables:**
   - In the left sidebar, you can create and switch between different **Environments** (e.g., Local, Dev, Prod).
   - Variables are defined as Key-Value pairs inside an environment.
   - You can use these variables in URLs, Headers, Body, and Params by wrapping the key in double curly braces. For example: `https://api.example.com/users/{{userId}}` or `{{token}}`.

3. **Creating Requests:**
   - Click **+ Add Request** in the sidebar.
   - Select the HTTP method (GET, POST, etc.) and enter your URL.
   - Use the tabs (Params, Headers, Body) to configure your request.

4. **Uploading Files (Form-Data):**
   - For `POST` requests, select the **Body** tab and choose **form-data**.
   - Change the item type from `Text` to `File`.
   - A file picker will appear. Select any file from your computer to attach it to the request.

5. **Extracting Variables from Responses (JSONPath):**
   - Select the **Extract** tab.
   - Enter a variable name (e.g., `authToken`).
   - Enter a [JSONPath](https://github.com/JSONPath-Plus/JSONPath) string (e.g., `$.data.token`).
   - When you click **Send**, the plugin will parse the response JSON. If the path is found, the value will be saved automatically into your active Environment, making it available for subsequent requests in the same collection!

## Installation
1. Run `npm install`.
2. Run `npm run build` to generate `main.js`.
3. Enable the plugin in Obsidian settings.
