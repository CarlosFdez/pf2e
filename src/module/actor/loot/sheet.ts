import type { ActorPF2e, ActorType, LootPF2e } from "@actor";
import { ActorSizePF2e } from "@actor/data/size.ts";
import { transferItemsBetweenActors } from "@actor/helpers.ts";
import { InventoryBulk } from "@actor/inventory/bulk.ts";
import type { CurrencySummary } from "@actor/sheet/data-types.ts";
import { createBulkPerLabel, onClickCreateSpell } from "@actor/sheet/helpers.ts";
import { DistributeCoinsDialog } from "@actor/sheet/popups/distribute-coins-dialog.ts";
import { IdentifyItemPopup } from "@actor/sheet/popups/identify-popup.ts";
import { ItemTransferDialog } from "@actor/sheet/popups/item-transfer-dialog.ts";
import { LootNPCsPopup } from "@actor/sheet/popups/loot-npcs-popup.ts";
import { UpdateCurrencyDialog } from "@actor/sheet/popups/update-currency-dialog.ts";
import { DocumentSheetRenderContext } from "@client/applications/api/document-sheet.mjs";
import { ImageFilePath } from "@common/constants.mjs";
import { ItemUUID } from "@common/documents/_module.mjs";
import { ItemPF2e, PhysicalItemPF2e } from "@item";
import { ItemSourcePF2e } from "@item/base/data/index.ts";
import { Bulk, Coins, transferCredits } from "@item/physical/index.ts";
import { COIN_DENOMINATIONS, PHYSICAL_ITEM_TYPES } from "@item/physical/values.ts";
import { Rarity, ValueAndMax } from "@module/data.ts";
import { SvelteApplicationMixin, SvelteApplicationRenderContext } from "@module/sheet/mixin.svelte.ts";
import { UserPF2e } from "@module/user/index.ts";
import { TextEditorPF2e } from "@system/text-editor.ts";
import { ErrorPF2e, htmlClosest, objectHasKey, setHasElement } from "@util";
import * as R from "remeda";
import Root from "./sheet.svelte";

export class LootSheetPF2e extends SvelteApplicationMixin(fa.sheets.ActorSheetV2<LootPF2e, ItemPF2e>) {
    static override DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration> = {
        position: {
            width: 700,
            height: 680,
        },
        window: {
            icon: "fa-solid fa-treasure-chest",
            resizable: true,
            contentClasses: ["compact"],
        },
        classes: ["actor", "loot"],
        form: {
            submitOnChange: true,
        },
        actions: {
            sendItemToChat: LootSheetPF2e.#onSendItemToChat,
            addCurrency: LootSheetPF2e.#onAddCurrency,
            removeCurrency: LootSheetPF2e.#onRemoveCurrency,
            splitCoins: LootSheetPF2e.#onSplitCoins,
            lootNPCs: LootSheetPF2e.#onLootNPCs,
            sendToPartyStash: LootSheetPF2e.#onSendToPartyStash,
            repairItem: LootSheetPF2e.#onRepairItem,
            toggleIdentified: LootSheetPF2e.#onToggleIdentified,
            decreaseQuantity: LootSheetPF2e.#onDecreaseQuantity,
            increaseQuantity: LootSheetPF2e.#onIncreaseQuantity,
            createItem: LootSheetPF2e.#onCreateItem,
            browseEquipment: LootSheetPF2e.#onBrowseEquipment,
            editItem: LootSheetPF2e.#onEditItem,
            deleteItem: LootSheetPF2e.#onDeleteItem,
        },
    };

    override root = Root;

    protected override async _prepareContext(options: fa.ApplicationRenderOptions): Promise<LootSheetRenderContext> {
        // todo: fix type
        const context = (await super._prepareContext(options)) as unknown as fa.api.DocumentSheetRenderContext;

        const actor = this.actor;
        const isLoot = actor.system.lootSheetType === "Loot";
        const rollData = actor.getRollData();
        const description = actor.system.details.description;

        return {
            ...context,
            document: actor,
            user: game.user,
            state: {
                ...R.pick(actor, ["id", "img", "name", "uuid"]),
                system: fu.deepClone(actor.system),
                isEditable: this.isEditable,
                isOwner: actor.isOwner,
                enrichedContent: {
                    description: await TextEditorPF2e.enrichHTML(description, { rollData }),
                },
                currency: this.#prepareCurrency(),
                inventory: this.prepareInventory(),
                hasActiveParty: !!game.actors.party,
                isLoot,
            },
        };
    }

