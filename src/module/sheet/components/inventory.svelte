<script lang="ts">
    import type { PhysicalItemPF2e } from "@item";
    import type { InventoryItemSvelte, SheetInventorySvelte, SheetItemList } from "@actor/loot/sheet.ts"; // todo: move
    import MiniSearch from "minisearch";
    import * as R from "remeda";
    import { ErrorPF2e, htmlClosest, htmlQuery, htmlQueryAll, SORTABLE_BASE_OPTIONS } from "@util";
    import Sortable from "sortablejs";
    import type { ActorPF2e } from "@actor/base.ts";
    import type { Attachment } from "svelte/attachments";
    import { isContainerCycle } from "@item/container/helpers.ts";
    import { createSortable } from "@util/destroyables.ts";
    import ItemSummary from "@module/sheet/components/item-summary.svelte";
    import HoverIconButton from "@module/sheet/components/hover-icon-button.svelte";
    import { UserPF2e } from "@module/user/index.ts";
    interface InventoryProps {
        user: UserPF2e;
        actor: ActorPF2e;
        inventory: SheetInventorySvelte;
        queryText?: string;
        isEditable: boolean;
        isOwner: boolean;
    }

    const { user, actor, inventory, queryText, isEditable, isOwner }: InventoryProps = $props();
    const openStates: Record<string, boolean> = $state({});
    let inventoryEl = $state<HTMLElement>();

    const inventorySearchEngine = new MiniSearch<Pick<PhysicalItemPF2e, "uuid" | "name">>({
        fields: ["name"],
        idField: "uuid",
        processTerm: (t) => (t.length > 1 ? t.toLocaleLowerCase(game.i18n.lang) : null),
        searchOptions: { combineWith: "AND", prefix: true },
    });

    $effect(() => {
        // Only triggers on state updates due to inventory inclusion
        inventorySearchEngine.removeAll();
        const allItems = R.pipe(
            inventory.sections,
            R.flatMap((s) => s.items),
            R.flatMap((i) => getItemAndChildren(i))
        );
        inventorySearchEngine.addAll(allItems.map((i) => ({ uuid: i.uuid, name: i.name })));
    });

    const filteredInventorySections = $derived.by(() => {
        // Search only starts once at least two characters are inserted
        if (!queryText || queryText.trim().length <= 1) return inventory.sections;

        const results = new Set(inventorySearchEngine.search(queryText).map((r) => r.id));
        return inventory.sections.reduce((r: SheetItemList[], current) => {
            const filteredItems = current.items.filter((i) => getItemAndChildren(i).some((i) => results.has(i.uuid)));
            if (filteredItems.length) {
                r.push({ ...current, items: filteredItems });
            }
            return r;
        }, []);
    });


    const attachSortable: Attachment<HTMLElement> = (element) => {
        const form = htmlClosest(element, "form");
        if (!form) throw ErrorPF2e("Unexpected missing form");

        const options: Sortable.Options = {
            ...SORTABLE_BASE_OPTIONS,
            revertOnSpill: true,
            scroll: inventoryEl,
            // Necessary for drag/drop to other sheets/tokens to work
            setData: (dataTransfer, dragEl) => {
                const item = actor.inventory.get(dragEl.dataset.itemId, { strict: true });
                dataTransfer.setData("text/plain", JSON.stringify({ ...item.toDragData(), fromInventory: true }));
            },
            onMove: (event) => {
                const isSeparateSheet = htmlClosest(event.target, "form") !== htmlClosest(event.related, "form");
                if (!isEditable || isSeparateSheet) return false;

                const sourceItem: PhysicalItemPF2e<ActorPF2e> | undefined = actor.inventory.get(
                    event.dragged?.dataset.itemId,
                    { strict: true },
                );

                const containerRowData = htmlQueryAll(inventoryEl, "li[data-is-container] > .data");
                for (const row of containerRowData) {
                    row.classList.remove("drop-highlight");
                }

                const targetSection =
                    htmlClosest(event.related, "ul[data-item-types]")?.dataset.itemTypes?.split(",") ?? [];
                if (targetSection.length === 0) return false;
                if (targetSection.includes(sourceItem.type)) return true;

                if (targetSection.includes("backpack")) {
                    const openContainerId =
                        htmlClosest(event.related, "ul[data-container-id]")?.dataset.containerId ?? "";
                    const openContainer: PhysicalItemPF2e<ActorPF2e> | undefined =
                        actor.inventory.get(openContainerId);
                    const targetItemRow = htmlClosest(event.related, "li[data-item-id]");
                    const targetItem = actor.inventory.get(targetItemRow?.dataset.itemId ?? "");
                    if (targetItem?.isOfType("backpack")) {
                        if (isContainerCycle(sourceItem, targetItem)) return false;
                        if (targetItemRow && !openContainer) {
                            htmlQuery(targetItemRow, ":scope > .data")?.classList.add("drop-highlight");
                            return false;
                        }
                    }

                    return !!targetItem;
                }

                return false;
            },
            onEnd: async (event: Sortable.SortableEvent & { originalEvent?: DragEvent }): Promise<void> => {
                if (!isEditable) return;
                const dropTarget = event.originalEvent?.target;
                const droppedOnCanvas = !!dropTarget && dropTarget instanceof HTMLCanvasElement;
                const droppedOnOtherSheet = !droppedOnCanvas && htmlClosest(event.originalEvent?.target, "form") !== form;
                if (droppedOnOtherSheet) return;

                const containerRowData = htmlQueryAll(inventoryEl, "li[data-is-container] > .data");
                for (const row of containerRowData) {
                    row.classList.remove("drop-highlight");
                }
                if (droppedOnCanvas) return;
                if (!htmlClosest(dropTarget, "ul[data-item-list]")) return; // Dropped outside any item list

                const inventory = actor.inventory;
                const sourceItem = inventory.get(event.item.dataset.itemId, { strict: true });
                const itemListMovedTo = event.item.closest("ul[data-item-list]");
                const itemsInList = htmlQueryAll(itemListMovedTo, ":scope > li").map((li) =>
                    li.dataset.itemId === sourceItem.id ? sourceItem : inventory.get(li.dataset.itemId, { strict: true }),
                );
                const targetItemId = htmlClosest(dropTarget, "li[data-item-id]")?.dataset.itemId ?? "";
                const targetItem = inventory.get(targetItemId);

                // Determine if the "real" drop target is a stackable item
                const stackTarget = targetItem?.isStackableWith(sourceItem) ? targetItem : null;
                if (stackTarget) return sourceItem.move({ toStack: stackTarget });

                // Update container if dropping into one
                const containerElem = htmlClosest(event.item, "ul[data-container-id]");
                const containerId = containerElem?.dataset.containerId ?? "";
                const container = targetItem?.isOfType("backpack") ? targetItem : inventory.get(containerId);
                if (container && !container.isOfType("backpack")) {
                    throw ErrorPF2e("Unexpected non-container retrieved while sorting items");
                }

                if (container && isContainerCycle(sourceItem, container)) {
                    console.log("Should reject");
                    // this.render();
                    return;
                }

                // Perform necessary re-sorting
                const sourceIndex = itemsInList.indexOf(sourceItem);
                const targetBefore = itemsInList[sourceIndex - 1];
                const targetAfter = itemsInList[sourceIndex + 1];
                const siblings = [...itemsInList];
                siblings.splice(siblings.indexOf(sourceItem), 1);
                type SortingUpdate = { _id: string; "system.containerId": string | null; sort?: number };
                const sortingUpdates: SortingUpdate[] = fu
                    .performIntegerSort(sourceItem, {
                        siblings,
                        target: targetBefore ?? targetAfter,
                        sortBefore: !targetBefore,
                    })
                    .map((u) => ({ _id: u.target.id, "system.containerId": container?.id ?? null, sort: u.update.sort }));
                if (!sortingUpdates.some((u) => u._id === sourceItem.id)) {
                    sortingUpdates.push({ _id: sourceItem.id, "system.containerId": container?.id ?? null });
                }

                actor.updateEmbeddedDocuments("Item", sortingUpdates);
            }
        };

        createSortable(element, options);
    };

    function getItemAndChildren(item: InventoryItemSvelte): InventoryItemSvelte[] {
        return [
            item,
            item.subitems.flatMap((i) => getItemAndChildren(i)),
            item.containedItems?.flatMap((i) => getItemAndChildren(i)) ?? []
        ].flat();
    }
