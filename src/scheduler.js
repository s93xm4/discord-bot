import { schedulerIdleIntervalMs, schedulerMinimumDelayMs } from './config.js';
import { getNextSchedulerRunAt } from './raids/repository.js';
import { sendDueMessages, sendReminderMessages } from './raids/service.js';

export function startScheduler(client) {
  let timer = null;
  let scheduledAt = null;
  let isRunning = false;
  let rerunRequested = false;

  function getDelay(nextRunAt) {
    if (!nextRunAt) {
      return schedulerIdleIntervalMs;
    }

    const delay = new Date(nextRunAt).getTime() - Date.now();

    return Math.min(
      Math.max(delay, schedulerMinimumDelayMs),
      schedulerIdleIntervalMs
    );
  }

  function scheduleIn(delayMs, force = false) {
    const nextScheduledAt = Date.now() + delayMs;

    if (timer && !force && scheduledAt <= nextScheduledAt) {
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }

    scheduledAt = nextScheduledAt;
    timer = setTimeout(run, delayMs);
  }

  async function run() {
    if (isRunning) {
      rerunRequested = true;
      return;
    }

    isRunning = true;
    timer = null;
    scheduledAt = null;

    try {
      await sendReminderMessages(client);
      await sendDueMessages(client);
      const nextRunAt = await getNextSchedulerRunAt();

      if (rerunRequested) {
        rerunRequested = false;
        scheduleIn(schedulerMinimumDelayMs, true);
        return;
      }

      scheduleIn(getDelay(nextRunAt), true);
    } catch (error) {
      console.error(error);
      scheduleIn(schedulerIdleIntervalMs, true);
    } finally {
      isRunning = false;
    }

    if (rerunRequested) {
      rerunRequested = false;
      scheduleIn(schedulerMinimumDelayMs, true);
    }
  }

  scheduleIn(schedulerMinimumDelayMs, true);

  return {
    scheduleSoon(delayMs = schedulerMinimumDelayMs) {
      if (isRunning) {
        rerunRequested = true;
        return;
      }

      scheduleIn(Math.max(delayMs, schedulerMinimumDelayMs), false);
    }
  };
}
