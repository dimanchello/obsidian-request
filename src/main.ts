import { Plugin, TextFileView, WorkspaceLeaf, TFile } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { App } from './ui/App';
import { parseCollectionData, updateCollectionData } from './storage';

export const VIEW_TYPE_POSTMAN_COLLECTION = 'postman-collection-view';

class PostmanCollectionView extends TextFileView {
    root: Root | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewData(): string {
        return this.data;
    }

    setViewData(data: string, clear: boolean): void {
        this.data = data;
        this.renderReact();
    }

    clear(): void {
        this.data = "";
        this.renderReact();
    }

    getViewType(): string {
        return VIEW_TYPE_POSTMAN_COLLECTION;
    }

    getDisplayText(): string {
        return this.file ? this.file.basename : "Postman Collection";
    }

    async handleSaveData(newData: any) {
        if (this.file) {
            this.data = updateCollectionData(this.data, newData);
            await this.app.vault.modify(this.file, this.data);
        }
    }

    renderReact() {
        const container = this.contentEl;
        container.empty();

        const data = parseCollectionData(this.data);

        const reactRoot = container.createDiv({ cls: 'postman-clone-root', attr: { style: 'height: 100%; width: 100%;' } });
        if (!this.root) {
            this.root = createRoot(reactRoot);
        }

        this.root.render(
            React.createElement(App, {
                data: data,
                onSave: (newData) => this.handleSaveData(newData)
            })
        );
    }

    async onClose() {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
    }
}

export default class PostmanClonePlugin extends Plugin {
    async onload() {
        this.registerView(VIEW_TYPE_POSTMAN_COLLECTION, (leaf) => new PostmanCollectionView(leaf));
        // We do not register '.md' here because it conflicts with Obsidian's default markdown view.
        // We rely on the "file-open" event below to switch the view if the file has our frontmatter.
        this.registerExtensions(['postmancollection'], VIEW_TYPE_POSTMAN_COLLECTION);
        this.registerEvent(this.app.workspace.on("file-open", (file) => {
            if (file && file.extension === 'md') {
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache?.frontmatter && cache.frontmatter['api-collection'] === true) {
                    this.activateCollectionView(file);
                }
            }
        }));
    }

    async activateCollectionView(file: TFile) {
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_POSTMAN_COLLECTION,
                state: { file: file.path }
            });
        }
    }
}
