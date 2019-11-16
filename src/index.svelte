<script>
  export let name = "";

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
  <h1>hello {capitalize(name)}!</h1>
  <slot />
</main>
