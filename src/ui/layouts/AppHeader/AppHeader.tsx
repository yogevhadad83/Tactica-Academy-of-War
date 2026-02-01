import styles from './AppHeader.module.css';

const headerSrc =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL)
    ? `${(import.meta as any).env.BASE_URL}images/tacttica-header.png`
    : '/images/tacttica-header.png';

const AppHeader = () => {
  return (
    <header className={styles.header} aria-label="Tactica header">
      <img
        className={styles.img}
        src={headerSrc}
        alt=""
        draggable={false}
      />
    </header>
  );
};

export default AppHeader;
