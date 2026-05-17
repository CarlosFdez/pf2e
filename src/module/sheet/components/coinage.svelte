<script lang="ts">
    import type { CurrencySummary } from "@actor/sheet/data-types.ts";

    interface CoinageProps {
        isEditable?: boolean;
        currency: CurrencySummary;
        canDistribute?: boolean;
    }

    const { isEditable, currency, canDistribute }: CoinageProps = $props();
</script>

<div class="coinage">
    <div class="currency">
        <div class="label">{_loc("PF2E.CurrencyLabel")}</div>
        {#each Object.entries(currency.units) as [denomination, value]}
            <div class="denomination { denomination }">
                <div class="currency-image" data-tooltip={_loc(value.label)}></div>
                <span>{value.value}</span>
            </div>
        {/each}
        {#if isEditable}
            <button
                type="button"
                class="icon fa-solid fa-plus"
                data-action="addCurrency"
                data-tooltip aria-label={_loc("PF2E.AddCoinsTitle")}
            ></button>
            <button
                type="button"
                class="icon fa-solid fa-minus"
                data-action="removeCurrency"
                data-tooltip aria-label={_loc("PF2E.RemoveCoinsTitle")}
            ></button>
            {#if canDistribute}
                <button
                    type="button"
                    class="icon fa-solid fa-share-all"
                    data-action="distributeCurrency"
                    data-tooltip aria-label={_loc("PF2E.Actor.Inventory.DistributeCoins")}
                    disabled={!canDistribute}
                ></button>
            {/if}
        {/if}
    </div>
    <div class="wealth">
        <h3 class="item-name">
            <i class="fa-solid fa-coins fa-fw"></i>
            {_loc("PF2E.TotalCurrency")}
            <span>{currency.totalCurrency}</span>
        </h3>
        <h3 class="item-name">
            <i class="fa-solid fa-scale-unbalanced fa-fw"></i>
            {_loc("PF2E.TotalWealth")}
            <span>{currency.totalWealth}</span>
        </h3>
    </div>
</div>

<style lang="scss">
    .currency {
        align-items: center;
        background-color: var(--sub);
        box-shadow:
            inset 0 0 0 1px rgb(0, 0, 0, 0.3),
            inset 0 0 0 2px rgb(255, 255, 255, 0.2);
        display: flex;
        font-size: var(--font-size-13);
        list-style: none;
        margin: 0;
        padding: 3px;

        .label {
            color: var(--color-text-light-0);
            font-weight: 500;
            margin: 0 0.5rem 0 0.25rem;
        }

        .denomination {
            align-items: center;
            background-color: transparent;
            border-left: 1px solid rgb(0, 0, 0, 0.2);
            border-right: 1px solid rgb(255, 255, 255, 0.1);
            color: var(--color-text-light-0);
            display: flex;
            flex-wrap: nowrap;
            flex: 0 1 auto;
            justify-content: start;
            text-shadow: 0 0 3px rgb(0, 0, 0, 0.75);
            width: 100%;

            &:first-child {
                border-left: none;
            }

            &:last-child {
                border-right: none;
                margin-right: 8px;
            }

            span {
                padding-left: 8px;
                padding-right: 12px;
            }

            &.pp {
                .currency-image {
                    background: url("/icons/equipment/treasure/currency/platinum-pieces.webp") no-repeat;
                }
            }
            &.gp {
                .currency-image {
                    background: url("/icons/equipment/treasure/currency/gold-pieces.webp") no-repeat;
                }
            }
            &.sp {
                .currency-image {
                    background: url("/icons/equipment/treasure/currency/silver-pieces.webp") no-repeat;
                }
            }
            &.cp {
                .currency-image {
                    background: url("/icons/equipment/treasure/currency/copper-pieces.webp") no-repeat;
                }
            }

            .currency-image {
                box-shadow:
                    0 0 0 1px #9f725b,
                    0 0 0 2px var(--tertiary),
                    0 0 0 3px #956d58;
                height: 1.5rem;
                width: 1.5rem;
                background-size: cover !important;
            }
        }

        button {
            display: flex;
            justify-content: center;
            align-items: center;

            margin: 0;
            padding: 0;

            background-color: var(--tertiary);
            border-radius: 1px;
            border: none;
            box-shadow:
                0 0 0 1px rgb(0, 0, 0, 0.25),
                inset 0 0 0 1px rgb(255, 255, 255, 0.25),
                0 0 3px rgb(0, 0, 0, 0.5);
            color: rgb(0, 0, 0, 0.75);
            font-size: var(--font-size-13);
            font-weight: 600;
            height: 1.5rem;
            line-height: 1;
            margin-left: 2px;
            width: 1.875rem;

            &:disabled {
                opacity: 0.6;
            }

            &:hover:not(:disabled) {
                background-color: var(--primary);
                color: var(--color-text-light-0);
                cursor: pointer;
            }
        }
    }

    .wealth {
        font-family: var(--sans-serif);
        font-size: var(--font-size-10);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        text-rendering: optimizeLegibility;

        align-items: center;
        background-color: var(--alt);
        display: flex;
        margin-bottom: 0.5rem;
        min-height: 1.5rem;
        justify-content: flex-end;
        padding: 0 0.25rem;

        h3 {
            font-size: var(--font-size-13);
            text-transform: capitalize;
            text-shadow: 0 0 2px rgb(0, 0, 0, 0.75);
            margin: 2px;
            margin-left: 0.25rem;
            cursor: default;
            &:hover {
                color: var(--color-text-light-0);
            }
        }

        h3.item-name {
            flex-grow: 1;
            color: var(--color-text-light-0);
            margin-bottom: 0;
            font-weight: bold;

            span {
                margin-left: 0.25rem;
                font-weight: normal;
                text-transform: uppercase;
            }
        }
    }
</style>
