import { deadlineSweep, stipendSweep } from "./sweeps";

let booted = false;

export function bootScheduler(): void {
  if (booted) return;
  booted = true;
  try { deadlineSweep(); } catch (e) { console.error("deadlineSweep boot", e); }
  try { stipendSweep(); } catch (e) { console.error("stipendSweep boot", e); }

  setInterval(() => {
    try { deadlineSweep(); } catch (e) { console.error("deadlineSweep", e); }
  }, 60_000);

  setInterval(() => {
    try { stipendSweep(); } catch (e) { console.error("stipendSweep", e); }
  }, 60 * 60_000);
}
