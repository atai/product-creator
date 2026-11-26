// This file marks the module as server-only
// If imported on the client, it will throw an error
if (typeof window !== 'undefined') {
  throw new Error('This module can only be imported on the server side');
}