    protected prepareInventory(): SheetInventorySvelte {
        const actor = this.actor;
        const sections: SheetInventorySvelte["sections"] = [
            {
                label: _loc("PF2E.Actor.Inventory.Section.WeaponsAndShields"),
                types: ["weapon", "shield"],
                items: [],
            },
            { label: _loc("TYPES.Item.armor"), types: ["armor"], items: [] },
            { label: _loc("TYPES.Item.equipment"), types: ["equipment"], items: [] },
            {
                label: _loc("PF2E.Item.Consumable.Plural"),
                types: ["consumable"],
                items: [],
            },
            { label: _loc("TYPES.Item.ammo"), types: ["ammo"], items: [] },
            { label: _loc("TYPES.Item.treasure"), types: ["treasure"], items: [] },
            { label: _loc("PF2E.Item.Container.Plural"), types: ["backpack"], items: [] },
        ];

        for (const item of actor.inventory.contents.sort((a, b) => (a.sort || 0) - (b.sort || 0))) {
            if (item.isInContainer) continue;
            const section = sections.find((s) => s.types.includes(item.type));
            section?.items.push(this.prepareInventoryItem(item));
        }

        const data: SheetInventorySvelte = {
            actorType: actor.type as ActorType,
            sections,
            bulk: actor.inventory.bulk,
            displayType: actor.isMerchant ? "merchant" : "loot",
        };

        // Hide empty sections for non-owners
        // Loot actor only
        if (!this.actor.isOwner) {
            data.sections = data.sections.filter((s) => s.items.length && s.items.some((i) => !i.hidden));
        }

        return data;
    }

    protected prepareInventoryItem(item: PhysicalItemPF2e): InventoryItemSvelte {
        const actor = this.actor;
        const isMerchant = this.actor.system.lootSheetType === "Merchant";

        const actorSize = new ActorSizePF2e({ value: actor.size });
        const itemSize = new ActorSizePF2e({ value: item.size });
        const sizeDifference = itemSize.difference(actorSize, { smallIsMedium: true });
        const isCurrency = item.isOfType("treasure") && item.isCurrency;
        const priceUnit = (isCurrency ? item.unit : null) ?? "primary";
        const uses = item.isOfType("consumable") ? item.uses : null;
        const showUses = uses && item.isOfType("consumable") && (uses.max > 1 || item.system.category === "wand");

        return {
            ...R.pick(item, ["id", "type", "img", "name", "uuid", "sort", "quantity", "isIdentified", "rarity"]),
            isEditable: game.user.isGM || (this.isEditable && item.isIdentified),
            isCollapsed: item.isOfType("backpack") ? item.isCollapsed : false,
            realName: game.user.isGM && !item.isIdentified ? item.system.identification.identified.name : null,
            uses: showUses ? uses : null,
            isDamaged: item.isDamaged,
            isTemporary: item.isTemporary,
            itemSize: sizeDifference !== 0 ? itemSize : null,
            price: {
                unit: item.price.value.toString({ short: true, unit: priceUnit }),
                asset: item.assetValue.toString({ short: true, unit: priceUnit }),
            },
            bulk: {
                unit: createBulkPerLabel(item),
                asset: item.bulk.toString(),
            },
            isCredstick: item.isOfType("treasure") && item.system.category === "credstick",
            hidden: isMerchant && item.isOfType("treasure") && item.isCoinage && !item.container,
            canEditQuantity:
                item.isOwner &&
                !(item.isOfType("backpack") && item.contents.size > 0) &&
                !(item.isOfType("treasure") && item.system.category === "credstick"),
            capacity: item.isOfType("backpack") ? { ...item.capacity, percentFull: item.percentFull } : null,
            // Sort subitems to get a certain logical order
            // 0 = usable weapons, 1 = upgrades, 2 = temp attachables, 3 = ammo
            subitems: R.sortBy(item.subitems.contents, (i) => {
                const isAmmo =
                    i.isOfType("ammo") || (i.isOfType("weapon") && item.isOfType("weapon") && i.isAmmoFor(item));
                const isEquipment = i.system.usage.type === "installed";
                return isAmmo ? 3 : i.isOfType("weapon") ? 0 : isEquipment ? 1 : 2;
            }).map((i) => this.prepareInventoryItem(i)),
            containedItems: item.isOfType("backpack")
                ? R.sortBy(item.contents.contents, (i) => i.sort).map((i) => this.prepareInventoryItem(i))
                : null,
            // hasCharges:
            //     (item.isOfType("consumable") && item.system.uses.max > 0) ||
            //     (item.isOfType("ammo") && item.system.uses.max > 1),
            // isSellable: editable && item.isOfType("treasure") && !item.isCurrency,
        };
    }

