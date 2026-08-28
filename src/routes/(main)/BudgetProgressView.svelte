<script lang="ts">
  import type { Snippet } from "svelte"
  import { resolve } from "$app/paths"
  import { exportSpentTime } from "$lib/db"
  import { fmtDuration } from "$lib/time"
  import LabeledProgress from "./LabeledProgress.svelte"
  import type {
    CategoryProgressItem,
    SubcategoryProgressItem,
    UnallocatedProgressItem,
  } from "$lib/budgetCalculations"

  interface BudgetProgressViewProps {
    categories: CategoryProgressItem[]
    unallocated?: UnallocatedProgressItem
    hideEmpty?: boolean
    zoomOut?: boolean
    isMultiBar?: boolean

    // Container and Style functions
    getCategoryClass?: (cat: CategoryProgressItem) => string
    getCategoryHeaderClass?: (cat: CategoryProgressItem) => string
    getCategoryHeaderTitleClass?: (cat: CategoryProgressItem) => string
    getSubcategoryContainerClass?: (
      sub: SubcategoryProgressItem,
      cat: CategoryProgressItem,
    ) => string
    getSubcategoryProgressStyle?: (
      sub: SubcategoryProgressItem,
      cat: CategoryProgressItem,
    ) => string
    getUnallocatedContainerClass?: () => string
    getUnallocatedProgressStyle?: () => string
    getUnallocatedTitleClass?: () => string

    // Event callbacks
    onCategoryClick?: (cat: CategoryProgressItem) => void
    onSubcategoryClick?: (sub: SubcategoryProgressItem, cat: CategoryProgressItem) => void
    onSubcategoryContextMenu?: (
      sub: SubcategoryProgressItem,
      cat: CategoryProgressItem,
      ev: MouseEvent,
    ) => void
    onUnallocatedClick?: () => void

    // Snippets for customization
    top?: Snippet<[]>
    categoryHeader?: Snippet<[CategoryProgressItem]>
    subcategoryPrefix?: Snippet<[SubcategoryProgressItem, CategoryProgressItem]>
    subcategoryContent?: Snippet<[SubcategoryProgressItem, CategoryProgressItem]>
    unallocatedPrefix?: Snippet<[]>
    unallocatedContent?: Snippet<[UnallocatedProgressItem]>
    footerExtras?: Snippet<[]>
    footer?: Snippet<[]>
  }

  let {
    categories,
    unallocated,
    hideEmpty = false,
    zoomOut = false,
    isMultiBar = true,
    getCategoryClass,
    getCategoryHeaderClass,
    getCategoryHeaderTitleClass,
    getSubcategoryContainerClass,
    getSubcategoryProgressStyle,
    getUnallocatedContainerClass,
    getUnallocatedProgressStyle,
    getUnallocatedTitleClass,
    onCategoryClick,
    onSubcategoryClick,
    onSubcategoryContextMenu,
    onUnallocatedClick,
    top,
    categoryHeader,
    subcategoryPrefix,
    subcategoryContent,
    unallocatedPrefix,
    unallocatedContent,
    footerExtras,
    footer,
  }: BudgetProgressViewProps = $props()
</script>

{#if top}
  {@render top()}
{/if}

<div class="flex flex-col gap-5" class:scale-50={zoomOut}>
  {#if zoomOut}
    <h2 class="h-0 text-center text-xl font-bold">
      {new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "numeric",
        day: "numeric",
      }).format(new Date())}
    </h2>
  {/if}

  {#each categories as cat (cat.name)}
    <div class="block {getCategoryClass?.(cat) ?? ''}">
      {#if categoryHeader}
        {@render categoryHeader(cat)}
      {:else}
        {@const headerClass = getCategoryHeaderClass?.(cat) ?? ""}
        {@const titleClass = getCategoryHeaderTitleClass?.(cat) ?? ""}
        <div
          class="px-3 py-1 {headerClass}"
          role={onCategoryClick ? "button" : undefined}
          onclick={onCategoryClick ? () => onCategoryClick(cat) : undefined}
        >
          <h2 class="flex justify-between text-xl font-bold {titleClass}">
            <span>{cat.name}</span>
            {#if cat.unallocatedSpillover > 0}
              <span>{fmtDuration(cat.unallocatedSpillover)}</span>
            {/if}
          </h2>
        </div>
      {/if}

      {#each cat.subcategories as sub (sub.name)}
        {#if !hideEmpty || sub.budget > 0 || sub.totalSpent > 0}
          <div class={getSubcategoryContainerClass?.(sub, cat) ?? ""}>
            <LabeledProgress
              spent={sub.totalSpent}
              overlayStart={sub.overlayStart}
              budget={sub.budget}
              totalCategorySpillover={isMultiBar ? cat.totalCategorySpillover : undefined}
              categorySpilloverForThis={isMultiBar ? sub.categorySpilloverForThis : undefined}
              remainingCategorySpillover={isMultiBar ? sub.remainingCategorySpillover : undefined}
              remainingUnallocated={isMultiBar ? sub.remainingUnallocated : undefined}
              style={getSubcategoryProgressStyle?.(sub, cat) ??
                (sub.budget - sub.totalSpent > 0 ? "cursor-pointer" : "opacity-50 pointer-events-none")}
              onclick={onSubcategoryClick ? () => onSubcategoryClick(sub, cat) : undefined}
              oncontextmenu={onSubcategoryContextMenu
                ? (ev) => {
                    ev.preventDefault()
                    onSubcategoryContextMenu(sub, cat, ev)
                  }
                : undefined}
            >
              {#if subcategoryContent}
                {@render subcategoryContent(sub, cat)}
              {:else}
                {#if subcategoryPrefix}
                  {@render subcategoryPrefix(sub, cat)}
                {/if}
                {sub.name}
              {/if}
            </LabeledProgress>
          </div>
        {/if}
      {/each}
    </div>
  {/each}

  {#if unallocated}
    <div class={getUnallocatedContainerClass?.() ?? ""}>
      <LabeledProgress
        spent={unallocated.spent}
        overlayStart={unallocated.overlayStart}
        budget={unallocated.budget}
        style={getUnallocatedProgressStyle?.() ?? ""}
        onclick={onUnallocatedClick}
      >
        {#if unallocatedContent}
          {@render unallocatedContent(unallocated)}
        {:else}
          <h2 class="font-bold {getUnallocatedTitleClass?.() ?? ''}">
            {#if unallocatedPrefix}
              {@render unallocatedPrefix()}
            {/if}
            Unallocated time
          </h2>
        {/if}
      </LabeledProgress>
    </div>
  {/if}
</div>

{#if footer}
  {@render footer()}
{:else}
  <div class="text-center">
    {@render footerExtras?.()}
    <a href={resolve("/day")}>
      <button class="border">Day history</button>
    </a>
    <a href={resolve("/week")}>
      <button class="border">Week history</button>
    </a>
    <a href={resolve("/settings")}>
      <button class="border">Settings</button>
    </a>
    <button class="border" onclick={exportSpentTime}>Export</button>
  </div>
{/if}
