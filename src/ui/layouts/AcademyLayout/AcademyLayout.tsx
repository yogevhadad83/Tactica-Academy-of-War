import type { ReactNode } from 'react';
import { AcademyBackground } from '../AcademyBackground';
import { TopHud } from '../../hud/TopHud/TopHud';
import styles from './AcademyLayout.module.css';

interface AcademyLayoutProps {
  children: ReactNode;
}

export const AcademyLayout = ({ children }: AcademyLayoutProps) => {
  return (
    <AcademyBackground>
      <TopHud />
      <main className={styles.main}>{children}</main>
    </AcademyBackground>
  );
};
