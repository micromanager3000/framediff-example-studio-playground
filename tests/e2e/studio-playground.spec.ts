import { expect, test, type Page } from "@playwright/test";
import type { AgentProjectSnapshot } from "@framediff/studio-model";
import { readFile, writeFile } from "node:fs/promises";
import { openComposition } from "./helpers";

async function openPlayground(page: Page): Promise<void> {
  await openComposition(page, "studio-playground");
  await expect(page).toHaveTitle("FrameDiff — Studio Playground");
  await expect(page.locator(".top-status")).toHaveText("ready");
  await expect(page.getByRole("heading", { name: "Every system." })).toBeVisible();
}

test("the default project presents the complete nested acceptance graph", async ({ page }) => {
  const missingLocalMedia: string[] = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 404 && path.startsWith("/audio/")) missingLocalMedia.push(path);
  });

  await page.goto("/");
  await expect(page.locator(".top-status")).toHaveText("ready");
  await expect(page.locator(".breadcrumb button.active")).toHaveText("StudioPlayground");
  await expect(page.locator(".clip[data-item-id^=playground-]")).toHaveCount(7);
  const expected = ["CoverageMap", "AuthoringChapter", "EditorialChapter", "EffectsChapter", "PipelineChapter"];
  for (const id of expected) await expect(page.locator(".composition-row").filter({ hasText: id }).first()).toBeVisible();
  expect(missingLocalMedia).toEqual([]);
});

test("edit compositions keep rich timeline previews and clip seeking without the ghost stage", async ({ page }) => {
  await openPlayground(page);
  const preview = page.locator(".preview-panel");

  await expect(preview.locator(".preview-host")).toBeVisible();
  await expect(page.locator(".space-time-stage")).toHaveCount(0);
  await expect(page.getByText("SPACE-TIME STAGE", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Preview timespan" })).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Timespan opacity" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "X-RAY" })).toHaveCount(0);
  await expect(page.locator(".space-time-now-beam, .space-time-ruler, .space-time-ghost")).toHaveCount(0);
  await expect(page.locator(".frame-grid-preview")).toHaveCount(0);
  await expect(page.locator(".clip-filmstrip").first()).toBeAttached({ timeout: 10_000 });
  await expect(preview.locator("[data-fd-id=StudioPlayground]")).toBeVisible();

  const clip = page.locator('.clip[data-item-id="playground-authoring"]');
  const clipBounds = await clip.boundingBox();
  expect(clipBounds).not.toBeNull();
  await page.mouse.click(clipBounds!.x + clipBounds!.width * .5, clipBounds!.y + clipBounds!.height * .5);
  await expect(page.locator(".timecode")).toHaveText(/038[89]f/);
  await expect(clip).toHaveClass(/selected/);
  await expect(clip).toHaveClass(/active/);

  await page.mouse.click(clipBounds!.x + clipBounds!.width * .25, clipBounds!.y + clipBounds!.height * .5);
  await expect(page.locator(".timecode")).toHaveText(/026[89]f/);
});

