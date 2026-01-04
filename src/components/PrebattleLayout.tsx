import type { ReactNode } from 'react';
import '../pages/PvpMatch.css';

type BannerProps = {
  kicker?: string;
  title: string;
  subtitle?: string;
};

interface PrebattleLayoutProps {
  banner: BannerProps;
  meta?: ReactNode;
  alerts?: ReactNode;
  stage: ReactNode;
  control: ReactNode;
  footer?: ReactNode;
  footerNote?: ReactNode;
}

const PrebattleLayout = ({ banner, meta, alerts, stage, control, footer, footerNote }: PrebattleLayoutProps) => (
  <div className="prebattle-shell">
    <div className="prebattle-banner">
      {banner.kicker ? <p className="banner-kicker">{banner.kicker}</p> : null}
      <h1>{banner.title}</h1>
      {banner.subtitle ? <p>{banner.subtitle}</p> : null}
    </div>

    {meta ? <div className="prebattle-meta-row">{meta}</div> : null}
    {alerts}

    <div className="prebattle-stage-section">
      <div className="prebattle-board-wrapper">{stage}</div>
      <aside className="prebattle-control-card">{control}</aside>
    </div>

    {footer ? <div className="prebattle-footer">{footer}</div> : null}
    {footerNote ? <p className="prebattle-footer-note">{footerNote}</p> : null}
  </div>
);

export default PrebattleLayout;
