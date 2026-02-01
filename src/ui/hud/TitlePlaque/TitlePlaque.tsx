import styles from './TitlePlaque.module.css';

export const TitlePlaque = () => {
  return (
    <div className={styles.plaque}>
      <img
        className={styles.headerImage}
        src="/images/hud/tactica-header.png"
        alt="Tactica: Academy of War"
        draggable={false}
      />
    </div>
  );
};
