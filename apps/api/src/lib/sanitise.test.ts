import assert from "node:assert/strict";
import test from "node:test";

import { sanitiseContent } from "./sanitise.js";

const TEST_PATH = "apps/web/src/app/generated/dreadmeter/App.tsx";

test("sanitiseContent removes the exact Tailwind CDN script tag", () => {
  const input = [
    "<div>before</div>",
    '<script src="https://cdn.tailwindcss.com"></script>',
    "<div>after</div>",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("cdn.tailwindcss.com"), false);
  assert.equal(output.includes("<div>before</div>"), true);
  assert.equal(output.includes("<div>after</div>"), true);
});

test("sanitiseContent removes Tailwind CDN script tags with query-string variants", () => {
  const input = [
    '<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>',
    "<main>safe</main>",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("cdn.tailwindcss.com"), false);
  assert.equal(output.includes("<main>safe</main>"), true);
});

test("sanitiseContent removes version-pinned Tailwind CDN script tags", () => {
  const input = [
    '<script src="https://cdn.tailwindcss.com/@3.4.13?plugins=forms"></script>',
    "<section>safe</section>",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("cdn.tailwindcss.com"), false);
  assert.equal(output.includes("<section>safe</section>"), true);
});

test("sanitiseContent removes protocol-relative Tailwind CDN script tags", () => {
  const input = [
    "<header>safe</header>",
    '<script src="//cdn.tailwindcss.com?plugins=forms"></script>',
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("cdn.tailwindcss.com"), false);
  assert.equal(output.includes("<header>safe</header>"), true);
});

test("sanitiseContent removes stylesheet links that reference the Tailwind CDN", () => {
  const input = [
    '<link rel="stylesheet" href="https://cdn.tailwindcss.com?plugins=forms">',
    "<article>safe</article>",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output.includes("cdn.tailwindcss.com"), false);
  assert.equal(output.includes("<article>safe</article>"), true);
});

test("sanitiseContent leaves unrelated local markup untouched", () => {
  const input = [
    '<script src="/assets/app.js"></script>',
    '<link rel="stylesheet" href="/assets/app.css">',
    "<div>safe</div>",
  ].join("\n");

  const output = sanitiseContent(input, TEST_PATH);

  assert.equal(output, input);
});

test("sanitiseContent logs the dedicated tailwindCdnScript fixer when it fires", () => {
  const input = '<script src="https://cdn.tailwindcss.com"></script>';
  const originalLog = console.log;
  const calls: string[] = [];

  console.log = (...args: unknown[]) => {
    calls.push(args.map((value) => String(value)).join(" "));
  };

  try {
    sanitiseContent(input, TEST_PATH);
  } finally {
    console.log = originalLog;
  }

  assert.equal(
    calls.some((line) => line.includes("[sanitise] tailwindCdnScript fixed in App.tsx")),
    true,
  );
});
