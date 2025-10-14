import { createGetAllHandler } from '@/lib/api/handlers';

// Refactored using generic handler - eliminates duplication
export const GET = createGetAllHandler((storage) => storage.getAllWorkflows());