</script>

<section class="inventory-list" data-inventory bind:this={inventoryEl}>
    {#each filteredInventorySections as section (section.label)}
        {@const showPrice =
            ["merchant", "loot"].includes(inventory.displayType) || section.types.includes("treasure")}
        {@const showUnitBulkPrice = inventory.displayType === "merchant"}
        <header class="section-header">
            <span class="title">{section.label}</span>
            {#if showPrice}
                <span class="price">
                    {_loc(showUnitBulkPrice ? "PF2E.Actor.Inventory.UnitTitle.Price" : "PF2E.ValueLabel")}
                </span>
            {/if}
            <span class="quantity">
                {_loc(
                    inventory.displayType === "merchant"
                        ? "PF2E.Actor.Inventory.UnitTitle.Quantity"
                        : "PF2E.QuantityLabel",
                )}
            </span>
            <span class="bulk">
                {_loc("PF2E.Item.Physical.Bulk.Label")}
            </span>
            {#if isEditable}
                <div class="item-controls">
                    <button
                        class="inline-control icon fa-solid fa-fw fa-plus"
                        data-action="createItem"
                        data-tooltip="PF2E.CreateItemTitle"
                        data-types={section.types}
                        aria-labelledby="tooltip"
                    ></button>
                    <button
                        class="inline-control icon fa-solid fa-fw fa-search"
                        data-action="browseEquipment"
                        data-tooltip="PF2E.OpenInventoryBrowser"
                        data-filter={section.types}
                        aria-labelledby="tooltip"
                    ></button>
                </div>
            {/if}
        </header>
        <ul class="items" data-item-list data-item-types={section.types} data-loot {@attach attachSortable}>
            {#each section.items.filter((i) => !i.hidden || isOwner) as item (item.uuid)}
                {@render itemLine({ item, showPrice, showUnitBulkPrice })}
            {/each}
        </ul>
    {/each}
</section>

{#snippet itemLine(args: {
    item: InventoryItemSvelte;
    /** Whether or not price should be shown at all */
    showPrice: boolean;
    /** When showing unit/price values, whether to show unit values. If false, shows total values */
    showUnitBulkPrice: boolean;
    isSubitem?: boolean;
})}
    {@const { item, isSubitem = false, showUnitBulkPrice, showPrice } = args}
    {@const isEditable = item.isEditable}
    {@const isContainer = !!item.containedItems}
    <li
        data-uuid={item.uuid}
        data-item-id={!isSubitem ? item.id : null}
        data-subitem-id={isSubitem ? item.id : null}
        data-is-container={isContainer || null}
        data-item-type={item.type}
        class:hidden-item={!!item.hidden}
    >
        <div class="data">
            <div class="item-name">
                <HoverIconButton
                    class="item-image"
                    src={item.img}
                    icon="fa-solid fa-message"
                    data-action="sendItemToChat"
                />
                {#if item.containedItems !== null}
                    <button
                        class="icon fa-solid fa-fw inline-control"
                        class:fa-box={item.isCollapsed}
                        class:fa-box-open={!item.isCollapsed}
                        data-action="toggleContainer"
                        data-tooltip="PF2E.OpenItemTitle"
                        aria-labelledby="tooltip"
                    ></button>
                {/if}
                <span class={["name", item.rarity]}>
                    <button class="flat" onclick={() => (openStates[item.uuid] = !openStates[item.uuid])}>
                        {item.name}
                    </button>
                    {#if item.realName}
                        <span class="gm-mystified-data">({item.realName})</span>
                    {/if}
                    {#if item.itemSize}
                        <span class="size">({item.itemSize})</span>
                    {/if}
                    {#if item.isTemporary}
                        <i class="fa-solid fa-stopwatch" data-tooltip="PF2E.TemporaryItemToolTip"></i>
                    {/if}
                </span>
                {#if item.uses}
                    <span class="uses">({item.uses.value}/{item.uses.max})</span>
                {/if}
            </div>
            {#if showPrice}
                <span class="price">
                    {#if item.isEditable && item.isCredstick && !isSubitem}
                        <button
                            class="plain decrease"
                            data-action="decreaseCredits"
                            data-tooltip
                            aria-label={["Click", "ShiftClick", "ControlClick"]
                                .map((k) => _loc(`PF2E.Actor.Inventory.ItemQuantity.Decrease.${k}`))
                                .join("&#013;")}
                        >
                            &ndash;
                        </button>
                    {/if}
                    {showUnitBulkPrice ? item.price.unit : item.price.asset}
                    {#if item.isEditable && item.isCredstick && !isSubitem}
                        <button
                            class="plain increase"
                            data-action="increaseCredits"
                            data-tooltip
                            aria-label={["Click", "ShiftClick", "ControlClick"]
                                .map((k) => _loc(`PF2E.Actor.Inventory.ItemQuantity.Increase.${k}`))
                                .join("&#013;")}
                        >
                            +
                        </button>
                    {/if}
                </span>
            {/if}
            <span class="quantity">
                {#if item.canEditQuantity && !isSubitem}
                    <button
                        class="plain decrease"
                        data-action="decreaseQuantity"
                        data-tooltip
                        aria-label={["Click", "ShiftClick", "ControlClick"]
                            .map((k) => _loc(`PF2E.Actor.Inventory.ItemQuantity.Decrease.${k}`))
                            .join("&#013;")}
                    >
                        &ndash;
                    </button>
                {/if}
                <span>{item.quantity}</span>
                {#if item.canEditQuantity && !isSubitem}
                    <button
                        class="plain increase"
                        data-action="increaseQuantity"
                        data-tooltip
                        aria-label={["Click", "ShiftClick", "ControlClick"]
                            .map((k) => _loc(`PF2E.Actor.Inventory.ItemQuantity.Increase.${k}`))
                            .join("&#013;")}
                    >
                        +
                    </button>
                {/if}
            </span>
            <span class="bulk">{showUnitBulkPrice ? item.bulk.unit : item.bulk.asset}</span>
            {#if isEditable}
                <div class="item-controls">
                    {#if isSubitem && (item.isIdentified || user.isGM)}
                        <button
                            type="button"
                            class="plain inline-control item-carry-type active detach"
                            data-action="detach-subitem"
                            data-tooltip
                            aria-label={_loc("PF2E.Item.Physical.Attach.Detach.Label")}
                        >
                            <span class="fa-stack fa-fw fa-2xs">
                                <i class="fa-solid fa-paperclip fa-stack-2x"></i>
                                <i class="fa-solid fa-slash fa-stack-2x"></i>
                            </span>
                        </button>
                    {/if}
                    {#if item.isDamaged}
                        <button
                            type="button"
                            class="plain inline-control icon fa-solid fa-hammer"
                            data-action="repairItem"
                            data-tooltip
                            aria-label={_loc("PF2E.RepairItemTitle")}
                        ></button>
                    {/if}
                    {#if user.isGM}
                        {#if item.isIdentified}
                            <button
                                type="button"
                                class="plain inline-control icon fa-regular fa-circle-question"
                                data-action="toggleIdentified"
                                data-tooltip
                                aria-label={_loc("PF2E.identification.Mystify")}
                            ></button>
                        {:else}
                            <button
                                type="button"
                                class="plain inline-control icon fa-solid fa-question-circle"
                                data-action="toggleIdentified"
                                data-tooltip
                                aria-label={_loc("PF2E.identification.Identify")}
                            ></button>
                        {/if}
                    {/if}
                    {#if user.isGM || item.isIdentified}
                        <button
                            type="button"
                            class="plain inline-control icon fa-solid fa-edit"
                            data-action="editItem"
                            data-tooltip
                            aria-label={_loc("PF2E.EditItemTitle")}
                        ></button>
                    {/if}
                    {#if isOwner}
                        <button
                            type="button"
                            class="plain inline-control icon fa-solid fa-trash"
                            data-action="deleteItem"
                            data-tooltip
                            aria-label={_loc("PF2E.DeleteItemTitle")}
                        ></button>
                    {/if}
                </div>
            {/if}
            <ItemSummary uuid={item.uuid} open={!!openStates[item.uuid]} />

            {#if item.capacity}
                <div class="container-metadata" data-item-id={item.id} data-is-container>
                    <div class="capacity" class:over-limit={item.capacity.value.value > item.capacity.max.value}>
                        <span class="bar" style={`width:${item.capacity.percentFull}%`}></span>
                        <span class="label">{_loc("PF2E.CapacityBarLabel")}: {item.capacity.value} / {item.capacity.max}</span>
                    </div>
                </div>
            {/if}
        </div>

        {#if item.subitems.length}
            <ul class="items subitems">
                {#each item.subitems as subitem (subitem.uuid)}
                    {@render itemLine({ item: subitem, isSubitem: true, showPrice: false, showUnitBulkPrice })}
                {/each}
            </ul>
        {/if}

        {#if item.containedItems && !item.isCollapsed}
            <ul class="items container-contents" data-item-list data-container-id={item.id}>
                {#each item.containedItems as containedItem (containedItem.uuid)}
                    {@render itemLine({ item: containedItem, showPrice: false, showUnitBulkPrice })}
                {/each}
            </ul>
        {/if}
    </li>
{/snippet}

<style lang="scss">
    @use "src/styles/mixins/_index.scss" as mixins;

    .inventory-list {
        --border-color: var(--secondary-background);

        display: flex;
        flex-direction: column;
        align-items: stretch;
        overflow: hidden auto;
        margin: 0;
        padding: 0 0.15rem 8px 0;
        scrollbar-gutter: stable;
        flex: 1;

        /* General list and flex styles */
        ul.items,
        li {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            padding: 0;
            margin: 0;
        }

        /* Alignment of columns in header and rows */
        header.section-header,
        ul.items > li > .data {
            display: flex;
            justify-content: flex-start;

            .title,
            .item-name {
                align-items: center;
                display: flex;
                flex: 2;
                font-weight: 500;
                gap: var(--spacer-4);
                padding-right: var(--spacer-4);
            }

            .price,
            .quantity,
            .bulk {
                align-items: center;
                display: flex;
                justify-content: center;
            }

            .price {
                flex-basis: 4rem;
            }

            .quantity {
                flex-basis: 4.25rem;
            }

            .bulk {
                flex-basis: 3rem;
            }

            .item-controls {
                align-items: center;
                display: flex;
                justify-content: end;
                flex-basis: 3.75rem;
            }
        }

        /* Section Header Visual style */
        header.section-header {
            align-items: baseline;
            border-bottom: 1px solid var(--color-border);
            margin-top: var(--spacer-16);
            margin-bottom: var(--spacer-4);
            text-rendering: optimizeLegibility;
            > span:not(.title) {
                font-size: var(--font-size-10);
                text-transform: uppercase;
                letter-spacing: 0.05em;
                white-space: nowrap;
                overflow: hidden;
            }

            .title {
                font-size: 1.125em;
            }
        }

        /** Item row visual style */
        ul.items > li {
            background-color: var(--table-row-color-odd);
            &:nth-of-type(even) {
                background-color: var(--table-row-color-even);
            }

            &.hidden-item {
                background-color: var(--visibility-gm-bg);
                outline: 1px dotted rgba(75, 74, 68, 0.5);
                opacity: 0.9;
            }

            .data {
                flex-wrap: wrap;
                font-size: var(--font-size-13);
                .item-name {
                    --image-size: 1.5rem;
                }
                .quantity,
                .price {
                    .decrease,
                    .increase {
                        --button-size: auto;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-family: var(--sans-serif-monospace);
                        height: 100%;
                        text-align: center;
                        width: 1.125rem;
                    }
                }
                .item-controls > button {
                    --button-size: 1.125rem;
                    font-size: var(--font-size-13);
                    padding: 0;
                }
            }

            :global {
                &.drag-preview {
                    box-shadow: 0 0 6px inset var(--color-shadow-highlight);
                }

                /* The gap left by an item being dragged to a new position */
                &.drag-gap {
                    visibility: hidden;
                }

                .item-summary {
                    flex: 100%;
                }
            }

            .container-metadata {
                flex-basis: 100%;

                .capacity {
                    background-color: rgba(black, 0.75);
                    box-shadow: inset 0 0 4px black;
                    color: var(--color-text-light-0);
                    display: flex;
                    position: relative;
                    width: 100%;

                    .bar {
                        background-color: var(--color-pf-bulk-normal);
                        border-radius: 0 2px 2px 0;
                        box-shadow:
                            inset 0 0 0 1px rgba(black, 0.5),
                            inset 0 0 0 2px rgba(white, 0.1);
                        padding: var(--space-8) 0;
                    }

                    .label {
                        height: 100%;
                        left: 0;
                        padding: var(--space-2);
                        position: absolute;
                        top: 0;
                    }

                    &.over-limit .container-capacity-bar {
                        background-color: var(--color-pf-bulk-exceeded);
                    }
                }
            }

            ul.container-contents,
            ul.subitems {
                border-left: none;
                border-right: none;
                padding-left: var(--space-10);
            }
        }
    }
</style>
