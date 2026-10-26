import type { OpenOptions, ScannerEntry } from '../packages/scanner/dist/index.js';
import type {
  ScannerEntry as ReactEntry,
  ScannerProps,
} from '../packages/scanner/dist/react/index.js';

// Compile against both distributed entry points, not implementation-only types.
export const cameraEntry: ScannerEntry = 'camera';
export const workspaceEntry: ReactEntry = 'workspace';
export const directOpen: OpenOptions = { entry: cameraEntry };
export const reactOpen: ScannerProps['openOptions'] = directOpen;
// @ts-expect-error Capture mode is not a scanner entry.
export const invalidEntry: OpenOptions = { entry: 'manual' };
