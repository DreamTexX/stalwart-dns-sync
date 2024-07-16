<script lang="ts">
    export let data;
</script>

<form action="?/sync" method="POST">
    <button type="submit">Sync Records</button>
</form>

{#each data.items as { zone, result }}
    {@const badRecords = result.filter((item) => !item.sync)}

    <h1>{zone.name}</h1>
    {#if badRecords.length > 0}
        <ul>
            {#each badRecords as item}
                <li>
                    <div class="heading">
                        <div class="title">
                            <span class="bold">{item.target.type}</span>
                            <span>{item.target.name}</span>
                        </div>
                        <span class="error">
                            {#if item.actual}
                                Misconfigured
                            {:else}
                                Missing
                            {/if}
                        </span>
                    </div>
                    <div>
                        <span>Target:</span>
                        <code>{item.target.content}</code>
                    </div>
                    {#if item.actual}
                        <div>
                            <span>Actual:</span>
                            <code>{item.actual.content}</code>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {:else}
        <p>All good.</p>
    {/if}
{/each}

<style>
    :global(body) {
        margin: 0;
        font-family: sans-serif;
    }

    :global(*) {
        box-sizing: border-box;
    }

    .error {
        color: red;
    }

    .bold {
        font-weight: 600;
    }

    ul {
        list-style-type: none;
        padding: 1rem;
        margin: 0;
        display: grid;
        gap: 1rem;
    }

    li {
        padding: 1rem;
        box-shadow: 0 0 0.4rem rgba(0, 0, 0, 0.2);
        border-radius: 0.4rem;
        display: grid;
        gap: 1rem;
    }

    li .heading {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    li .heading .title {
        display: grid;
        grid-auto-flow: column;
        gap: 1rem;
    }
</style>
