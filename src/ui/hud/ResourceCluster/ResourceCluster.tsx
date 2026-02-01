import styles from './ResourceCluster.module.css';
import { ResourceDisplay } from '../ResourceDisplay/ResourceDisplay';
import { IconButton } from '../IconButton/IconButton';

export const ResourceCluster = () => {
  return (
    <div className={styles.cluster}>
      <ResourceDisplay type="credits" value={50} />
      <ResourceDisplay type="supply" value={0} />
      <div className={styles.actions}>
        <IconButton icon="settings" onClick={() => console.log('Settings clicked')} />
        <IconButton icon="help" onClick={() => console.log('Help clicked')} />
      </div>
    </div>
  );
};
