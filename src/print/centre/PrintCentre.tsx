import type { HomeKitPackage } from '../kit-data/homeKitPackage';
import './print-centre.css';

export interface PrintCentreUi {
  heading: string;
  subheading: string;
  downloadLabel: string;
  zipHeading: string;
  zipDescription: string;
  zipButtonLabel: string;
}

export interface PrintCentreProps {
  ui: PrintCentreUi;
  pkg: HomeKitPackage;
  /** Base path the generated files are actually served from — /kit/ in production (Vite's
   *  public/ convention copies public/kit/ to dist/kit/ verbatim, see scripts/build-home-kit.ts's
   *  own doc comment). Kept as a prop, not hard-coded, so this component stays testable without
   *  depending on the real build output existing. */
  baseUrl: string;
}

/**
 * WO-29 §H: the family's actual downloads page — every kit deliverable listed separately, plus
 * one 「まとめてダウンロード」 for the complete ZIP. Deliberately plain utility (AD-06's own
 * "never another dashboard" boundary): no progress, no navigation, no mascot — a family opens
 * this once or twice total, prints what they need, and leaves.
 */
export function PrintCentre({ ui, pkg, baseUrl }: PrintCentreProps) {
  return (
    <div className="print-centre">
      <div className="print-centre__scroll">
        <header className="print-centre__header">
          <h1 className="print-centre__heading">{ui.heading}</h1>
          <p className="print-centre__subheading">{ui.subheading}</p>
        </header>

        <a
          className="print-centre__zip-card"
          href={`${baseUrl}/${pkg.zipBaseName}.zip`}
          download
        >
          <span className="print-centre__zip-heading">{ui.zipHeading}</span>
          <span className="print-centre__zip-description">{ui.zipDescription}</span>
          <span className="print-centre__zip-button">{ui.zipButtonLabel}</span>
        </a>

        <ul className="print-centre__list">
          {pkg.folders.map((folder) => (
            <li key={folder.id} className="print-centre__folder">
              <p className="print-centre__folder-title">{folder.title}</p>
              <p className="print-centre__folder-description">{folder.description}</p>
              <div className="print-centre__folder-items">
                {folder.items.map((item) => (
                  <a
                    key={item.fileName}
                    className="print-centre__item"
                    href={`${baseUrl}/${folder.id}/${item.fileName}`}
                    download
                  >
                    <span className="print-centre__item-name">{item.fileName}</span>
                    <span className="print-centre__item-download">{ui.downloadLabel}</span>
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
