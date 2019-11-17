<script>
  export let names = [];

  const capitalize = str =>
    str ? str[0].toUpperCase() + str.slice(1).toLowerCase() : "";
</script>

<style>
  main {
    background-color: gray;
    color: white;
  }
</style>

<main>
  <h1>hello!</h1>
  {#if names.length}
    <ul>
      {#each names as name}
        <li>{capitalize(name)}</li>
      {/each}
    </ul>
  {/if}
  <slot />
</main>
