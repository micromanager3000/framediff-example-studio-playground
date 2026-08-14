# FrameDiff example · Studio Playground

## Setup

```sh
git clone --recurse-submodules https://github.com/micromanager3000/framediff-example-studio-playground.git
cd framediff-example-studio-playground
npm install
npm run dev
```

FrameDiff is pinned in `vendor/framediff` until its packages are published to npm. Update the
pin with `git submodule update --remote vendor/framediff`, then validate and commit the gitlink.

This standalone example is FrameDiff's guided acceptance project. It covers authoring, editorial
workflows, motion, finishing, deterministic simulation, native Three.js, generation, audio, cache,
the Agent API, and local delivery through a nested composition graph.

The project reuses representative hero, lower-third, grading, and media workflows as part of its
acceptance coverage, but it runs independently from the `hero-lower-third` example.

See the [Studio Playground guide](https://github.com/micromanager3000/framediff/blob/main/docs/STUDIO-PLAYGROUND.md) for the graph, capability map, and
maintained 17-step walkthrough.

## Assets

The project selects Git LFS in [`framediff.config.json`](framediff.config.json). Its manifest-backed
media lives in [`assets/`](assets) and is versioned through Git LFS. After a fresh clone, run:

```sh
git lfs pull
```

## Run

From the repository root:

```sh
npm install
npm run dev
```

The root URL opens `StudioPlayground`. Other registered compositions remain directly
reachable through the Studio composition tree.

## Check

```sh
npm run check
npm run build
npx vitest run src/compositions/playground/StudioPlaygroundGuide.test.ts
npx playwright test tests/e2e/studio-playground.spec.ts --project=chromium
```
