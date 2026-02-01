import type { ReactNode } from 'react';
import styles from './AcademyBackground.module.css';

interface AcademyBackgroundProps {
  children: ReactNode;
}

export const AcademyBackground = ({ children }: AcademyBackgroundProps) => {
  return (
    <div className={styles.root}>
      <div className={styles.bg} aria-hidden="true" />
      <div className={styles.content}>{children}</div>
    </div>
  );
};
