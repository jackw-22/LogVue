# LogVue agent notes

## Node and npm

Use the Linux Node installation for all project commands. The default `npm` on
this WSL setup may resolve to the Windows installation and fail on the mounted
repository path.

Prefix commands with:

```sh
PATH=/home/jack/.local/node/bin:$PATH npm <command>
```

Examples:

```sh
PATH=/home/jack/.local/node/bin:$PATH npm run dev
PATH=/home/jack/.local/node/bin:$PATH npm run typecheck
PATH=/home/jack/.local/node/bin:$PATH npm test
```
