<script lang="ts">
    import type { LootSheetRenderContext } from "./sheet.ts";
    import Coinage from "@module/sheet/components/coinage.svelte";
    import ProseMirror from "@module/sheet/components/prose-mirror.svelte";
    import Inventory from "@module/sheet/components/inventory.svelte";

    const { document: actor, user, state: data }: LootSheetRenderContext = $props();
    const { system, isEditable, currency, hasActiveParty, isLoot, inventory } = $derived(data);
    let queryText = $state("");
</script>

<section class="loot-sheet-content" data-tooltip-class="pf2e">
    <!-- SIDEBAR -->
    <section class="sidebar">
        <div class="actor-image">
            <img
                class="actor-image"
                src={data.img}
                alt={data.name}
                data-action={isEditable ? "editImage" : null}
                data-edit="img"
            />
        </div>

        {#if user.isGM && isLoot}
            <div class="gm-settings">
                <div class="loot-distribution" data-sidebar-buttons>
                    <button type="button" data-action="splitCoins">
                        <i class="fa-solid fa-coins"></i>
                        {_loc("PF2E.loot.SplitCoinsLabel")}
                    </button>
                    <button type="button" data-action="lootNPCs">
                        <i class="fa-solid fa-backpack"></i>
                        {_loc("PF2E.loot.LootNPCsLabel")}
                    </button>
                    <button type="button" data-action="sendToPartyStash" disabled={!hasActiveParty}>
                        <i class="fa-solid fa-users-viewfinder"></i>
                        {_loc("PF2E.loot.SendToPartyStash")}
                    </button>
                </div>
                <div class="hidden-when-empty">
                    <label for="{data.uuid}-hidden-when-empty">
                        <span>{_loc("PF2E.Actor.Loot.HiddenWhenEmpty.Label")}</span>
                        <span data-tooltip aria-label={_loc("PF2E.Actor.Loot.HiddenWhenEmpty.Hint")}>
                            <i class="fa-solid fa-circle-info" inert></i>
                        </span>
                    </label>
                    <input
                        type="checkbox"
                        id="{data.uuid}-hidden-when-empty"
                        name="system.hiddenWhenEmpty"
                        checked={system.hiddenWhenEmpty}
                    />
                </div>
            </div>
        {/if}

        <div class="description">
            <ProseMirror
                name="system.details.description"
                enriched={data.enrichedContent.description}
                value={system.details.description}
                toggled={true}
                compact={true}
            />
        </div>
    </section>

    <section class="content">
        <!-- HEADER -->
        <div class="sheet-header">
            <input class="charname" name="name" value={data.name} placeholder={_loc("PF2E.loot.LootNamePlaceholder")} />
            <section class="sheet-type">
                <i
                    class="fa-solid fa-circle-info"
                    data-tooltip={`${_loc("PF2E.loot.LootLabel")}}: ${_loc("PF2E.loot.LootDescription")}</div><div>${_loc("PF2E.loot.MerchantLabel")}: ${_loc("PF2E.loot.MerchantDescription")}</div>`}
                    data-tooltip-direction="LEFT"
                ></i>
                <select name="system.lootSheetType" value={system.lootSheetType}>
                    <option value="Loot">{_loc("PF2E.loot.LootLabel")}</option>
                    <option value="Merchant">{_loc("PF2E.loot.MerchantLabel")}</option>
                </select>
                <!-- {{formInput systemFields.lootSheetType classes="type" value=data.lootSheetType options=lootSheetTypeOptions}} -->
            </section>
        </div>

        <!-- BODY -->
        <section class="sheet-body content sheet-content-loot inventory">
            {#if data.isOwner || isLoot}
                <Coinage {currency} {isEditable} />
            {/if}
            <header class="inventory-header">
                <div class="search">
                    <input type="search" spellcheck="false" bind:value={queryText} placeholder={_loc("PF2E.Actor.Inventory.Search")} />
                </div>
            </header>
            <Inventory {user} {actor} {inventory} {isEditable} isOwner={data.isOwner} {queryText} />
            <div class="total-bulk">
                <img src="icons/containers/bags/pack-leather-white-tan.webp" alt="bag" />
                <span>{_loc("PF2E.Actor.Inventory.TotalBulk", { bulk: inventory.bulk.value })}</span>
            </div>
        </section>
    </section>
</section>

<style lang="scss">
    @use "src/styles/mixins/_index.scss" as mixins;

    .loot-sheet-content {
        display: flex;
        flex-direction: row;
        height: 100%;
    }

    section.sidebar {
        display: flex;
        flex-direction: column;
        width: 13rem;
        height: 100%;
        border-right: 1px solid var(--color-border);
        box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.2);

        > * {
            flex: 0;
        }

        .actor-image {
            display: flex;
            img {
                border: none;
                border-bottom: 1px solid var(--color-border);
                flex: none;
                width: 100%;
                object-fit: cover;
                object-position: top center;
                max-height: 26rem;
                &[data-action] {
                    cursor: pointer;
                }
            }
        }

        .gm-settings {
            border-bottom: 1px solid var(--color-border);
            display: flex;
            flex-direction: column;
            padding: 0.25rem;

            .loot-distribution {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            label {
                font-weight: 500;
            }
        }

        .sidebar-meta {
            border-top: 1px solid var(--color-text-light-7);
        }

        .hidden-when-empty {
            margin: 3px 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .bulk {
            line-height: 1.5em;
            margin-right: 0.5rem;
        }

        .description {
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-height: 2.5rem;
            flex: 1;

            :global .prosemirror {
                flex: 1;
                .editor-content {
                    padding: var(--space-4);
                }
                .prosemirror.active .editor-content {
                    padding-top: 0;
                }
                menu {
                    border-radius: 0;
                }
            }
        }
    }

    .sheet-header {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.2rem;

        padding: var(--space-4) var(--space-8) 0 var(--space-8);
        border-bottom: 1px solid var(--color-text-light-7);
        box-shadow: 0 0 var(--space-8) rgba(0, 0, 0, 0.2);

        input.charname {
            margin: 0;
            border: none;
            flex: 1;
            height: 40px;
            width: 100%;
            margin: 2px;
            border: none;

            font-family: var(--serif-condensed);
            font-size: var(--font-size-36);
            font-weight: 700;
        }

        .sheet-type {
            display: flex;
            align-items: center;
            padding-left: var(--space-8);
            gap: var(--space-4);
            font-size: var(--font-size-20);

            i {
                font-size: var(--font-size-16);
            }
        }
    }

    .sheet-body {
        padding: 0.5rem;
    }

    section.content {
        display: flex;
        flex-direction: column;
        flex: 1;
        height: 100%;

        :global(.inventory) {
            overflow: hidden;
        }

        .total-bulk {
            margin-bottom: 0;
        }
    }

    .total-bulk {
        align-items: center;
        background-color: var(--color-pf-inventory-header-bg);
        color: var(--color-pf-inventory-header-text);
        display: flex;
        border-radius: 0;
        font-weight: 500;
        gap: var(--space-4);
        height: 1.5rem;
        justify-content: start;
        margin-bottom: var(--space-11);
        margin-top: var(--space-6);
        padding: var(--space-4) 0;

        img {
            --inset-shadow-length: 0.25rem;
            border: none;
            border-radius: 2px;
            box-shadow:
                0 0 0 1px var(--tertiary),
                0 0 0 2px #9f725b,
                inset 0 0 var(--inset-shadow-length) rgba(black, 0.5);
            height: 1.5rem;
            width: 1.5rem;
            z-index: 1;
        }
    }
</style>
