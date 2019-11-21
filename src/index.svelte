<script>
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import cssVars from "svelte-css-vars";

  // export let navigationItems = [
  //   { text: "Find It", href: "/" },
  //   { text: "Design It", href: "/" },
  //   { text: "Make It Happen", href: "/" },
  //   { text: "Why Mattamy", href: "/" },
  //   { text: "Saved", href: "/", saved: 12 }
  // ];

  export let logo = "static/logo.png";
  $: styleVars = {
    logo: `url(${logo})`
  };

  let isLeftDrawerOpen = false;
  let isRightDrawerOpen = false;

  function toggleLeftDrawer() {
    isLeftDrawerOpen = !isLeftDrawerOpen;
  }

  function toggleRightDrawer() {
    isRightDrawerOpen = !isRightDrawerOpen;
  }

  // TODO(olivoil): 1) figure out if this is client side 2) if so, implement i18n
  let locales = ["en-US", "en-CA"];
  export let locale = locales[0];
  let isUSA = locale === "en-US";

  function toggleLocale() {
    if (locale === "en-US") {
      locale = "en-CA";
    } else {
      locale = "en-US";
    }
  }
</script>

<style>
  @import url("https://fonts.googleapis.com/css?family=Libre+Franklin&display=swap");

  .logo {
    /* background-image: url("static/logo.png"); */
    background-image: var(--logo);
  }

  .switch-off {
    left: 10%;
    transform: translateX(-10%);
    transition: all 300ms;
  }

  .switch-on {
    left: 90%;
    transform: translateX(-90%);
    transition: all 300ms;
  }
</style>

<header
  class="flex items-center justify-between bg-white p-3 fixed w-screen h-16 z-30"
  use:cssVars={styleVars}>
  <button class="w-10 h-10 text-actionblue" on:click={toggleLeftDrawer}>
    <svg viewBox="0 0 24 24" fill="none">
      <path
        fill="currentColor"
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M14.71 14h.79l4.99 5L19 20.49l-5-4.99v-.79l-.27-.28A6.471 6.471 0
        019.5 16 6.5 6.5 0 1116 9.5c0 1.61-.59 3.09-1.57 4.23l.28.27zM5 9.5C5
        11.99 7.01 14 9.5 14S14 11.99 14 9.5 11.99 5 9.5 5 5 7.01 5 9.5z" />
    </svg>
  </button>

  <!-- use background image instead of img, less accessible but works on IE11 -->
  <div class="logo w-32 h-full bg-center bg-contain bg-no-repeat" />

  <button class="w-8 h-8 text-actionblue" on:click={toggleRightDrawer}>
    <svg viewBox="0 0 24 24" fill="none">
      <path
        fill="currentColor"
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M3 8V6h18v2H3zm0 5h18v-2H3v2zm0 5h18v-2H3v2z" />
    </svg>
  </button>
</header>