test("edit compositions keep persistent rails and the rich timeline workspace", async ({ page }) => {
  await openPlayground(page);
  const preview = page.locator(".preview-panel");
  const timeline = page.getByRole("region", { name: "Timeline" });
  const inspector = page.locator(".right-panel");
  const leftPanel = page.locator(".left-panel");

  await expect(preview).toBeVisible();
  await expect(timeline).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(leftPanel).toBeVisible();
  await expect(leftPanel.locator(".composition-frame-bar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open compositions and media" })).toBeHidden();
  await expect(page.locator(".space-time-stage")).toHaveCount(0);
  await expect(page.locator(".tl-shapes")).toHaveCount(0);
  for (const label of ["RECT", "OVAL", "LINE", "PATH"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  }

  const [leftBox, previewBox, timelineBox, inspectorBox, laneLabelBox, clipBox] = await Promise.all([
    leftPanel.boundingBox(),
    preview.boundingBox(),
    timeline.boundingBox(),
    inspector.boundingBox(),
    page.locator(".lane-label").first().boundingBox(),
    page.locator(".clip-video").first().boundingBox(),
  ]);
  expect(leftBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(timelineBox).not.toBeNull();
  expect(inspectorBox).not.toBeNull();
  expect(laneLabelBox).not.toBeNull();
  expect(clipBox).not.toBeNull();
  expect(leftBox!.width).toBeGreaterThanOrEqual(250);
  expect(previewBox!.x).toBeCloseTo(leftBox!.width, 0);
  expect(timelineBox!.x).toBeCloseTo(leftBox!.width, 0);
  expect(Math.abs(previewBox!.width - timelineBox!.width)).toBeLessThan(2);
  expect(inspectorBox!.x).toBeCloseTo(previewBox!.x + previewBox!.width, 0);
  expect(timelineBox!.y).toBeGreaterThan(previewBox!.y + previewBox!.height);
  expect(timelineBox!.height).toBeGreaterThanOrEqual(260);
  expect(laneLabelBox!.width).toBeGreaterThanOrEqual(110);
  expect(clipBox!.height).toBeGreaterThanOrEqual(44);
});

test("timeline zoom is continuous, pointer-anchored, and returns to fit", async ({ page }) => {
  await openPlayground(page);
  const zoom = page.getByRole("slider", { name: "Timeline zoom" });
  const fit = page.getByRole("button", { name: "FIT", exact: true });
  const clip = page.locator('.clip[data-item-id="playground-effects"]');

  await expect(zoom).toHaveValue("0");
  await expect(zoom).toHaveAttribute("aria-valuetext", "Fit timeline");
  const fitWidth = (await clip.boundingBox())?.width ?? 0;

  await zoom.fill("72");
  await expect(zoom).toHaveAttribute("aria-valuetext", /px\/f/);
  await expect.poll(async () => (await clip.boundingBox())?.width ?? 0).toBeGreaterThan(fitWidth * 4);

  await fit.click();
  await expect(zoom).toHaveValue("0");
  await expect.poll(async () => (await clip.boundingBox())?.width ?? 0).toBeCloseTo(fitWidth, 0);

  const before = await clip.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(before!.x + 1, before!.y + before!.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -360);
  await page.keyboard.up("Control");
  await expect(zoom).not.toHaveValue("0");
  const after = await clip.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(3);
});

test("timeline edge-panning keeps a dragged clip attached to the pointer", async ({ page }) => {
  const timelineFile = "src/compositions/labs/EditorialLab.timeline.json";
  const originalTimeline = await readFile(timelineFile, "utf8");

  try {
    await openComposition(page, "editorial-lab");
    await page.getByRole("slider", { name: "Timeline zoom" }).fill("55");
    const scroller = page.locator(".tl-scroll");
    const scrollerBounds = await scroller.boundingBox();
    const clip = page.locator('.clip[data-item-id="editorial-copy"]');
    const before = await clip.boundingBox();
    expect(scrollerBounds).not.toBeNull();
    expect(before).not.toBeNull();

    const visibleLeft = Math.max(before!.x + 20, scrollerBounds!.x + 80);
    const visibleRight = Math.min(before!.x + before!.width - 20, scrollerBounds!.x + scrollerBounds!.width - 120);
    expect(visibleRight).toBeGreaterThan(visibleLeft);
    const startX = (visibleLeft + visibleRight) / 2;
    const grabOffset = startX - before!.x;
    const start = { x: startX, y: before!.y + before!.height / 2 };
    const targetX = scrollerBounds!.x + scrollerBounds!.width - 8;
    const initialScroll = await scroller.evaluate((element) => element.scrollLeft);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.keyboard.down("Alt");
    await page.mouse.move(targetX, start.y, { steps: 8 });
    await page.waitForTimeout(240);

    const pannedScroll = await scroller.evaluate((element) => element.scrollLeft);
    const during = await clip.boundingBox();
    expect(pannedScroll).toBeGreaterThan(initialScroll + 40);
    expect(during).not.toBeNull();
    expect(Math.abs(during!.x + grabOffset - targetX)).toBeLessThan(16);
    await page.keyboard.up("Alt");
    await page.mouse.up();
  } finally {
    await page.keyboard.up("Alt").catch(() => {});
    await page.mouse.up().catch(() => {});
    await page.waitForTimeout(150);
    if (await readFile(timelineFile, "utf8") !== originalTimeline) await writeFile(timelineFile, originalTimeline);
  }
});

test("an obsolete composition query is removed and cannot override the project root", async ({ page }) => {
  await page.goto("/?comp=production-lab");
  await expect(page.locator(".top-status")).toHaveText("ready");
  await expect(page).toHaveURL("http://127.0.0.1:4174/");
  await expect(page.locator(".breadcrumb button.active")).toHaveText("StudioPlayground");
});

test("a user can descend root to chapter to leaf and return through breadcrumbs", async ({ page }) => {
  await openPlayground(page);

  await page.locator('.clip[data-item-id="playground-authoring"]').dblclick();
  await expect(page.locator(".breadcrumb button.active")).toHaveText("AuthoringChapter");
  await expect(page.locator('.clip[data-item-id="author-direct"]')).toBeVisible();

  await page.locator('.clip[data-item-id="author-direct"]').dblclick();
  await expect(page.locator(".breadcrumb button")).toHaveText(["StudioPlayground", "AuthoringChapter", "DirectManipulationLab"]);
  await expect(page.locator('[data-fd-id="lab-title"]')).toContainText("Edit JSON at the speed of thought.");

  await page.getByRole("button", { name: "AuthoringChapter", exact: true }).click();
  await expect(page.locator(".breadcrumb button.active")).toHaveText("AuthoringChapter");
});

test("the Guide starts at the map and targets a real nested chapter next", async ({ page }) => {
  await openPlayground(page);

  await page.getByRole("button", { name: "START TOUR" }).click();
  await expect(page.locator(".guide-task-bar strong")).toHaveText("Read the capability map");
  await page.getByRole("button", { name: "DONE · NEXT" }).click();
  await expect(page.locator(".guide-task-bar strong")).toHaveText("Open a chapter, then a focused leaf");
  await expect(page.locator(".breadcrumb button.active")).toHaveText("AuthoringChapter");
  await expect(page.locator('.clip[data-item-id="author-direct"]')).toHaveClass(/selected/);
});

test("the packaged effects lab keeps visual and audio timing on separate lanes", async ({ page }) => {
  await openComposition(page, "package-effects-lab");
  await expect(page.locator('.clip[data-item-id="effects-scene"]')).toBeVisible();
  await expect(page.locator('.clip[data-item-id="effects-scene"]')).toHaveText(/Packaged DOM effects/);
  await expect(page.locator('.clip[data-item-id="effects-audio"]')).toBeVisible();
  await expect(page.locator('.lane[data-lane-kind="video"] .clip[data-item-id="effects-scene"]')).toHaveCount(1);
  await expect(page.locator('.lane[data-lane-kind="audio"] .clip[data-item-id="effects-audio"]')).toHaveCount(1);
});

test("sound trim handles stop at the physical source boundaries", async ({ page }) => {
  const timelineFile = "src/compositions/playground/PackageEffectsLab.timeline.json";
  const originalTimeline = await readFile(timelineFile, "utf8");

  try {
    await openComposition(page, "package-effects-lab");
    const sound = page.locator('.lane[data-lane-kind="audio"] .clip[data-item-id="effects-audio"]');
    const outHandle = sound.locator(".trim-handle.right");
    const outBounds = await outHandle.boundingBox();
    expect(outBounds).not.toBeNull();
    expect(outBounds!.width).toBeGreaterThanOrEqual(7);

    await page.mouse.move(outBounds!.x + outBounds!.width / 2, outBounds!.y + outBounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(outBounds!.x + outBounds!.width / 2 + 80, outBounds!.y + outBounds!.height / 2, { steps: 4 });
    await page.mouse.up();

    await expect.poll(async () => JSON.parse(await readFile(timelineFile, "utf8")).items
      .find((item: { id: string }) => item.id === "effects-audio").durationInFrames).toBe(60);

    const inHandle = sound.locator(".trim-handle.left");
    const inBounds = await inHandle.boundingBox();
    expect(inBounds).not.toBeNull();
    expect(inBounds!.width).toBeGreaterThanOrEqual(7);
    await page.mouse.move(inBounds!.x + inBounds!.width / 2, inBounds!.y + inBounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(inBounds!.x + inBounds!.width / 2 - 80, inBounds!.y + inBounds!.height / 2, { steps: 4 });
    await page.mouse.up();

    await expect.poll(async () => {
      const item = JSON.parse(await readFile(timelineFile, "utf8")).items.find((entry: { id: string }) => entry.id === "effects-audio");
      return { from: item.from, durationInFrames: item.durationInFrames, trimStart: "trimStart" in item ? item.trimStart : null };
    }).toEqual({ from: 0, durationInFrames: 60, trimStart: null });
  } finally {
    if (await readFile(timelineFile, "utf8") !== originalTimeline) await writeFile(timelineFile, originalTimeline);
  }
});
test("embedded composition textures never escape into stray network requests", async ({ page }) => {
  const missingTextureRequests: string[] = [];
  page.on("response", (response) => {
    if (response.status() === 404 && response.url().includes("%23n")) missingTextureRequests.push(response.url());
  });

  await openComposition(page, "rich-properties-lab");
  await expect(page.locator('[data-fd-id="rich-headline"]')).toContainText("Click any object. Edit the document.");
  await expect(page.locator(".transport")).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Preview frame" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: /Timeline/ })).toHaveCount(0);
  const gradientBounds = await page.locator('[data-fd-id="gradient-panel"]').boundingBox();
  expect(gradientBounds).not.toBeNull();
  await page.mouse.click(gradientBounds!.x + gradientBounds!.width / 2, gradientBounds!.y + gradientBounds!.height / 2);
  await expect(page.locator(".inspector > header strong")).toHaveText("gradient-panel");
  await expect(page.getByText("composition JSON", { exact: true })).toBeVisible();
  expect(missingTextureRequests).toEqual([]);
});

test("direct manipulation is immediate and writes bound geometry to composition JSON", async ({ page }) => {
  const documentFile = "src/compositions/labs/DirectManipulationLab.comp.json";
  const htmlFile = "src/compositions/labs/DirectManipulationLab.html";
  const originalDocumentText = await readFile(documentFile, "utf8");
  const originalHtml = await readFile(htmlFile, "utf8");
  const originalX = JSON.parse(originalDocumentText).resizeCard.x as number;

  try {
    await openComposition(page, "direct-manipulation-lab");
    await expect(page.locator(".transport")).toBeVisible();
    await expect(page.getByRole("slider", { name: "Preview frame" })).toBeVisible();
    await expect(page.getByRole("group", { name: /Timeline/ })).toHaveCount(0);
    await expect(page.getByText("Make movable", { exact: false })).toHaveCount(0);
    await expect(page.locator('[data-fd-id="resize-card"]')).toHaveAttribute("data-fd-x", String(originalX));
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    await page.locator('[data-fd-id="DirectManipulationLab"]').evaluate((root) => { root.setAttribute("data-hot-patch-probe", "same-root"); });
    const bounds = await page.locator('[data-fd-id="resize-card"]').boundingBox();
    expect(bounds).not.toBeNull();
    const dragStart = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };

    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + 72, dragStart.y + 36, { steps: 4 });
    await page.mouse.up();

    await expect.poll(async () => JSON.parse(await readFile(documentFile, "utf8")).resizeCard.x).not.toBe(originalX);
    expect(await readFile(htmlFile, "utf8")).toBe(originalHtml);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
    await expect(page.locator('[data-fd-id="DirectManipulationLab"]')).toHaveAttribute("data-hot-patch-probe", "same-root");
    await expect(page.getByText("composition JSON", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => JSON.parse(await readFile(documentFile, "utf8")).resizeCard.x).toBe(originalX);
    expect(await readFile(htmlFile, "utf8")).toBe(originalHtml);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  } finally {
    if (await readFile(documentFile, "utf8") !== originalDocumentText) await writeFile(documentFile, originalDocumentText);
    if (await readFile(htmlFile, "utf8") !== originalHtml) await writeFile(htmlFile, originalHtml);
  }
});

test("motion paths explain their canvas controls and make drawing mode unmistakable", async ({ page }) => {
  await openComposition(page, "gsap-motion-lab");

  const productFlight = page.locator('.lane[data-animation-id="product-flight"] .animation-span');
  await expect(productFlight).toHaveCount(1);
  await productFlight.click();

  await expect(page.getByRole("heading", { name: "ROUTE", exact: true })).toBeVisible();
  await expect(page.getByText("Shape the object’s route on canvas", { exact: true })).toBeVisible();
  await expect(page.getByText("Solid stops set positions; hollow handles shape the curve. Timing stays in the keys below.", { exact: true })).toBeVisible();
  await expect(page.locator(".path-points")).not.toHaveAttribute("open", "");
  await expect(page.locator(".canvas-context-hud.motion")).toContainText("solid stops set positions");
  await expect(page.locator(".timeline-empty")).toHaveText("No clips in this scene — the motion lanes below drive the composition.");

  await page.getByRole("button", { name: "Record a move" }).click();
  await expect(page.locator(".canvas-overlay")).toHaveClass(/gesture-active/);
  await expect(page.locator(".gesture-mode-hud")).toContainText("Playback starts when you drag the selected object");

  await page.keyboard.press("Escape");
  await expect(page.locator(".gesture-mode-hud")).toHaveCount(0);
  await expect(page.locator(".canvas-overlay")).not.toHaveClass(/gesture-active/);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("a composition can be dragged directly onto an edit timeline and undone", async ({ page }) => {
  await openComposition(page, "editorial-lab");

  const primaryCompositions = page.locator('.composition-list[role="list"]').first();
  const endCard = primaryCompositions.locator(".composition-row").filter({ hasText: "EndCard" });
  const timeline = page.getByRole("group", { name: "Timeline; drop a composition to add it at a frame" });
  await expect(endCard).toHaveCount(1);
  await expect(timeline).toBeVisible();

  await endCard.dragTo(timeline, { targetPosition: { x: 430, y: 115 } });
  const nestedClip = timeline.locator(".clip").filter({ hasText: "EndCard" });
  await expect(nestedClip).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(nestedClip).toHaveCount(0);
});

test("timeline v2 shapes share JSON layout, canvas resize, and stacking authority", async ({ page }) => {
  const timelineFile = "src/compositions/labs/EditorialLab.timeline.json";
  const originalTimeline = await readFile(timelineFile, "utf8");

  try {
    const seededTimeline = JSON.parse(originalTimeline);
    seededTimeline.version = 2;
    seededTimeline.items.push({
      id: "path-shape",
      name: "Path shape",
      from: 0,
      durationInFrames: 180,
      layer: 2,
      layout: { rect: [557, 335, 806, 410], fit: "fill", cornerRadius: 0, opacity: 1 },
      content: {
        type: "shape",
        shape: "path",
        fill: "#f0b969",
        stroke: "#f0b969",
        strokeWidth: 2,
        d: "M 8 50 C 22 8 78 8 92 50 C 78 92 22 92 8 50 Z",
      },
    });
    await writeFile(timelineFile, `${JSON.stringify(seededTimeline, null, 2)}\n`);
    await openComposition(page, "editorial-lab");

    await expect.poll(async () => {
      const document = JSON.parse(await readFile(timelineFile, "utf8"));
      return { version: document.version, shape: document.items.find((item: { id: string }) => item.id === "path-shape") };
    }).toMatchObject({
      version: 2,
      shape: {
        layer: 2,
        content: { type: "shape", shape: "path" },
        layout: { fit: "fill", cornerRadius: 0, opacity: 1 },
      },
    });

    const shapeClip = page.locator('.clip[data-item-id="path-shape"]');
    const shapeNode = page.locator('[data-fd-id="path-shape"]');
    await expect(shapeClip).toBeVisible();
    await expect(shapeNode).toBeVisible();
    await shapeClip.click();
    await expect(page.getByRole("heading", { name: "LAYOUT", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "SHAPE", exact: true })).toBeVisible();
    const shapeBounds = await shapeNode.boundingBox();
    expect(shapeBounds).not.toBeNull();
    await page.mouse.click(shapeBounds!.x + shapeBounds!.width / 2, shapeBounds!.y + shapeBounds!.height / 2);
    await expect(page.locator(".resize-handle")).toHaveCount(8);

    const beforeResize = JSON.parse(await readFile(timelineFile, "utf8")).items
      .find((item: { id: string }) => item.id === "path-shape").layout.rect as number[];
    const resizeHandle = page.locator('.resize-handle[data-resize-handle="se"]');
    const handleBounds = await resizeHandle.boundingBox();
    expect(handleBounds).not.toBeNull();
    await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + handleBounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBounds!.x + handleBounds!.width / 2 + 48, handleBounds!.y + handleBounds!.height / 2 + 28, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => JSON.parse(await readFile(timelineFile, "utf8")).items
      .find((item: { id: string }) => item.id === "path-shape").layout.rect[2]).toBeGreaterThan(beforeResize[2]);

    const cornerRadius = page.getByRole("spinbutton", { name: "corner radius number" });
    await cornerRadius.fill("36");
    await cornerRadius.press("Tab");
    await expect.poll(async () => JSON.parse(await readFile(timelineFile, "utf8")).items
      .find((item: { id: string }) => item.id === "path-shape").layout.cornerRadius).toBe(36);

    const targetLane = page.locator('.lane[data-lane-id="v:1"]');
    const clipBounds = await shapeClip.boundingBox();
    const targetBounds = await targetLane.boundingBox();
    expect(clipBounds).not.toBeNull();
    expect(targetBounds).not.toBeNull();
    await page.mouse.move(clipBounds!.x + clipBounds!.width / 2, clipBounds!.y + clipBounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(clipBounds!.x + clipBounds!.width / 2, targetBounds!.y + targetBounds!.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => JSON.parse(await readFile(timelineFile, "utf8")).items
      .find((item: { id: string }) => item.id === "path-shape").layer).toBe(1);
    await expect(shapeNode).toHaveCSS("z-index", "1");
  } finally {
    if (await readFile(timelineFile, "utf8") !== originalTimeline) await writeFile(timelineFile, originalTimeline);
  }
});

test("edit clips expose video audio controls and reversible item and layer deletion", async ({ page }) => {
  const timelineFile = "src/compositions/labs/EditorialLab.timeline.json";
  const htmlFile = "src/compositions/labs/EditorialLab.html";
  const originalTimeline = await readFile(timelineFile, "utf8");
  const originalHtml = await readFile(htmlFile, "utf8");

  try {
    await openComposition(page, "editorial-lab");
    const mediaClip = page.locator('.clip[data-item-id="editorial-media"]');
    await mediaClip.evaluate((element) => (element as HTMLButtonElement).click());
    await expect(page.getByRole("heading", { name: "VIDEO AUDIO" })).toBeVisible();

    const volume = page.getByRole("spinbutton", { name: "volume number" });
    await expect(volume).toHaveValue("1");
    await volume.fill("0.35");
    await volume.press("Tab");
    await expect.poll(async () => JSON.parse(await readFile(timelineFile, "utf8")).items[0].volume).toBe(0.35);
    const previewVideo = page.locator('[data-fd-id="editorial-media"] video');
    await expect.poll(() => previewVideo.evaluate((video: HTMLVideoElement) => ({
      volume: video.volume,
      exportVolume: video.dataset.framediffVolume,
    }))).toEqual({ volume: 0.35, exportVolume: "0" });

    const muted = page.getByRole("checkbox", { name: "muted" });
    await expect(muted).toBeChecked();
    await muted.uncheck();
    await expect.poll(async () => JSON.parse(await readFile(timelineFile, "utf8")).items[0].muted).toBe(false);
    await expect.poll(() => previewVideo.evaluate((video: HTMLVideoElement) => ({
      muted: video.muted,
      exportVolume: video.dataset.framediffVolume,
    }))).toEqual({ muted: false, exportVolume: "0.35" });

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => readFile(timelineFile, "utf8")).toBe(originalTimeline);

    await mediaClip.evaluate((element) => (element as HTMLButtonElement).click());
    await page.getByRole("button", { name: "DELETE FROM TIMELINE" }).click();
    await page.getByRole("button", { name: "CONFIRM DELETE" }).click();
    await expect.poll(async () => JSON.parse(await readFile(timelineFile, "utf8")).items.some((item: { id: string }) => item.id === "editorial-media")).toBe(false);
    await expect.poll(async () => readFile(htmlFile, "utf8")).not.toContain('data-fd-id="editorial-media"');
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => readFile(timelineFile, "utf8")).toBe(originalTimeline);
    await expect.poll(async () => readFile(htmlFile, "utf8")).toBe(originalHtml);

    const deleteLayer = page.locator('.lane[data-lane-id="v:0"] .delete-lane');
    // Undo restores source first; wait for the follow-up probe to restore the
    // original V1 contents before acting on that lane again.
    await expect(page.locator('.lane[data-lane-id="v:0"] .clip[data-item-id="editorial-media"]')).toBeVisible();
    await expect(deleteLayer).toHaveAttribute("aria-label", "Delete V1");
    await deleteLayer.click();
    await expect(deleteLayer).toHaveAttribute("aria-label", "Confirm delete V1");
    await deleteLayer.click();
    await expect.poll(async () => {
      const items = JSON.parse(await readFile(timelineFile, "utf8")).items as Array<{ id: string }>;
      return items.some((item) => item.id === "editorial-media" || item.id === "editorial-wash");
    }).toBe(false);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => readFile(timelineFile, "utf8")).toBe(originalTimeline);
    await expect.poll(async () => readFile(htmlFile, "utf8")).toBe(originalHtml);
  } finally {
    if (await readFile(timelineFile, "utf8") !== originalTimeline) await writeFile(timelineFile, originalTimeline);
    if (await readFile(htmlFile, "utf8") !== originalHtml) await writeFile(htmlFile, originalHtml);
  }
});

test("a composition can be dragged into a generative recipe and undone", async ({ page }) => {
  await openPlayground(page);
  const primaryCompositions = page.locator('.composition-list[role="list"]').first();
  const rows = primaryCompositions.locator(".composition-row");
  await rows.filter({ hasText: "Blah" }).click();
  await expect(page.locator(".breadcrumb button.active")).toHaveText("Blah");

  const endCard = rows.filter({ hasText: "EndCard" });
  const references = page.getByRole("group", { name: "Generation input references; drop media or a composition to add it" });
  await expect(endCard).toHaveCount(1);
  await expect(references).toBeVisible();

  await endCard.dragTo(references);
  const addedReference = page.getByRole("button", { name: "Remove video reference EndCard", exact: true });
  await expect(addedReference).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(addedReference).toHaveCount(0);
});

test("a JSON-only property edit hot-patches the comp without reloading Studio", async ({ page }) => {
  const documentFile = "src/compositions/playground/ClothLab.comp.json";
  const originalText = await readFile(documentFile, "utf8");
  const originalDocument = JSON.parse(originalText) as { simulation: { gravityY: number } };
  const originalGravity = originalDocument.simulation.gravityY;
  const editedGravity = originalGravity - 1.1;

  try {
    await openComposition(page, "cloth-lab");
    await expect(page.locator(".transport")).toBeVisible();
    await expect(page.getByRole("slider", { name: "Preview frame" })).toBeVisible();
    await expect(page.getByRole("group", { name: /Timeline/ })).toHaveCount(0);
    await page.getByRole("button", { name: "INSPECT", exact: true }).click();
    const gravity = page.locator('label[title$="/simulation/gravityY"] input[type="number"]');
    await expect(gravity).toHaveValue(String(originalGravity));
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    await page.locator('[data-fd-id="ClothLab"]').evaluate((root) => { root.setAttribute("data-hot-patch-probe", "same-root"); });

    await gravity.fill(String(editedGravity));
    await page.getByRole("button", { name: "INSPECT", exact: true }).click();
    await expect.poll(async () => JSON.parse(await readFile(documentFile, "utf8")).simulation.gravityY).toBe(editedGravity);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
    await expect(page.locator('[data-fd-id="ClothLab"]')).toHaveAttribute("data-hot-patch-probe", "same-root");

    await page.getByRole("button", { name: "INSPECT", exact: true }).click();
    await expect(gravity).toHaveValue(String(editedGravity));
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(async () => JSON.parse(await readFile(documentFile, "utf8")).simulation.gravityY).toBe(originalGravity);
    await expect(gravity).toHaveValue(String(originalGravity));
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  } finally {
    if (await readFile(documentFile, "utf8") !== originalText) await writeFile(documentFile, originalText);
  }
});

test("the agent surface can inspect every new composition kind", async ({ page }) => {
  await openPlayground(page);

  const result = await page.evaluate(async () => {
    const snapshot = (await window.__framediffStudio!.query({
      id: "playground-inspect",
      query: { type: "project.snapshot" },
    })).result as AgentProjectSnapshot;
    const requested = ["studio-playground", "rich-properties-lab", "coverage-map", "cloth-lab", "world-set", "world-lab", "audio-lab", "skyTimelapse"];
    return requested.map((key) => {
      const entry = snapshot.compositions.find((candidate) => candidate.composition.key === key);
      return { key, kind: entry?.composition.kind, objects: entry?.objects.length ?? 0 };
    });
  });

  expect(result).toEqual([
    { key: "studio-playground", kind: "edit", objects: 7 },
    { key: "rich-properties-lab", kind: "scene", objects: 0 },
    { key: "coverage-map", kind: "doc", objects: 0 },
    { key: "cloth-lab", kind: "scene", objects: 1 },
    { key: "world-set", kind: "set", objects: 0 },
    { key: "world-lab", kind: "previz", objects: 2 },
    { key: "audio-lab", kind: "audio", objects: 2 },
    { key: "skyTimelapse", kind: "scene", objects: 1 },
  ]);

  const visual = await page.evaluate(async () => {
    const frame = await window.__framediffStudio!.snapshot("studio-playground", 0);
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not decode the exact Playground frame"));
      image.src = frame.dataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 54;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<string>();
    let brightPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const [red, green, blue] = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
      if (red + green + blue > 430) brightPixels += 1;
    }
    const rail = document.querySelector<HTMLElement>(".playground-rail")!.getBoundingClientRect();
    const root = document.querySelector<HTMLElement>('[data-fd-id="StudioPlayground"]')!.getBoundingClientRect();
    return { colors: colors.size, brightPixels, railTop: (rail.top - root.top) / root.height };
  });
  expect(visual.colors).toBeGreaterThan(40);
  expect(visual.brightPixels).toBeGreaterThan(20);
  expect(visual.railTop).toBeGreaterThan(0.9);
});

