/// <reference types="vite/client" />
import type { PcBridge } from '../../shared/ipc';

declare global {
  interface Window {
    pc: PcBridge;
  }
}
