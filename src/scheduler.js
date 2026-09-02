import { schedulerIntervalMs } from './config.js';
import { sendDueMessages, sendReminderMessages } from './raids/service.js';

export function startScheduler(client) {
  setInterval(async () => {
    try {
      await sendReminderMessages(client);
      await sendDueMessages(client);
    } catch (error) {
      console.error(error);
    }
  }, schedulerIntervalMs);
}
