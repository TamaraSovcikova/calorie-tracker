import { defineConfig } from "@vite-pwa/assets-generator/config";

// Verve's icon is a full-bleed dark badge. Keep that colour behind every
// generated size so nothing shows through when the OS masks the icon
// (iOS squircle / Android adaptive circle). The stock minimal2023 Apple
// preset padded the art on a light field, which produced the white corners
// seen once iOS applied its own mask.
const background = "#211D17";

export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, "favicon.ico"]],
      // Full-bleed: the source already fills the square, so no padding.
      padding: 0,
    },
    maskable: {
      sizes: [512],
      // Keep the logo inside the adaptive-icon safe zone, dark fill around.
      padding: 0.1,
      resizeOptions: { background },
    },
    apple: {
      sizes: [180],
      // iOS applies its own squircle; hand it a full-bleed dark square.
      padding: 0,
      resizeOptions: { background },
    },
  },
  images: ["public/favicon.svg"],
});
