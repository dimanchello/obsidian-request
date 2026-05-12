import { Plugin, TextFileView, WorkspaceLeaf, TFile, MarkdownView } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { App } from './ui/App';
import { parseCollectionData, updateCollectionData } from './storage';

export const VIEW_TYPE_POSTMAN_COLLECTION = 'postman-collection-view';

class PostmanCollectionView extends TextFileView {
    root: Root | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);

        // Add "Open as Markdown" action
        this.addAction('file-code-2', 'Open as Markdown', () => {
            this.openAsMarkdown();
        });
    }

    async openAsMarkdown() {
        await this.leaf.setViewState({
            type: 'markdown',
            state: this.leaf.view.getState()
        });
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
        this.registerExtensions(['postmancollection'], VIEW_TYPE_POSTMAN_COLLECTION);

        // This button will appear on all markdown files, but we can configure it to only show
        // or be clickable when it's an api-collection
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.checkActiveLeaves();
            })
        );

        // Also check on load in case the file was open when Obsidian started
        this.app.workspace.onLayoutReady(() => {
            this.checkActiveLeaves();
        });

        // Add a ribbon icon as a fallback to manually convert the active markdown file
        this.addRibbonIcon('zap', 'Open as API Collection', async () => {
            const file = this.app.workspace.getActiveFile();
            if (file && file.extension === 'md') {
                this.activateCollectionView(file);
            }
        });

        // Add a command to the command palette
        this.addCommand({
            id: 'open-as-api-collection',
            name: 'Open active file as API Collection',
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile();
                if (file && file.extension === 'md') {
                    if (!checking) {
                        this.activateCollectionView(file);
                    }
                    return true;
                }
                return false;
            }
        });
    }

    // Check all leaves to see if any are standard markdown views but have the api-collection frontmatter
    checkActiveLeaves() {
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        for (const leaf of leaves) {
            if (leaf.view instanceof MarkdownView && leaf.view.file) {
                const file = leaf.view.file;
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache?.frontmatter && cache.frontmatter['api-collection'] === true) {
                    // It's a markdown view, but it should be our custom view. Switch it!
                    this.activateCollectionViewForLeaf(file, leaf);
                }
            }
        }
    }

    async activateCollectionViewForLeaf(file: TFile, leaf: WorkspaceLeaf) {
        // Prevent infinite loops by checking the type first
        if (leaf.view.getViewType() !== VIEW_TYPE_POSTMAN_COLLECTION) {
             await leaf.setViewState({
                type: VIEW_TYPE_POSTMAN_COLLECTION,
                state: leaf.view.getState()
            });
        }
    }

    async activateCollectionView(file: TFile) {
        let leaf = this.app.workspace.getLeaf(false);
        if (leaf.view.getViewType() !== VIEW_TYPE_POSTMAN_COLLECTION) {
            await leaf.setViewState({
                type: VIEW_TYPE_POSTMAN_COLLECTION,
                state: { file: file.path }
            });
        }
    }
}
