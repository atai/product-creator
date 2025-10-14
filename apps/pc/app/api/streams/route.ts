import { createGetAllHandler } from '@/lib/api/handlers';

// Refactored using generic handler
export const GET = createGetAllHandler((storage) => storage.getAllStreams());
