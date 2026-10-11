export const posPwaWorkbox = {
  navigateFallback: "/index.html",
  globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
};
