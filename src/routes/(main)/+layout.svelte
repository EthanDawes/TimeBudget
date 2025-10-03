<script>
  const { children } = $props()
</script>

<div class="min-h-dvh bg-gray-50 p-4">
  <div class="mx-auto max-w-4xl">
    {@render children?.()}
  </div>
</div>
