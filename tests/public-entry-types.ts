import type {
  CaptureWorkflow,
  OpenOptions,
  ScannerEntry,
  ScannerOptions,
} from '../packages/scanner/dist/index.js';
import type {
  ScannerEntry as ReactEntry,
  ScannerProps,
  CaptureWorkflow as ReactCaptureWorkflow,
  ImageViewerProps,
} from '../packages/scanner/dist/react/index.js';

// Compile against both distributed entry points, not implementation-only types.
export const cameraEntry: ScannerEntry = 'camera';
export const workspaceEntry: ReactEntry = 'workspace';
export const directOpen: OpenOptions = { entry: cameraEntry };
export const reactOpen: ScannerProps['openOptions'] = directOpen;
// @ts-expect-error Capture mode is not a scanner entry.
export const invalidEntry: OpenOptions = { entry: 'manual' };

export const continuousWorkflow: CaptureWorkflow = 'continuous';
export const oldWorkflow: ReactCaptureWorkflow = 'review-each';
export const workflowOption: Pick<ScannerOptions, 'captureWorkflow'> = {
  captureWorkflow: continuousWorkflow,
};
export const reactWorkflow: Pick<ScannerProps['options'], 'captureWorkflow'> = workflowOption;
export const swipeCallback: ImageViewerProps['onPageSwipe'] = (direction) => {
  const pageDirection: 'previous' | 'next' = direction;
  void pageDirection;
};
// @ts-expect-error Workflow is independent of Auto/Manual capture mode.
export const invalidWorkflow: Pick<ScannerOptions, 'captureWorkflow'> = { captureWorkflow: 'auto' };
// @ts-expect-error Workflow is configuration, not a duplicate per-open option.
export const invalidOpenWorkflow: OpenOptions = { captureWorkflow: 'continuous' };
