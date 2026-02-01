import styles from './TopHud.module.css';
import { ProfileCluster } from '../ProfileCluster/ProfileCluster';
import { TitlePlaque } from '../TitlePlaque/TitlePlaque';
import { ResourceCluster } from '../ResourceCluster/ResourceCluster';

export const TopHud = () => {
  return (
    <div className={styles.hud}>
      <div className={styles.left}>
        <ProfileCluster />
      </div>
      <div className={styles.center}>
        <TitlePlaque />
      </div>
      <div className={styles.right}>
        <ResourceCluster />
      </div>
    </div>
  );
};
