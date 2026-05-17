import { Actor } from "@client/documents/_module.mjs";
import DocumentSheetV2, { type DocumentSheetConfiguration } from "../api/document-sheet.mjs";

/**
 * A base class for providing Actor Sheet behavior using ApplicationV2.
 */
export default abstract class ActorSheetV2<TDocument extends Actor, TItem extends Item> extends DocumentSheetV2<
    DocumentSheetConfiguration<TDocument>
> {
    get actor(): TDocument;

    /**
     * Handle a dropped Item on the Actor Sheet.
     * @param event The initiating drop event
     * @param item  The dropped Item document
     * @returns A Promise resolving to the dropped Item (if sorting), a newly created Item,
     *          or a nullish value in case of failure or no action being taken
     */
    protected _onDropItem(event: DragEvent, item: TItem): Promise<TItem | null | undefined>;
}
