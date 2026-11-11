/**
 * Re-export of the FullCalendar #7998 sample stream (task 8.1 moved it to `data/cases/`). Kept so older imports
 * keep working; new code reads the selected case from `cases/store.tsx` or `data/cases/index.ts`.
 */
export {
  CALENDAR_ZONE,
  CONTROLLED_INSTANT,
  FC_VERSION_ID,
  FULLCALENDAR_STREAM as REPLAY_STREAM,
  SYSTEM_ZONE,
} from "./cases/fullcalendar-7998.stream";
