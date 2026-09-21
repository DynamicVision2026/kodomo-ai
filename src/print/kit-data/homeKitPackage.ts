import raw from './home-kit-package.json';

/** WO-29 §I: one deliverable file inside a folder — `kitItem` is manifest.json's own id,
 *  `kind` says whether scripts/build-home-kit.ts should render it via the sheet (`?item=`) or
 *  deck route, and `fileName` is the actual, customer-facing Japanese output filename. */
export interface HomeKitItem {
  kitItem: string;
  kind: 'sheet' | 'deck';
  fileName: string;
}

export interface HomeKitFolder {
  id: string;
  title: string;
  description: string;
  items: HomeKitItem[];
}

export interface HomeKitPackage {
  zipBaseName: string;
  folders: HomeKitFolder[];
}

export const homeKitPackage = raw as HomeKitPackage;
