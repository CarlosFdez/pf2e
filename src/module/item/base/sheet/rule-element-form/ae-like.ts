import { isBracketedValue } from "@module/rules/helpers.ts";
import { AELikeRuleElement, AELikeSource } from "@module/rules/rule-element/ae-like.ts";
import * as R from "remeda";
import { RuleElementForm, RuleElementFormSheetData } from "./base.ts";

class AELikeForm extends RuleElementForm<AELikeSource, AELikeRuleElement> {
    override template = "systems/pf2e/templates/items/rules/ae-like.hbs";

    /** Whether the merge property is valid for the current data */
    get canMerge(): boolean {
        return this.rule.mode === "override" && R.isObject(this.rule.value) && !isBracketedValue(this.rule.value);
    }

    override async getData(): Promise<AELikeFormData> {
        return {
            ...(await super.getData()),
            canMerge: this.canMerge,
        };
    }

    override updateObject(source: AELikeSource & Record<string, unknown>): void {
        if (!this.canMerge) {
            delete source.merge;
        }

        return super.updateObject(source);
    }
}

interface AELikeFormData extends RuleElementFormSheetData<AELikeSource, AELikeRuleElement> {
    canMerge: boolean;
}

export { AELikeForm };
