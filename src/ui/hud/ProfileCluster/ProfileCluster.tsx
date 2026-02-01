import styles from './ProfileCluster.module.css';

const DefaultAvatarIcon = () => (
  <svg viewBox="0 0 48 48" className={styles.avatarIcon}>
    <circle cx="24" cy="24" r="24" fill="rgba(20,35,50,0.9)" />
    <path d="M24 12a6 6 0 016 6 6 6 0 01-6 6 6 6 0 01-6-6 6 6 0 016-6zm0 16c8 0 12 4 12 8v4H12v-4c0-4 4-8 12-8z" fill="rgba(91,159,217,0.7)" />
  </svg>
);

export const ProfileCluster = () => {
  const name = 'YOYO';
  const rankLabel = 'FRESHMAN';
  const avatarUrl = null;

  return (
    <div className={styles.root}>
      <img
        className={styles.frame}
        src="/images/hud/profile-frame.png"
        alt=""
        draggable={false}
      />
      <div className={styles.overlay}>
        <div className={styles.avatar}>
          {avatarUrl ? <img src={avatarUrl} alt={name} /> : <DefaultAvatarIcon />}
        </div>
        <div className={styles.meta}>
          <div className={styles.name}>{name}</div>
          <div className={styles.rank}>{rankLabel}</div>
        </div>
      </div>
    </div>
  );
};