    #prepareCurrency(): CurrencySummary {
        const actor = this.actor;
        const totalWealth = actor.inventory.totalWealth;
        const currency = actor.inventory.currency;
        const coins = new Coins(R.pick(currency, COIN_DENOMINATIONS)); // just the pf2e values

        // Figure out what coins to show for what systems. If both, simplify pf2e values to gold
        const showPF2e = SYSTEM_ID === "pf2e" || COIN_DENOMINATIONS.some((d) => currency[d] > 0);
        const showSF2e = SYSTEM_ID === "sf2e" || currency.credits || currency.upb;
        const denominations =
            showPF2e && showSF2e
                ? (["gp", "credits", "upb"] as const)
                : showPF2e
                  ? COIN_DENOMINATIONS
                  : (["credits", "upb"] as const);
        if (showPF2e && showSF2e) {
            currency.gp = coins.goldValue;
            coins.sp = coins.pp = coins.cp = 0;
        }

        return {
            units: denominations.reduce(
                (accumulated, d) => ({
                    ...accumulated,
                    [d]: { value: currency[d], label: CONFIG.PF2E.currencies[d] },
                }),
                {} as CurrencySummary["units"],
            ),
            totalCurrency: coins.plus({ sp: currency.credits + currency.upb }).toString({ decimal: true }),
            totalWealth: totalWealth.toString({ decimal: true }),
        };
    }

    override async _onDropItem(event: DragEvent, item: ItemPF2e): Promise<ItemPF2e | null> {
        const targetActor = this.actor;
        if (item.actor && item.actor !== targetActor && item?.isOfType("physical")) {
            await this.moveItemBetweenActors(event, item, targetActor);
            return item;
        }

        return (await super._onDropItem(event, item)) ?? null;
    }

    /**
     * Moves an item between two actors' inventories.
     * @param event The triggering event
     * @param item The item to move between the two actors
     * @param recipient The receiving actor
     */
    async moveItemBetweenActors(event: DragEvent, item: PhysicalItemPF2e, recipient: ActorPF2e): Promise<void> {
        const sourceActor = item.actor;
        if (!sourceActor || !recipient) {
            throw ErrorPF2e("Unexpected missing actor(s)");
        }

        const containerId = htmlClosest(event.target, "[data-is-container]")?.dataset.itemId?.trim();
        const stackable = !!recipient.inventory.findStackableItem(item._source, { containerId });
        const mode = sourceActor.isOfType("loot") && sourceActor.isMerchant ? "purchase" : "move";
        if (mode === "purchase" && item.isOfType("backpack") && item.contents.size) {
            ui.notifications.error("PF2E.ErrorMessage.CantPurchaseContainerWithItems", { localize: true });
            return;
        }

        // If more than one item can be moved, show a popup to ask how many to move
        const result = await ItemTransferDialog.wait({ item, recipient, lockStack: !stackable, mode });
        if (!result) return;

        // If we're transferring all the credits, transfer the one credstick instead
        const [resultMode, quantity] =
            result.mode === "credits" && result.quantity >= item.system.price.value.credits
                ? ["move", 1]
                : [result.mode, result.quantity];
        if (resultMode === "credits") {
            transferCredits({ targetActor: recipient, item, quantity });
        } else if (result) {
            sourceActor.transferItemToActor(
                recipient,
                item as PhysicalItemPF2e<ActorPF2e>,
                quantity,
                containerId,
                result.newStack,
                result.mode === "purchase",
            );
        }
    }

    static async #onSendItemToChat(this: LootSheetPF2e, event: PointerEvent) {
        const item = await this.#getItemFromDOM(event);
        if (item.isOfType("spell")) {
            const castRank = Number(htmlClosest(event.target, "[data-cast-rank]")?.dataset.castRank ?? NaN);
            return item.toMessage(event, { data: { castRank } });
        }

        return item.toMessage(event);
    }

    static #onAddCurrency(this: LootSheetPF2e) {
        return new UpdateCurrencyDialog({ actor: this.actor, mode: "add" }).render({ force: true });
    }

    static #onRemoveCurrency(this: LootSheetPF2e) {
        return new UpdateCurrencyDialog({ actor: this.actor, mode: "remove" }).render({ force: true });
    }

    static #onSplitCoins(this: LootSheetPF2e) {
        new DistributeCoinsDialog({ actor: this.actor }).render(true);
    }

    static #onLootNPCs(this: LootSheetPF2e) {
        if (canvas.tokens.controlled.some((token) => token.actor?.id !== this.actor.id)) {
            new LootNPCsPopup(this.actor).render(true);
        } else {
            ui.notifications.warn("No tokens selected.");
        }
    }

    static #onSendToPartyStash(this: LootSheetPF2e) {
        const party = game.actors.party;
        if (party) transferItemsBetweenActors(this.actor, party);
    }

    async #getItemFromDOM(event: PointerEvent): Promise<ItemPF2e<LootPF2e>> {
        const itemUuid = htmlClosest(event.target, "[data-uuid]")?.dataset.uuid;
        const item = await fromUuid(itemUuid ?? "");
        if (!(item instanceof ItemPF2e)) {
            throw ErrorPF2e(`Failed to retrieve owned item with uuid ${itemUuid}`);
        }
        return item;
    }

    async #getInventoryItemFromDOM(event: PointerEvent): Promise<PhysicalItemPF2e<LootPF2e>> {
        const item = await this.#getItemFromDOM(event);
        if (!item?.isOfType("physical")) {
            throw ErrorPF2e(`Attempted to retrieve item, but it is not a physical item`);
        }
        return item as PhysicalItemPF2e<LootPF2e>;
    }

    static async #onRepairItem(this: LootSheetPF2e, event: PointerEvent) {
        const item = await this.#getInventoryItemFromDOM(event);
        return game.pf2e.actions.repair({ event, item });
    }

    static async #onToggleIdentified(this: LootSheetPF2e, event: PointerEvent) {
        const item = await this.#getInventoryItemFromDOM(event);
        if (item.isIdentified) {
            item.setIdentificationStatus("unidentified");
        } else {
            new IdentifyItemPopup(item).render(true);
        }
    }

    static async #onDecreaseQuantity(this: LootSheetPF2e, event: PointerEvent) {
        const item = await this.#getInventoryItemFromDOM(event);
        if (item.quantity > 0) {
            const subtrahend = Math.min(item.quantity, event.ctrlKey ? 10 : event.shiftKey ? 5 : 1);
            item.update({ "system.quantity": item.quantity - subtrahend });
        }
    }

    static async #onIncreaseQuantity(this: LootSheetPF2e, event: PointerEvent) {
        const item = await this.#getInventoryItemFromDOM(event);
        const addend = event.ctrlKey ? 10 : event.shiftKey ? 5 : 1;
        item.update({ "system.quantity": item.quantity + addend });
    }

    static async #onCreateItem(this: LootSheetPF2e, _event: PointerEvent, anchor: HTMLElement) {
        const dataset = { ...anchor.dataset };
        const itemType = [dataset.type ?? dataset.types?.split(",")]
            .flat()
            .filter(R.isTruthy)
            .find((t) => t !== "shield");
        if (!objectHasKey(CONFIG.PF2E.Item.documentClasses, itemType)) {
            throw ErrorPF2e(`Unrecognized item type: types`);
        }
        if (itemType === "spell") return onClickCreateSpell(this.actor, dataset);

        const itemSource = ((): DeepPartial<ItemSourcePF2e> | null => {
            switch (itemType) {
                case "action": {
                    const { actionType } = dataset;
                    if (!objectHasKey(CONFIG.PF2E.actionTypes, actionType)) {
                        throw ErrorPF2e(`Action type not recognized: ${actionType}`);
                    }
                    const name = _loc(`PF2E.ActionType${actionType.capitalize()}`);
                    return { type: itemType, name, system: { actionType: { value: actionType } } };
                }
                case "melee": {
                    const name = _loc(`PF2E.NewPlaceholders.${itemType.capitalize()}`);
                    return { type: itemType, name };
                }
                case "lore": {
                    const name =
                        this.actor.type === "npc" ? _loc("PF2E.SkillLabel") : _loc("PF2E.NewPlaceholders.Lore");
                    return { type: itemType, name };
                }
                default: {
                    if (!setHasElement(PHYSICAL_ITEM_TYPES, itemType)) {
                        throw ErrorPF2e(`Unsupported item type: ${itemType}`);
                    }
                    const name = _loc(`PF2E.NewPlaceholders.${itemType.capitalize()}`);
                    return { name, type: itemType };
                }
            }
        })();

        if (itemSource) {
            if (dataset.traits) {
                const traits = dataset.traits?.split(",") ?? [];
                itemSource.system = fu.mergeObject(itemSource.system ?? {}, { traits: { value: traits } });
            }

            this.actor.createEmbeddedDocuments("Item", [itemSource]);
        }
    }

    static async #onBrowseEquipment(this: LootSheetPF2e, _event: PointerEvent, element: HTMLElement) {
        const checkboxesFilterCodes = (element.dataset.filter ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter((s) => !!s);
        const levelString = element.dataset.level;
        const tab = game.pf2e.compendiumBrowser.tabs.equipment;
        const filter = await tab.getFilterData();
        const checkboxes = filter.checkboxes;

        for (const itemType of checkboxesFilterCodes) {
            const checkbox = checkboxes.itemTypes;
            if (objectHasKey(checkbox.options, itemType)) {
                checkbox.options[itemType].selected = true;
                checkbox.selected.push(itemType);
                checkbox.isExpanded = true;
            }
        }

        if (levelString) {
            const level = filter.level;
            const newValue = Math.clamp(Number(levelString), level.min, level.max);
            if (!Number.isNaN(newValue)) {
                level.from = newValue;
                level.to = newValue;
            }
            level.isExpanded = true;
        }

        tab.open({ filter });
    }

    static async #onEditItem(this: LootSheetPF2e, event: PointerEvent) {
        const item = await this.#getItemFromDOM(event);
        item.sheet.render(true);
    }

    static async #onDeleteItem(this: LootSheetPF2e, event: PointerEvent) {
        const item = await this.#getItemFromDOM(event);
        if (event?.ctrlKey || event?.shiftKey) item.delete();
        else item.deleteDialog();
    }
}