{#if isLeftDrawerOpen}
  <aside
    transition:fly={{ duration: 250, x: -400, opacity: 0, easing: quintOut }}
    class="w-screen h-screen bg-white z-50 absolute top-0 flex flex-col">
    <div
      class="flex items-center justify-between w-full h-16 border-b-2
      border-gray-300 p-2">
      <h3 class="font-trade-gothic-20 text-lg text-black pl-4">
        SEARCH MATTAMY HOMES
      </h3>
      <button class="w-8 h-8 text-actionblue" on:click={toggleLeftDrawer}>
        <svg viewBox="0 0 24 24" fill="none">
          <path
            fill="currentColor"
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19
            12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
        </svg>
      </button>
    </div>

    <div class="bg-white h-full">
      <div class="px-4 py-6 h-16 flex items-center justify-end text-gray-600">
        <input
          type="search"
          name="search"
          placeholder="Enter keyword to search"
          class="bg-white h-12 w-full pl-5 pr-12 py-2 appearance-none
          leading-normal rounded-full text-sm focus:outline-none border
          border-gray-500" />

        <button type="submit" class="text-actionblue absolute h-8 w-8 mr-2">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              fill="currentColor"
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M14.71 14h.79l4.99 5L19 20.49l-5-4.99v-.79l-.27-.28A6.471 6.471
              0 019.5 16 6.5 6.5 0 1116 9.5c0 1.61-.59 3.09-1.57 4.23l.28.27zM5
              9.5C5 11.99 7.01 14 9.5 14S14 11.99 14 9.5 11.99 5 9.5 5 5 7.01 5
              9.5z" />
          </svg>
        </button>
      </div>
    </div>
  </aside>
{/if}

{#if isRightDrawerOpen}
  <aside
    transition:fly={{ duration: 250, x: 400, opacity: 0, easing: quintOut }}
    class="w-screen h-screen bg-white z-50 absolute top-0">
    <div
      class="flex items-center justify-between w-full h-16 border-b-2
      border-gray-300 p-2">
      <button class="w-8 h-8 text-actionblue" on:click={toggleRightDrawer}>
        <svg viewBox="0 0 24 24" fill="none">
          <path
            fill="currentColor"
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19
            12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
        </svg>
      </button>

      <div class="flex items-center justify-end">
        <span class="font-trade-gothic-20 text-sm tracking-tighter">USA</span>

        <div class="flex items-center justify-between h-12 m-2">
          <button
            class:justify-start={isUSA}
            class:justify-end={!isUSA}
            class="border rounded-full border-grey bg-actionblue flex
            items-center cursor-pointer w-12 h-6 px-1 relative"
            on:click={toggleLocale}>
            <span
              class:switch-off={isUSA}
              class:switch-on={!isUSA}
              class="rounded-full border w-4 h-4 border-grey shadow-inner
              bg-white shadow absolute" />
          </button>
        </div>

        <span
          class="font-trade-gothic-20 text-sm text-actionblue tracking-tighter">
          CANADA
        </span>
      </div>
    </div>

    <div
      class="flex items-center justify-between w-full h-16 border-b-2
      border-gray-300 p-2">
      <a class="font-franklin text-lg text-actionblue p-4 font-bold" href="/">
        Find It
      </a>
    </div>

    <div
      class="flex items-center justify-between w-full h-16 border-b-2
      border-gray-300 p-2">
      <a class="font-franklin text-lg text-actionblue p-4 font-bold" href="/">
        Design It
      </a>
    </div>

    <div
      class="flex items-center justify-between w-full h-16 border-b-2
      border-gray-300 p-2">
      <a class="font-franklin text-lg text-actionblue p-4 font-bold" href="/">
        Make It Happen
      </a>
    </div>

    <div
      class="flex items-center justify-between w-full h-16 border-b-2
      border-gray-300 p-2">
      <a class="font-franklin text-lg text-actionblue p-4 font-bold" href="/">
        Why Mattamy
      </a>
    </div>

    <div
      class="flex items-center justify-start w-full h-16 border-b-2
      border-gray-300 p-2">
      <a class="font-franklin text-lg text-actionblue p-4 font-bold" href="/">
        Saved
      </a>
      <span class="text-actionblue w-10 h-10">
        <svg viewBox="0 0 1000 1000">
          <path
            fill="currentColor"
            d="M109 618.7c60.8 80.6 139.8 145.3 222 203.8 0 0 98 67.9 143 99.5
            16.6 11.1 37.9 11.1 53.7 0 45-31.6 142.2-99.5 142.2-99.5C752 764
            829.4 700 891 618.7c52.1-69.5 90.8-151.7 97.9-238.6
            12.6-158-89.3-309.6-258.3-309.6-98.7 0-185.6 53.7-229.9 133.5C455
            123.4 368.9 69.7 270.1 69.7 101.9 69.7-1.6 221.4 11 379.3c7.2 86.9
            45.1 169.9 98 239.4z" />
          <text
            x="50%"
            y="50%"
            fill="white"
            font-size="20rem"
            dominant-baseline="middle"
            text-anchor="middle">
            12
          </text>
        </svg>
      </span>
    </div>

  </aside>
{/if}
