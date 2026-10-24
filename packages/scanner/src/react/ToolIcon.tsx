type Name =
  | 'crop'
  | 'rotate'
  | 'filter'
  | 'adjust'
  | 'format'
  | 'more'
  | 'auto'
  | 'reset'
  | 'close'
  | 'previous'
  | 'next'
  | 'info'
  | 'plus'
  | 'trash'
  | 'replace'
  | 'grid'
  | 'zoom-in'
  | 'zoom-out'
  | 'before'
  | 'sheet'
  | 'source';
const paths: Record<Name, string> = {
  source: 'M3 4h18v16H3zM3 16l5-6 5 5 3-3 5 5M16 8h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  'zoom-in': 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12M14.5 14.5 21 21M7 10h6M10 7v6',
  'zoom-out': 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12M14.5 14.5 21 21M7 10h6',
  before: 'M4 4h16v16H4zM12 2v20M4 16l6-6 4 4 3-3 3 3',
  sheet: 'M5 3h14v18H5z',
  crop: 'M6 2v16h16M2 6h16v16M9 6h9v9',
  rotate: 'M5 8a8 8 0 1 1-1 8M5 3v5h5',
  filter: 'M7 8a4 4 0 1 0 0 .01M17 8a4 4 0 1 0 0 .01M12 17a4 4 0 1 0 0 .01',
  adjust: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  format: 'M5 3h14v18H5zM8 7h8M8 17h8',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  auto: 'm4 20 12-12 4 4-12 12M14 3v4M12 5h4M5 4v4M3 6h4M20 17v4M18 19h4',
  reset: 'M4 11a8 8 0 1 1 2 7M4 5v6h6',
  close: 'm6 6 12 12M18 6 6 18',
  previous: 'm15 5-7 7 7 7',
  next: 'm9 5 7 7-7 7',
  info: 'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  plus: 'M12 4v16M4 12h16',
  trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  replace: 'M4 7h14l-3-3M20 17H6l3 3M18 7l-3 3M6 17l3-3',
};
export function ToolIcon({ name }: { name: Name }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
