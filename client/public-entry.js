import { startPublicApp } from "../public/app.js";

const publicMotionBudgetMs = 120;
let publicMotion = null;
let publicMotionEnabled = true;
const publicMotionReady = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ? Promise.resolve(null)
  : import("./public-motion.js")
      .then(({ createPublicMotion }) => {
        publicMotion = createPublicMotion(document.querySelector("#app"));
        return publicMotion;
      })
      .catch(() => null);

async function preparePublicMotionWithinBudget() {
  let timeoutId;
  const motion = await Promise.race([
    publicMotionReady,
    new Promise((resolve) => {
      timeoutId = window.setTimeout(() => resolve(null), publicMotionBudgetMs);
    })
  ]);
  window.clearTimeout(timeoutId);

  if (!motion) {
    publicMotionEnabled = false;
    return;
  }

  motion.prepare();
}

void startPublicApp({
  beforeReveal: preparePublicMotionWithinBudget
}).then(() => {
  if (publicMotionEnabled) {
    publicMotion?.play();
  }
});

window.addEventListener("pagehide", () => publicMotion?.destroy(), { once: true });