interface LootSheetRenderContext extends SvelteApplicationRenderContext, DocumentSheetRenderContext {
    user: UserPF2e;
    document: LootPF2e;
    state: LootSheetState;
}

/** State that will need to be lifted out to a base class once more svelte actor sheets are added */
interface ActorSheetState<TActor extends ActorPF2e> {
    id: string;
    name: string;
    img: ImageFilePath;
    uuid: string;
    system: TActor["system"];

    isEditable: boolean;
    isOwner: boolean;
    enrichedContent: Record<string, string>;
    currency: CurrencySummary;
    inventory: SheetInventorySvelte;
}

interface SheetItemList {
    label: string;
    types: string[];
    items: InventoryItemSvelte[];
}

/** Svelte variant of the inventory item. Rename to remove the abbreviation once everything is converted */
interface InventoryItemSvelte extends PhysicalItemBrief {
    /** Whether this specific item is editable. Even when the actor is editable, a specific item may not be */
    isEditable: boolean;
    isCollapsed: boolean; // todo: backpack props? Category? How handle all those?
    /** The real name of this item. Omitted if already identified or the user isn't a GM */
    realName: string | null;
    isDamaged: boolean;
    uses: ValueAndMax | null;
    isTemporary: boolean;
    /** Item size if it causes any weight difference relative to the actor */
    itemSize?: ActorSizePF2e | null;
    price: {
        /** The sale price label per sold minimum unit. For example, arrows are 1sp per 10 */
        unit: string;
        /** Total asset value of the entire stack of the inventory item */
        asset: string;
    };
    /** The bulk value to show on the sheet */
    bulk: {
        unit: string;
        asset: string;
    };
    /** Whether the item is hidden for non-owners */
    hidden: boolean;
    isCredstick: boolean;
    canEditQuantity: boolean;
    capacity: { value: Bulk; max: Bulk; percentFull: number } | null;
    /** All sub items currently embedded within this item */
    subitems: InventoryItemSvelte[];
    /** The items inside this container, if it is a container. Returns null if not a container */
    containedItems: InventoryItemSvelte[] | null;
}

interface SheetInventorySvelte {
    actorType: ActorType;
    sections: SheetItemList[];
    bulk: InventoryBulk; // todo: simple object
    /** Decides the presentation mode of certain elements */
    displayType: "character" | "loot" | "merchant";
}

interface PhysicalItemBrief {
    id: string;
    type: string;
    uuid: ItemUUID;
    name: string;
    img: ImageFilePath;
    sort: number;
    quantity: number;
    isIdentified: boolean;
    rarity: Rarity | null;
}

interface LootSheetState extends ActorSheetState<LootPF2e> {
    hasActiveParty: boolean;
    isLoot: boolean;
}

export type { InventoryItemSvelte, LootSheetRenderContext, SheetInventorySvelte, SheetItemList };