test("set-linked previz exposes inherited Set camera keys before its sidecar is customized", async ({ page }) => {
  const cameraFile = "src/compositions/playground/WorldLab.cameras.json";
  const original = await readFile(cameraFile, "utf8");
  try {
    await writeFile(cameraFile, `${JSON.stringify({ version: 1, cameras: {} }, null, 2)}\n`);
    await page.reload();
    await openComposition(page, "world-lab");
    await page.getByRole("button", { name: "INSPECT", exact: true }).click();

    await expect(page.locator(".fd-cl-title span")).toContainText("overview · 0f · 2 keys");
    await expect(page.getByRole("button", { name: "Camera keyframe 1 at frame 0 — click to go, drag to retime" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Camera keyframe 2 at frame 119 — click to go, drag to retime" })).toBeVisible();

    await page.getByRole("spinbutton", { name: "Position X" }).fill("1.5");
    await page.getByRole("button", { name: "Replace the camera keyframe at frame 0" }).click();
    await expect.poll(async () => {
      const keys = JSON.parse(await readFile(cameraFile, "utf8")).cameras.overview.keyframes;
      return { frames: keys.map((key: { frame: number }) => key.frame), x: keys[0].pose.cameraPosition[0] };
    }).toEqual({ frames: [0, 119], x: 1.5 });
  } finally {
    if (await readFile(cameraFile, "utf8") !== original) await writeFile(cameraFile, original);
  }
});

test("set-linked previz exposes its input and a persistent numeric camera key editor", async ({ page }) => {
  const cameraFile = "src/compositions/playground/WorldLab.cameras.json";
  const original = await readFile(cameraFile, "utf8");
  try {
    await openComposition(page, "world-lab");
    await page.getByRole("button", { name: "INSPECT", exact: true }).click();
    await expect(page.getByRole("region", { name: "Camera Lab" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open SET composition WorldSet" })).toBeVisible();
    await page.getByRole("button", { name: "Open SET composition WorldSet" }).click();
    await expect(page.locator(".breadcrumb button.active")).toHaveText("WorldSet");
    await expect(page.getByRole("region", { name: "Set Explorer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Toggle camera fly controls" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /camera keyframe/i })).toHaveCount(0);
    await expect(page.locator(".transport")).toHaveCount(0);
    await expect(page.getByRole("group", { name: /Timeline/ })).toHaveCount(0);
    const setPositionX = page.getByRole("spinbutton", { name: "Position X" });
    const setRotationY = page.getByRole("spinbutton", { name: "Rotation Y" });
    const setCanvas = await page.locator('[data-fd-id="WorldSet"] canvas[data-fd-three]').boundingBox();
    expect(setCanvas).not.toBeNull();
    const setStartX = Number(await setPositionX.inputValue());
    const setStartYaw = Number(await setRotationY.inputValue());
    await page.mouse.move(setCanvas!.x + setCanvas!.width * 0.45, setCanvas!.y + setCanvas!.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(setCanvas!.x + setCanvas!.width * 0.6, setCanvas!.y + setCanvas!.height * 0.5, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => Number(await setRotationY.inputValue())).not.toBe(setStartYaw);
    await expect(setPositionX).toHaveValue(String(setStartX));

    await openComposition(page, "world-lab");
    const positionX = page.getByRole("spinbutton", { name: "Position X" });
    const roll = page.getByRole("spinbutton", { name: "Rotation Z" });
    await expect(positionX).toHaveValue("0");
    await expect(page.getByRole("button", { name: "Toggle auto-key: scrubbing away from unsaved edits keys them in place" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Toggle camera fly controls" }).click();
    await page.locator('[data-fd-id="WorldLab"]').focus();
    await page.locator('[data-fd-id="WorldLab"]').press("ArrowRight");
    await expect(positionX).not.toHaveValue("0");
    await positionX.fill("1.25");
    await roll.fill("7.5");
    await expect(page.getByRole("status")).toContainText("DRAFT @ 0f");
    await page.getByRole("button", { name: "Replace the camera keyframe at frame 0" }).click();
    await expect.poll(async () => {
      const key = JSON.parse(await readFile(cameraFile, "utf8")).cameras.overview.keyframes[0];
      return { x: key.pose.cameraPosition[0], roll: key.pose.cameraRotation[2] };
    }).toEqual({ x: 1.25, roll: expect.closeTo(7.5 * Math.PI / 180, 8) });
    await expect(page.getByRole("status")).toContainText(/SAVED|JSON/);

    await page.getByRole("button", { name: "Camera keyframe 2 at frame 119" }).click();
    await expect(page.locator(".fd-cl-title span")).toContainText("119f");
    await expect(page.getByRole("spinbutton", { name: "Frame of the key at the playhead" })).toHaveValue("119");
    await page.getByRole("spinbutton", { name: "Frame of the key at the playhead" }).fill("110");
    await page.getByRole("spinbutton", { name: "Frame of the key at the playhead" }).press("Enter");
    await expect.poll(async () => JSON.parse(await readFile(cameraFile, "utf8")).cameras.overview.keyframes[1].frame).toBe(110);
    await expect(page.locator(".fd-cl-title span")).toContainText("110f");

    await page.reload();
    await openComposition(page, "world-lab");
    await expect(page.getByRole("spinbutton", { name: "Position X" })).toHaveValue("1.25");
    await expect(page.getByRole("button", { name: "Camera keyframe 2 at frame 110" })).toBeVisible();
  } finally {
    if (await readFile(cameraFile, "utf8") !== original) await writeFile(cameraFile, original);
  }
});

test("previz camera timeline adds a static shot on a free track and persists its clip keys", async ({ page }) => {
  const dataFile = "src/compositions/playground/WorldLab.scene.json";
  const cameraFile = "src/compositions/playground/WorldLab.cameras.json";
  const [originalData, originalCameras] = await Promise.all([readFile(dataFile, "utf8"), readFile(cameraFile, "utf8")]);
  try {
    await openComposition(page, "world-lab");
    await expect(page.locator('.lane[data-lane-kind="camera"]')).toHaveCount(1);
    await expect(page.getByLabel("Program camera")).toBeVisible();
    await expect(page.locator(".program-segment")).toHaveText(["overview camera", "procedural orbit camera"]);

    await page.locator(".add-camera").click();
    await expect(page.locator('.clip[data-item-id="camera-1"]')).toBeVisible();
    await expect(page.locator('.lane[data-lane-kind="camera"]')).toHaveCount(2);
    const newCameraClip = page.locator('.clip[data-item-id="camera-1"]');
    const newCameraLane = page.locator('.lane[data-lane-kind="camera"]').filter({ has: newCameraClip });
    await expect(newCameraLane.locator('.camera-key[aria-label="camera key at frame 0"]')).toBeVisible();
    await expect(newCameraLane.locator('.camera-key[aria-label="camera key at frame 119"]')).toBeVisible();
    await expect.poll(async () => {
      const data = JSON.parse(await readFile(dataFile, "utf8"));
      const cameras = JSON.parse(await readFile(cameraFile, "utf8"));
      const cut = data.cameras.find((entry: { id: string }) => entry.id === "camera-1");
      return { cut, keys: cameras.cameras["camera-1"]?.keyframes.map((key: { frame: number }) => key.frame) };
    }).toEqual({
      cut: expect.objectContaining({ from: 0, durationInFrames: 120, layer: 1 }),
      keys: [0, 119],
    });

    await page.reload();
    await openComposition(page, "world-lab");
    await expect(page.locator('.clip[data-item-id="camera-1"]')).toBeVisible();
    await expect(page.locator(".program-segment").first()).toHaveText("camera-1");
  } finally {
    await Promise.all([writeFile(dataFile, originalData), writeFile(cameraFile, originalCameras)]);
  }
});

test("the 3D camera editor loads its deferred runtime on demand", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await openComposition(page, "HeroPlane3D.uizoom");
  await page.locator('[data-fd-id="plane-uizoom"]').click({ force: true });
  await page.getByRole("button", { name: "OPEN 3D RIG EDITOR" }).click();

  await expect(page.getByRole("dialog", { name: "3D camera rig editor" })).toBeVisible();
  await expect(page.locator(".camera-rig-canvas canvas")).toBeVisible();
  await expect(page.locator(".camera-rig-load-state.error")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
