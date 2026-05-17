<script lang="ts">
    import type { ProseMirrorEditor } from "@client/applications/ux/_module.mjs";
    import { TextEditorPF2e } from "@system/text-editor.ts";

    interface ProseMirrorParams {
        name: string;
        value: string;
        enriched?: string;
        toggled?: boolean;
        collaborate?: boolean;
        disabled?: boolean;
        compact?: boolean;
        documentUuid?: string;
        open?: boolean;
    }
    let {
        name,
        value = $bindable(),
        open = $bindable(),
        enriched,
        toggled,
        collaborate,
        disabled,
        compact,
        documentUuid,
    }: ProseMirrorParams = $props();
    let parentElement: HTMLDivElement | null = $state(null);
    let content: HTMLDivElement | null = $state(null);
    let active = $state(false);
    let editor: ProseMirrorEditor | null = $state(null);

    async function activateEditor() {
        if (!content || !open || active) return;

        const plugins = {
            menu: foundry.prosemirror.ProseMirrorMenu.build(foundry.prosemirror.defaultSchema, {
                compact: !!compact,
                destroyOnSave: toggled,
                onSave: () => save(),
            }),
            keyMaps: foundry.prosemirror.ProseMirrorKeyMaps.build(foundry.prosemirror.defaultSchema, {
                onSave: () => save(),
            }),
        };

        // Create the TextEditor instance
        const document = documentUuid ? await foundry.utils.fromUuid(documentUuid) ?? undefined : undefined;
        editor = await TextEditorPF2e.create(
            {
                plugins,
                fieldName: name,
                collaborate,
                target: content,
                document,
                props: { editable: () => !disabled },
            },
            value,
        );

        // Toggle active state
        active = true;
        parentElement?.dispatchEvent(new Event("open"));
    }

    async function save() {
        const save = new Event("save", { bubbles: true, cancelable: true });
        parentElement?.dispatchEvent(save);
        if (save.defaultPrevented) return;

        if (active) {
            const editorContent = editor?.view.state.doc.content;
            const activeValue = editorContent ? foundry.prosemirror.dom.serializeString(editorContent) : null;
            if (activeValue !== null && activeValue !== value) {
                value = activeValue;
                parentElement?.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
            }
        }

        if (toggled) {
            open = false; // will trigger the effect
        }
    }

    // Perform certain updates based on open state
    $effect(() => {
        if (open && !active) {
            activateEditor();
        } else if (!open && active) {
            editor?.destroy();
            active = false;
            if (parentElement && content) {
                parentElement.querySelector(".menu-container")?.remove();
                parentElement.querySelector(".editor-container")?.remove();
                parentElement?.append(content);
            }
            dispatchEvent(new Event("close", {bubbles: true, cancelable: true}));
        }
    })
</script>

<div class="editor prosemirror" class:active={active} class:inactive={!active} bind:this={parentElement}>
    {#if toggled && !open}
        <button type="button" class="icon toggle" disabled={active} onclick={() => open = true} aria-label="edit">
            <i class="fa-solid fa-pen-to-square" inert></i>
        </button>
    {/if}
    <div class="editor-content" data-engine="prosemirror" data-edit={name} bind:this={content}>
        {@html active ? value : enriched ?? value}
    </div>
</div>

<style lang="css">
    /** The global styles are for the prose-mirror element, so we need to redefine them */
    .editor > button {
        position: absolute;
        top: 2px;
        right: 2px;
        margin: 0 1px;
        padding: 0;
        text-align: center;
    }
</style>
