# LogVue agent notes

## Node and npm

Use the Linux Node installation for all project commands. The default `npm` on
this WSL setup may resolve to the Windows installation and fail on the mounted
repository path.

Prefix commands with:

```sh
PATH=$HOME/.local/node/bin:$PATH npm <command>
```

Examples:

```sh
PATH=$HOME/.local/node/bin:$PATH npm run dev
PATH=$HOME/.local/node/bin:$PATH npm run typecheck
PATH=$HOME/.local/node/bin:$PATH npm test
```
